// src/services/db/articles.ts

import { v4 as uuidv4 } from "uuid";
import { articlesDb, operationsQueueDb } from "./config"; // Import the initialized DB instances
// Removed unused import: import { removeDuplicateArticles } from "./duplicates";
import type { Article, ArticleCategory, QueuedOperation } from "./types"; // Import necessary types
import { executeWithRetry } from "./utils";
// Removed redundant re-export of removeDuplicateArticles
// Helper to infer category from type
const inferCategoryFromType = (type: Article["type"]): ArticleCategory => {
	switch (type) {
		case "pdf":
			return "pdf";
		case "epub":
			return "book"; // Assuming EPUBs are books
		case "article":
			return "article";
		// 'note' type falls through to default
		default:
			return "other";
	}
};

/**
 * Saves a new article or updates an existing one.
 * Assumes necessary fields like siteName and estimatedReadTime are pre-calculated.
 * Handles conflicts by fetching the latest revision and retrying.
 *
 * @param article - The article data to save. Must include all required fields.
 *                  If updating, provide `_id` and the latest `_rev`.
 *                  If creating, `_id` can be omitted (will be generated).
 * @returns The saved or updated article document with its latest revision.
 * @throws Error if saving fails after retries.
 */
export async function saveArticle(
	article: Omit<Article, "_id" | "_rev"> & { _id?: string; _rev?: string },
): Promise<Article> {
	return executeWithRetry(async () => {
		const isUpdate = !!article._id && !!article._rev;
		const docId = article._id || `article_${uuidv4()}`;

		// Prepare the document, ensuring all required fields are present
		const docToSave: Article = {
			...article,
			_id: docId,
			savedAt: article.savedAt || Date.now(),
			isRead: article.isRead ?? false,
			favorite: article.favorite ?? false,
			tags: article.tags || [],
			type: article.type || "article",
			version: isUpdate ? (article.version || 0) + 1 : 1, // Increment version on update, init to 1 on create
			deletedAt: undefined, // Ensure deletedAt is not set on save/update
			// Ensure _rev is only included if it's an update attempt
			...(isUpdate && article._rev ? { _rev: article._rev } : {}),
			// Set category: prioritize explicit, then infer, then default to 'other'
			category:
				article.category ?? inferCategoryFromType(article.type || "article"),
		};

		// Validate essential fields before saving
		if (!docToSave.title || !docToSave.url || !docToSave.content) {
			console.error("Article missing essential fields:", docToSave);
			throw new Error("Cannot save article: Missing title, url, or content.");
		}

		// Reverted: Rely on PouchDB's put() conflict handling via executeWithRetry
		// The explicit check before put caused issues with tests.

		try {
			console.log(
				`${isUpdate ? "Updating" : "Creating"} article ${docId} locally...`,
			);
			const response = await articlesDb.put(docToSave);

			if (response.ok) {
				console.log(
					`Article ${docId} ${
						isUpdate ? "updated" : "created"
					} successfully with rev ${response.rev}`,
				);
				// Return the complete document with the new revision
				return { ...docToSave, _rev: response.rev };
			}
			// Should not happen if put doesn't throw, but handle defensively
			throw new Error(
				`PouchDB put operation for ${docId} failed silently. Response: ${JSON.stringify(
					response,
				)}`,
			);
		} catch (error: any) {
			// Handle conflicts specifically for updates
			if (error.name === "conflict") {
				// Removed the initial warning log from here
				try {
					// Fetch the latest revision
					const latestDoc = await articlesDb.get(docId);
					// Merge changes onto the latest revision
					// Be careful here: naive merge might overwrite intermediate changes.
					// A more robust strategy might involve comparing fields or using a merge function.
					// Refined merge strategy: Prioritize incoming content, preserve local state.
					const latestArticle = latestDoc as Article; // Cast for type safety
					// --- Conflict Resolution Logic with Versioning ---
					// Decide winner based on version number. If equal, use timestamp (optional).
					// For simplicity here, assume incoming 'article' is from cloud sync.
					// A more robust conflict resolver might be needed for multi-client scenarios.
					const incomingVersion = docToSave.version || 0; // Use version from the document intended for saving
					const localVersion = latestArticle.version || 0;

					let docToRetry: Article;

					if (incomingVersion >= localVersion) {
						// Incoming (cloud) version is newer or same, overwrite local state but keep essential local fields
						console.log(
							`Conflict: Incoming version (${incomingVersion}) >= local (${localVersion}). Applying incoming changes.`,
						);
						docToRetry = {
							...latestArticle, // Start with latest local doc
							...docToSave, // Overwrite with incoming fields
							_id: latestArticle._id, // Ensure correct ID
							_rev: latestArticle._rev, // Use latest rev for PouchDB update
							userId: latestArticle.userId, // Preserve original userId
							version: incomingVersion, // Use incoming version
							// Ensure local-only states like readAt, scrollPosition are potentially preserved if desired
							readAt: docToSave.readAt ?? latestArticle.readAt,
							scrollPosition:
								docToSave.scrollPosition ?? latestArticle.scrollPosition,
							// Ensure 'deletedAt' is cleared if incoming data represents an undelete/update
							deletedAt: undefined,
						};
					} else {
						// Local version is newer, potentially keep local changes.
						// For now, log this scenario. More complex merging could be added.
						console.warn(
							`Conflict: Local version (${localVersion}) > incoming (${incomingVersion}). Keeping local version for article ${docId}.`,
						);
						// To keep local, we essentially do nothing and let the initial put fail
						// Or we could re-put the existing localDoc with incremented version again? Risky.
						// Let's throw the conflict error to signal manual intervention or a different strategy needed.
						throw error; // Rethrow original conflict error if local is newer for now
						// --- Alternative: Force update with local data + incremented version ---
						// docToRetry = {
						// 	...latestArticle,
						// 	version: localVersion + 1, // Increment local version again
						// };
					}
					// --- End Conflict Resolution Logic ---

					const retryResponse = await articlesDb.put(docToRetry);
					if (retryResponse.ok) {
						console.log(
							`Article ${docId} saved successfully after conflict retry with rev ${retryResponse.rev}`,
						);
						return { ...docToRetry, _rev: retryResponse.rev };
					}
					throw new Error(
						`Retry save failed for ${docId} after conflict. Response: ${JSON.stringify(
							retryResponse,
						)}`,
					);
				} catch (retryError) {
					// Log the original conflict warning ONLY if the retry fails
					// The '+' seems to be a typo/artifact, removing it.
					console.warn(
						`Conflict saving article ${docId}. Initial error:`,
						error,
					);
					console.error(
						`Error saving article ${docId} after conflict retry:`,
						retryError,
					);
					throw retryError; // Throw the error from the retry attempt
				}
			} else {
				// Handle other errors
				console.error(`Error saving article ${docId}:`, error);
				throw error; // Rethrow other errors
			}
		}
	}); // executeWithRetry handles transient errors
}

