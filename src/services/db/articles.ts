// src/services/db/articles.ts

import { v4 as uuidv4 } from "uuid";
import { articlesDb } from "./config"; // Import the initialized DB instance
import type { Article } from "./types";
import { executeWithRetry } from "./utils";

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
			// Ensure required fields have defaults if not provided, although caller should provide them
			savedAt: article.savedAt || Date.now(),
			isRead: article.isRead ?? false,
			favorite: article.favorite ?? false,
			tags: article.tags || [],
			type: article.type || "article",
			// Ensure _rev is only included if it's an update attempt
			...(isUpdate && article._rev ? { _rev: article._rev } : {}),
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
					const docToRetry: Article = {
						// Base fields from latestDoc
						_id: latestArticle._id, // Use ID from latest doc (should match docId)
						_rev: latestArticle._rev, // CRITICAL: Use latest rev
						userId: latestArticle.userId, // Keep existing userId from local doc

						// Fields primarily from incoming 'article' (source of truth for content)
						// Use nullish coalescing (??) to fall back to latestDoc value if incoming is null/undefined
						title: article.title ?? latestArticle.title,
						url: article.url ?? latestArticle.url,
						// Content should exist due to filtering in useArticleSync, but fallback just in case
						content: article.content ?? latestArticle.content,
						excerpt: article.excerpt ?? latestArticle.excerpt,
						htmlContent: article.htmlContent ?? latestArticle.htmlContent,
						type: article.type ?? latestArticle.type,
						savedAt: article.savedAt ?? latestArticle.savedAt, // Usually from cloud

						// Fields primarily from 'latestDoc' (local state) unless overridden by incoming 'article'
						status: article.status ?? latestArticle.status ?? "inbox", // Add status merge logic
						isRead: article.isRead ?? latestArticle.isRead,
						favorite: article.favorite ?? latestArticle.favorite,
						tags: article.tags ?? latestArticle.tags,
						readAt: article.readAt ?? latestArticle.readAt,
						scrollPosition:
							article.scrollPosition ?? latestArticle.scrollPosition,

						// Other optional fields, prioritize incoming if present
						siteName: article.siteName ?? latestArticle.siteName,
						author: article.author ?? latestArticle.author,
						publishedDate: article.publishedDate ?? latestArticle.publishedDate, // Corrected typo
						estimatedReadTime:
							article.estimatedReadTime ?? latestArticle.estimatedReadTime,
						coverImage: article.coverImage ?? latestArticle.coverImage,
						language: article.language ?? latestArticle.language,
						// Ensure file-related fields are preserved if they exist on latestArticle
						fileData: article.fileData ?? latestArticle.fileData,
						fileName: article.fileName ?? latestArticle.fileName,
						fileSize: article.fileSize ?? latestArticle.fileSize,
						pageCount: article.pageCount ?? latestArticle.pageCount,
					};
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
					+console.warn(
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
			const updatedArticle: Article = {
				...existingArticle,
				...articleUpdate,
				// Ensure _id and _rev from the update object are used for the put operation
				_id: articleUpdate._id,
				_rev: articleUpdate._rev,
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
 * Deletes an article from the database.
 * Requires the article's _id and latest _rev.
 *
 * @param id - The _id of the article to delete.
 * @param rev - The latest _rev of the article to delete.
 * @returns True if deletion was successful, false otherwise.
 * @throws Error if deletion fails (e.g., conflict, document not found).
 */
export async function deleteArticle(id: string, rev: string): Promise<boolean> {
	try {
		// Use executeWithRetry for potential transient errors during delete
		return await executeWithRetry(async () => {
			console.log(`Attempting to delete article ${id} with rev ${rev}`);
			const response = await articlesDb.remove(id, rev);
			if (response.ok) {
				console.log(`Article ${id} deleted successfully.`);
				return true;
			}
			// This part should ideally not be reached if remove throws on failure
			console.error(
				`Failed to delete article ${id}. Response: ${JSON.stringify(response)}`,
			);
			return false;
		});
	} catch (error: any) {
		console.error(`Error deleting article ${id}:`, error);
		// Rethrow the error for the caller to potentially handle (e.g., notify user)
		throw error;
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
export async function getAllArticles(options?: {
	limit?: number;
	skip?: number;
	isRead?: boolean;
	favorite?: boolean;
	tag?: string;
	sortBy?: "savedAt" | "title" | "readAt";
	sortDirection?: "asc" | "desc";
	userIds?: string[]; // Changed from userId/userIds to just userIds for clarity
}): Promise<Article[]> {
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
				.filter((row) => !!row.doc) // Ensure the document exists for the row
				.map((row) => row.doc as Article); // Map to the doc and cast to Article

			console.log(
				`Retrieved ${articles.length} total articles. Applying filters...`,
			);

			// --- In-Memory Filtering --- (Now 'articles' is guaranteed Article[])
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

/**
 * Identifies and removes duplicate articles based on their URL, keeping the one with the lowest _id.
 * @returns The number of duplicate articles removed.
 * @throws Error if fetching or deleting fails.
 */
export async function removeDuplicateArticles(): Promise<number> {
	console.log("Starting duplicate article removal process...");
	return executeWithRetry(async () => {
		try {
			// 1. Fetch all articles
			const allDocsResponse = await articlesDb.allDocs<Article>({
				include_docs: true,
			});

			const articles: Article[] = allDocsResponse.rows
				.filter((row) => !!row.doc && row.id.startsWith("article_")) // Ensure doc exists and is an article
				.map((row) => row.doc as Article);

			console.log(
				`Fetched ${articles.length} articles to check for duplicates.`,
			);

			// 2. Group articles by URL
			const articlesByUrl: Record<string, Article[]> = {};
			for (const article of articles) {
				if (!article.url) {
					console.warn(`Article ${article._id} missing URL, skipping.`);
					continue; // Skip articles without a URL
				}
				if (!articlesByUrl[article.url]) {
					articlesByUrl[article.url] = [];
				}
				articlesByUrl[article.url].push(article);
			}

			// 3. Identify duplicates and prepare for deletion
			const docsToDelete: (Article & { _deleted: true })[] = [];
			let duplicateCount = 0;

			for (const url in articlesByUrl) {
				const group = articlesByUrl[url];
				if (group.length > 1) {
					console.log(`Found ${group.length} articles for URL: ${url}`);
					// Sort by _id to easily find the one to keep (lowest _id)
					group.sort((a, b) => a._id.localeCompare(b._id));

					const articleToKeep = group[0];
					console.log(`Keeping article: ${articleToKeep._id}`);

					// Mark others for deletion
					for (let i = 1; i < group.length; i++) {
						const articleToDelete = group[i];
						console.log(`Marking article for deletion: ${articleToDelete._id}`);
						// Ensure _rev is present for deletion
						if (!articleToDelete._rev) {
							console.warn(
								`Article ${articleToDelete._id} is missing _rev, cannot delete. Skipping.`,
							);
							continue;
						}
						docsToDelete.push({
							...articleToDelete,
							_deleted: true,
						});
						duplicateCount++;
					}
				}
			}

			// 4. Perform bulk delete
			if (docsToDelete.length > 0) {
				console.log(
					`Attempting to delete ${docsToDelete.length} duplicate articles...`,
				);
				const bulkResponse = await articlesDb.bulkDocs(docsToDelete);

				// Check response for errors
				// PouchDB bulkDocs response items are Response or Error
				// Errors have 'error: true', success have 'ok: true'
				const errors = bulkResponse.filter(
					(res): res is PouchDB.Core.Error => "error" in res && !!res.error,
				);
				if (errors.length > 0) {
					console.error("Errors occurred during bulk deletion:", errors);
					// Attempt to report specific errors using for...of
					for (const err of errors) {
						// Safely access error details
						const message = err.message || err.reason || "Unknown error";
						console.error(`Failed to delete ${err.id}: ${message}`);
					} // End for...of loop
					// Decide if partial success is acceptable or if we should throw
					// Throwing an error seems appropriate if any deletion failed.
					throw new Error(
						`Failed to delete ${errors.length} out of ${docsToDelete.length} duplicates. Check logs for details.`,
					);
				}

				const successfulDeletions = docsToDelete.length - errors.length;
				console.log(
					`Successfully deleted ${successfulDeletions} duplicate articles.`,
				);
				return successfulDeletions; // Return count of successfully deleted
			}

			console.log("No duplicate articles found to delete.");
			return 0; // No duplicates found or deleted
		} catch (error) {
			console.error("Error during duplicate article removal:", error);
			throw error; // Re-throw the error for the caller
		}
	});
}