/**
 * Saves multiple articles in bulk. Handles both creating new articles and updating existing ones.
 * Fetches existing documents first to handle conflicts and merge data.
 * Checks for existing articles with the same URL to prevent duplicates.
 *
 * @param articlesToSave - An array of article objects to save.
 * @returns A promise resolving to an array of results, one for each input article.
 *          Success results contain { ok: true, id: string, rev: string }.
 *          Error results contain { error: true, id: string, message: string, name?: string, status?: number }.
 * @throws Error if the bulk operation itself fails unexpectedly.
 */
export async function bulkSaveArticles(
	articlesToSave: (Omit<Article, "_id" | "_rev"> & {
		_id?: string;
		_rev?: string;
	})[],
): Promise<(PouchDB.Core.Response | PouchDB.Core.Error)[]> {
	console.log(`Attempting to bulk save ${articlesToSave.length} articles...`);

	return executeWithRetry(async () => {
		// 1. Prepare documents and identify potential updates
		const docsToProcess: (Article & { _id: string })[] = [];
		const potentialUpdateIds: string[] = [];
		// const urlsToCheck: string[] = []; // REMOVE: Unused variable

		for (const article of articlesToSave) {
			const docId = article._id || `article_${uuidv4()}`;
			// Basic validation
			if (!article.title || !article.url || !article.content) {
				console.warn(
					`Skipping bulk save for article (ID: ${docId}) due to missing essential fields.`,
				);
				// Optionally, return an error object for this specific article later
				continue;
			}

			// Prepare doc, initialize version for new docs
			// const isPotentialUpdate = !!article._id; // Removed unused variable
			const preparedDoc: Article & { _id: string } = {
				...article,
				_id: docId,
				savedAt: article.savedAt || Date.now(),
				isRead: article.isRead ?? false,
				favorite: article.favorite ?? false,
				tags: article.tags || [],
				type: article.type || "article",
				category:
					article.category ?? inferCategoryFromType(article.type || "article"),
				version: article.version || 1, // Use incoming version or default to 1 for new
				deletedAt: undefined, // Ensure deletedAt is not set on bulk save
				// _rev will be added later if it's an update based on existingDocsMap
			};
			docsToProcess.push(preparedDoc);

			if (article._id) {
				potentialUpdateIds.push(article._id);
			}

			// Add URL to the list of URLs to check for duplicates
			// REMOVE: Unused logic
			// if (article.url) {
			// 	urlsToCheck.push(article.url);
			// }
		}

		// 2. Fetch existing documents for potential updates by ID
		const existingDocsMap = new Map<string, Article>();
		if (potentialUpdateIds.length > 0) {
			try {
				const fetchResponse = await articlesDb.allDocs<Article>({
					keys: potentialUpdateIds,
					include_docs: true,
				});
				for (const row of fetchResponse.rows) {
					// Correctly check for errors before accessing doc/id
					if ("error" in row) {
						// Log or handle the error if needed, e.g., document not found
						// console.warn(`Document with key ${row.key} not found or error: ${row.error}`);
					} else if (row.doc) {
						// Only access doc and id if there's no error and doc exists
						existingDocsMap.set(row.id, row.doc);
					}
				}
				console.log(
					`Fetched ${existingDocsMap.size} existing documents for merging by ID.`,
				);
			} catch (fetchError) {
				console.error(
					"Error fetching existing documents for bulk update:",
					fetchError,
				);
				// Decide how to proceed: maybe fail the whole batch or try saving without merging?
				// For now, let's proceed but updates might overwrite without merging.
			}
		}

		// Resolved bulkSaveArticles logic: Kept version comparison logic from backup-staging-local
		// 3. Merge and prepare final documents for bulkDocs
		const finalDocsToSave: Article[] = docsToProcess.map((doc) => {
			let resultDoc: Article; // Define result variable outside if/else
			const existingDoc = existingDocsMap.get(doc._id);

			if (existingDoc) {
				// --- Handle Existing Document (Merge/Update) ---
				const incomingVersion = doc.version || 0;
				const localVersion = existingDoc.version || 0;

				if (incomingVersion >= localVersion) {
					// Incoming (cloud) version is newer or same
					console.log(
						`Bulk Merge: Incoming version (${incomingVersion}) >= local (${localVersion}) for ${existingDoc._id}. Applying incoming.`,
					);
					resultDoc = {
						// Assign to resultDoc
						...existingDoc,
						...doc,
						_id: existingDoc._id,
						_rev: existingDoc._rev,
						userId: doc.userId ?? existingDoc.userId,
						version: incomingVersion,
						deletedAt: undefined,
					};
				} else {
					// Local version is newer, keep local
					console.warn(
						`Bulk Merge Conflict: Local version (${localVersion}) > incoming (${incomingVersion}) for ${existingDoc._id}. Keeping local document.`,
					);
					// Return the existing local document unmodified for the bulkDocs operation.
					// PouchDB's bulkDocs will likely treat this as a no-op or update the revision based on its internal handling.
					// This avoids throwing an error and allows other documents in the batch to proceed.
					resultDoc = {
						...existingDoc,
					};
				}
			} else {
				// --- Handle New Document ---
				const { _rev, ...newDoc } = doc; // Remove potential _rev
				resultDoc = { ...newDoc, version: newDoc.version || 1 } as Article; // Assign to resultDoc, ensure version
			}
			return resultDoc; // Single return point for map callback
		});

		// 4. Execute bulkDocs
		if (finalDocsToSave.length === 0) {
			console.log("No valid articles to bulk save.");
			return [];
		}

		try {
			console.log(
				`Executing bulkDocs for ${finalDocsToSave.length} articles...`,
			);
			const response = await articlesDb.bulkDocs(finalDocsToSave);
			console.log("bulkDocs operation completed.");

			// Log errors from the response
			const errors = response.filter(
				(
					res: PouchDB.Core.Response | PouchDB.Core.Error,
				): res is PouchDB.Core.Error => "error" in res && !!res.error,
			);
			if (errors.length > 0) {
				console.error(
					`Errors occurred during bulk save for ${errors.length} articles:`,
				);
				for (const err of errors) {
					console.error(
						` - ID: ${err.id}, Status: ${err.status}, Name: ${err.name}, Message: ${err.message}`,
					);
				}
			}

			return response;
		} catch (bulkError) {
			console.error("Fatal error during bulkDocs execution:", bulkError);
			throw bulkError; // Rethrow fatal errors
		}
	});
}

/**
 * Retrieves a single article by its ID.
 * @param id - The _id of the article to retrieve.
 * @returns The article document or null if not found or an error occurs.
 */
export async function getArticle(id: string): Promise<Article | null> {
	try {
		// Use executeWithRetry for potential transient read errors
		return await executeWithRetry(async () => {
			console.log(`Attempting to get article ${id}`);
			const article = await articlesDb.get(id);
			console.log(`Successfully retrieved article ${id}`);
			return article;
		});
	} catch (error: any) {
		if (error.name === "not_found") {
			console.log(`Article ${id} not found.`);
		} else {
			console.error(`Error getting article ${id}:`, error);
		}
		return null;
	}
}

/**
 * Updates specific fields of an existing article.
 * Requires the article's _id and latest _rev.
 * Fetches the current document first to ensure updates are applied correctly.
 *
 * @param articleUpdate - An object containing the _id, _rev, and fields to update.
 * @returns The fully updated article document with the new revision.
 * @throws Error if the update fails (e.g., conflict, document not found).
 */
export async function updateArticle(
	articleUpdate: Partial<Article> & { _id: string; _rev: string },
): Promise<Article> {
	return executeWithRetry(async () => {
		try {
			console.log(`Attempting to update article ${articleUpdate._id}`);
			// Fetch the existing document using the provided _rev for safety,
			// though PouchDB's put handles the revision check internally.
			// Getting first ensures we merge onto the correct base.
			const existingArticle = await articlesDb.get(articleUpdate._id, {
				rev: articleUpdate._rev,
			});

			// Merge the updates onto the existing document
			// Merge updates and increment version
			const updatedArticle: Article = {
				...existingArticle,
				...articleUpdate, // Apply partial updates
				_id: articleUpdate._id, // Ensure ID and Rev are correct for PouchDB
				_rev: articleUpdate._rev,
				version: (existingArticle.version || 0) + 1, // Increment version
				// Update category logic (remains the same)
				category:
					articleUpdate.category !== undefined
						? articleUpdate.category
						: articleUpdate.type !== undefined
							? inferCategoryFromType(articleUpdate.type)
							: existingArticle.category,
				deletedAt: undefined, // Ensure deletedAt is not set on update
			};

			const response = await articlesDb.put(updatedArticle);

			if (response.ok) {
				console.log(
					`Article ${updatedArticle._id} updated successfully to rev ${response.rev}`,
				);
				// Return the merged document with the new revision
				return { ...updatedArticle, _rev: response.rev };
			}
			throw new Error(
				`Failed to update article ${updatedArticle._id}. Response: ${JSON.stringify(
					response,
				)}`,
			);
		} catch (error: any) {
			console.error(`Error updating article ${articleUpdate._id}:`, error);
			// Handle conflicts or other errors
			if (error.name === "conflict") {
				console.warn(
					`Conflict detected while updating article ${articleUpdate._id}. The provided _rev might be outdated.`,
				);
				// Suggest fetching the latest version and retrying the update.
			}
			throw error; // Rethrow the error for the caller to handle
		}
	});
}

/**
 * Soft deletes an article locally and queues the delete operation for cloud sync.
 *
 * @param id - The _id of the article to soft delete.
 * @returns True if soft deletion and queuing were successful, false otherwise.
 * @throws Error if fetching the article or saving the soft delete fails.
 */
export async function deleteArticle(id: string): Promise<boolean> {
	console.log(`Attempting to soft delete article ${id} locally...`);
	try {
		// 1. Fetch the latest version of the article
		const article = await articlesDb.get(id);

		// 2. Prepare the soft delete update
		const updatedArticle: Article = {
			...article,
			deletedAt: Date.now(),
			version: (article.version || 0) + 1, // Increment version
		};

		// 3. Save the soft delete update locally
		const response = await articlesDb.put(updatedArticle);
		if (!response.ok) {
			throw new Error(
				`Failed to save soft delete for article ${id}. Response: ${JSON.stringify(
					response,
				)}`,
			);
		}
		console.log(`Article ${id} soft deleted locally with rev ${response.rev}.`);

		// 4. Queue the delete operation for cloud sync
		const queueOp: QueuedOperation = {
			_id: `queue_delete_${id}_${Date.now()}`, // Unique ID for the queue item
			type: "delete",
			docId: id,
			timestamp: Date.now(),
			retryCount: 0,
		};
		await operationsQueueDb.put(queueOp);
		console.log(`Delete operation for article ${id} queued for cloud sync.`);

		return true;
	} catch (error: any) {
		if (error.name === "not_found") {
			console.warn(`Article ${id} not found for deletion.`);
			// If not found locally, maybe it was already deleted? Or never existed.
			// Consider if we still need to queue a delete for the cloud in this case.
			// For now, return false as the local operation didn't proceed as expected.
			return false;
		}
		console.error(`Error soft deleting article ${id}:`, error);
		throw error; // Rethrow other errors
	}
}

/**
 * Retrieves all articles, optionally filtered and sorted.
 * Prefers using `allDocs` for reliability and filters/sorts in memory.
 *
 * @param options - Optional filtering and sorting parameters.
 * @param options.limit - Max number of articles to return.
 * @param options.skip - Number of articles to skip (for pagination).
 * @param options.isRead - Filter by read status.
 * @param options.favorite - Filter by favorite status.
 * @param options.tag - Filter by a specific tag ID.
 * @param options.sortBy - Field to sort by ('savedAt', 'title', 'readAt'). Defaults to 'savedAt'.
 * @param options.sortDirection - Sort direction ('asc' or 'desc'). Defaults to 'desc'.
 * @param options.userIds - Filter by one or more user IDs. If provided, only articles matching these IDs are returned.
 * @returns A promise resolving to an array of Article documents. Returns empty array on error.
 */
export async function getAllArticles(
	// Corrected signature: Parameter is non-optional but has a default value
	options: {
		limit?: number;
		skip?: number;
		isRead?: boolean;
		favorite?: boolean;
		tag?: string;
		sortBy?: "savedAt" | "title" | "readAt" | "version";
		sortDirection?: "asc" | "desc";
		userIds?: string[];
		includeDeleted?: boolean;
	} = {},
): Promise<Article[]> {
	return executeWithRetry(async () => {
		try {
			console.log("Getting all articles with options:", options);
			// Fetch all documents first
			const allDocsResponse = await articlesDb.allDocs<Article>({
				include_docs: true,
			});

			// Filter out rows that don't have a doc or have an error, and assert the type
			// PouchDB's ExistingDocument requires _rev, our Article makes it optional.
			// Since include_docs: true guarantees _rev for existing docs, we can filter and cast.
			// We filter out rows where the doc is missing (e.g., deleted docs).
			let articles: Article[] = allDocsResponse.rows
				.filter(
					(row: PouchDB.Core.AllDocsResponse<Article>["rows"][number]) =>
						!!row.doc,
				) // Ensure the document exists for the row
				.map(
					(row: PouchDB.Core.AllDocsResponse<Article>["rows"][number]) =>
						row.doc as Article,
				); // Map to the doc and cast to Article

			console.log(
				`Retrieved ${articles.length} total articles. Applying filters...`,
			);

			// --- In-Memory Filtering ---
			// User ID filter
			if (options?.userIds && options.userIds.length > 0) {
				const userIdsSet = new Set(options.userIds);
				articles = articles.filter(
					// No longer possibly undefined
					(doc) => doc.userId && userIdsSet.has(doc.userId),
				);
				console.log(
					`After userId filter (${options.userIds.join(
						", ",
					)}): ${articles.length} articles`,
				);
			}

			// Filter out soft-deleted articles unless requested
			if (!options.includeDeleted) {
				articles = articles.filter((doc) => !doc.deletedAt);
				console.log(
					`After includeDeleted filter (false): ${articles.length} articles`,
				);
			} else {
				console.log(
					`Skipping includeDeleted filter (true): ${articles.length} articles remain`,
				);
			}

			// isRead filter
			if (options?.isRead !== undefined) {
				articles = articles.filter((doc) => doc.isRead === options.isRead); // No longer possibly undefined
				console.log(
					`After isRead filter (${options.isRead}): ${articles.length} articles`,
				);
			}

			// favorite filter
			if (options?.favorite !== undefined) {
				articles = articles.filter((doc) => doc.favorite === options.favorite); // No longer possibly undefined
				console.log(
					`After favorite filter (${options.favorite}): ${articles.length} articles`,
				);
			}

			// tag filter
			if (options?.tag) {
				articles = articles.filter(
					(
						doc, // No longer possibly undefined
					) => doc.tags?.includes(options.tag as string),
				);
				console.log(
					`After tag filter (${options.tag}): ${articles.length} articles`,
				);
			}

			// --- In-Memory Sorting ---
			const sortField = options?.sortBy || "savedAt";
			const sortDirection = options?.sortDirection || "desc";

			articles.sort((a, b) => {
				// a and b are no longer possibly undefined
				// Handle potential undefined values during sort
				const aVal = a[sortField as keyof Article];
				const bVal = b[sortField as keyof Article];

				// Basic comparison, prioritizing defined values
				if (aVal === undefined && bVal === undefined) return 0;
				if (aVal === undefined) return sortDirection === "asc" ? 1 : -1; // Undefined comes last in asc, first in desc
				if (bVal === undefined) return sortDirection === "asc" ? -1 : 1; // Undefined comes last in asc, first in desc

				// Standard comparison
				if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
				if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
				return 0;
			});
			console.log(`Sorted articles by ${sortField} (${sortDirection})`);

			// --- Pagination ---
			const skip = options?.skip || 0;
			const limit = options?.limit;
			const pagedArticles = limit
				? articles.slice(skip, skip + limit)
				: articles.slice(skip);

			console.log(
				`Returning ${pagedArticles.length} articles (skipped ${skip}, limit ${
					limit ?? "none"
				})`,
			);
			return pagedArticles;
		} catch (error) {
			console.error("Error getting all articles:", error);
			// Return empty array on error to prevent UI crashes
			return [];
		}
	});
}

// removeDuplicateArticles function moved to ./duplicates.ts
// We import it at the top of the file and re-export it there
