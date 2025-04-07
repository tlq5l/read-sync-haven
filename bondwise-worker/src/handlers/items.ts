// bondwise-worker/src/handlers/items.ts

import type { Env, WorkerArticle } from "../types";
import { createUserItemKey, errorResponse, jsonResponse } from "../utils";

// Helper function to estimate read time (words per minute)
function calculateReadTime(content: string | undefined): number | undefined {
	if (!content) {
		return undefined;
	}
	// Basic word count - strips HTML tags, might not be perfect for complex HTML
	const textContent = content.replace(/<[^>]*>/g, " "); // Strip HTML tags
	const wordCount = textContent.split(/\s+/).filter(Boolean).length;
	if (wordCount === 0) {
		return 1; // Minimum 1 minute
	}
	const readTime = Math.ceil(wordCount / 200); // Assume 200 WPM
	return readTime === 0 ? 1 : readTime;
}

/**
 * Handles GET /items requests. Lists items for the authenticated user.
 */
export async function handleListItems(
	request: Request,
	env: Env,
	userId: string,
): Promise<Response> {
	const url = new URL(request.url);
	const email = url.searchParams.get("email"); // For fallback lookup
	console.log(
		`Listing items for user: ${userId} (Fallback email: ${email || "N/A"})`,
	);
	try {
		const userItemsPromise = env.SAVED_ITEMS_KV.list({ prefix: `${userId}:` });
		const emailItemsPromise = email
			? env.SAVED_ITEMS_KV.list({ prefix: `${email}:` })
			: Promise.resolve(null);

		const [userListResult, emailListResult] = await Promise.all([
			userItemsPromise,
			emailItemsPromise,
		]);

		const combinedKeys = new Map<string, KVNamespaceListKey<unknown>>();
		// Check if results and keys exist before iterating
		if (userListResult?.keys) {
			console.log(
				`Processing ${userListResult.keys.length} keys from userListResult`,
			);
			for (const key of userListResult.keys) {
				console.log(`  Adding key from userListResult: ${key.name}`);
				combinedKeys.set(key.name, key);
			}
		} else {
			console.log("userListResult has no keys property or is null/undefined");
		}
		if (emailListResult?.keys) {
			console.log(
				`Processing ${emailListResult.keys.length} keys from emailListResult`,
			);
			for (const key of emailListResult.keys) {
				console.log(`  Adding key from emailListResult: ${key.name}`);
				combinedKeys.set(key.name, key);
			}
		} else {
			console.log("emailListResult has no keys property or is null/undefined");
		}
		// This closing brace was misplaced, ending the try block prematurely
		// } // REMOVE THIS BRACE

		console.log(`Found ${combinedKeys.size} unique keys for user/email.`);

		const items: WorkerArticle[] = [];
		for (const key of combinedKeys.values()) {
			const value = await env.SAVED_ITEMS_KV.get(key.name);
			if (value) {
				try {
					const parsedItem = JSON.parse(value) as WorkerArticle;

					// Ensure siteName exists
					if (!parsedItem.siteName && parsedItem.url) {
						try {
							// Extract hostname, removing 'www.' if present
							let hostname = new URL(parsedItem.url).hostname;
							hostname = hostname.startsWith("www.")
								? hostname.substring(4)
								: hostname;
							parsedItem.siteName = hostname;
						} catch {
							parsedItem.siteName = "Unknown Source"; // Fallback on URL parse error
						}
					} else if (!parsedItem.siteName) {
						// Fallback if URL is also missing or invalid
						if (parsedItem.type === "pdf") {
							parsedItem.siteName = "PDF Document";
						} else if (parsedItem.type === "epub") {
							parsedItem.siteName = "EPUB Book";
						} else {
							parsedItem.siteName = "Unknown Source";
						}
					}

					// Ensure estimatedReadTime exists
					if (
						parsedItem.estimatedReadTime === undefined ||
						parsedItem.estimatedReadTime === null ||
						Number.isNaN(parsedItem.estimatedReadTime) // Also check for NaN
					) {
						// Calculate only if content exists, otherwise leave as undefined (or default to 1?)
						if (parsedItem.content) {
							parsedItem.estimatedReadTime = calculateReadTime(
								parsedItem.content,
							);
						} else {
							// Decide fallback: undefined or 1? Let's default to 1 min if content is missing.
							parsedItem.estimatedReadTime = 1;
						}
					}

					// Log structure before sending back
					// console.log(`Returning item (list): ${parsedItem._id}`, JSON.stringify(parsedItem));
					items.push(parsedItem); // Push the potentially modified item
				} catch (parseError) {
					console.error(
						`Failed to parse item with key ${key.name}:`,
						parseError,
					);
					// Optionally push a placeholder or skip the item
				}
			}
		}
		return jsonResponse(items);
		// This is the correct place for the try block's closing brace
	} catch (listError) {
		console.error("Error listing items:", listError);
		return errorResponse("Failed to list items", 500);
	}
}

/**
 * Finds an existing article with the same URL for a user.
 * @param env - The environment with KV namespace access.
 * @param userId - The user's ID.
 * @param url - The URL to check for duplicates.
 * @returns The existing article if found, null otherwise.
 */
async function findExistingArticleByUrl(
	env: Env,
	userId: string,
	url: string,
): Promise<WorkerArticle | null> {
	try {
		// List all items for this user
		const listResult = await env.SAVED_ITEMS_KV.list({ prefix: `${userId}:` });

		if (!listResult?.keys || listResult.keys.length === 0) {
			return null; // No items for this user
		}

		// Normalize the URL for comparison (remove trailing slashes, etc.)
		const normalizedUrl = url.trim().toLowerCase().replace(/\/$/, "");

		// Check each item to see if it has the same URL
		for (const key of listResult.keys) {
			const value = await env.SAVED_ITEMS_KV.get(key.name);
			if (value) {
				try {
					const article = JSON.parse(value) as WorkerArticle;
					const articleNormalizedUrl = article.url
						.trim()
						.toLowerCase()
						.replace(/\/$/, "");

					if (articleNormalizedUrl === normalizedUrl) {
						console.log(
							`Found existing article with the same URL: ${article._id}`,
						);
						return article;
					}
				} catch (parseError) {
					console.error(
						`Failed to parse item with key ${key.name}:`,
						parseError,
					);
				}
			}
		}

		return null; // No matching article found
	} catch (error) {
		console.error("Error finding existing article by URL:", error);
		return null; // Return null on error
	}
}

/**
 * Handles POST /items requests. Creates or updates an item for the authenticated user.
 * Implements URL-based deduplication to prevent duplicate articles.
 */
export async function handlePostItem(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	userId: string,
): Promise<Response> {
	try {
		const item = (await request.json()) as WorkerArticle;
		if (
			!item ||
			!item._id ||
			!item.url ||
			!item.title ||
			!item.userId ||
			!item.type ||
			item.savedAt === undefined ||
			!item.content // Essential field check added
		) {
			// Detailed validation logging
			let missingField = "";
			if (!item) missingField = "item object";
			else if (!item._id) missingField = "_id";
			else if (!item.url) missingField = "url";
			else if (!item.title) missingField = "title";
			else if (!item.userId) missingField = "userId";
			else if (!item.type) missingField = "type";
			else if (item.savedAt === undefined) missingField = "savedAt";
			else if (!item.content) missingField = "content";

			const logMsg = `Validation failed for incoming item (type: ${item?.type ?? "unknown"}). Missing required field: ${missingField}. Item received: ${JSON.stringify(item)}`;
			console.warn(logMsg);
			return errorResponse(
				`Invalid article data - missing required field: ${missingField}`,
				400,
			);
		}

		// Ensure the item's userId matches the authenticated user
		if (item.userId !== userId) {
			console.warn(
				`Attempt to save item for user ${item.userId} by authenticated user ${userId}`,
			);
			return errorResponse("User ID mismatch", 403); // Forbidden
		}

		console.log(
			`Received article POST request for ID: ${item._id}, User: ${userId}`,
		);
		// Log the structure of the incoming item for debugging
		// console.log("Incoming article data:", JSON.stringify(item, null, 2)); // Use stringify for full object view if needed

		// Check if an article with the same URL already exists for this user
		const existingArticle = await findExistingArticleByUrl(
			env,
			userId,
			item.url,
		);

		if (existingArticle) {
			console.log(`Found duplicate article with URL: ${item.url}`);

			// If the existing article is the same as the one being saved (same ID), proceed with update
			if (existingArticle._id === item._id) {
				console.log(`Updating existing article with ID: ${item._id}`);
			} else {
				// Existing article found with the same URL but different ID. Update the existing entry.
				console.log(
					`Updating existing article (ID: ${existingArticle._id}) with new data from request (New ID was: ${item._id}, URL: ${item.url})`,
				);
				const key = createUserItemKey(userId, existingArticle._id); // Use existing article's ID for the key

				// Construct the object to save, using NEW data but EXISTING ID for consistency
				// Note: We prioritize data from the incoming 'item', falling back to 'existingArticle' only for status fields if not present in 'item'
				const itemToSave: WorkerArticle = {
					_id: existingArticle._id, // Keep the original ID for the KV key relation
					userId: item.userId, // Use new user ID (should match authenticated user)
					url: item.url, // Use new URL (should be the same)
					title: item.title, // Use new title
					type: item.type, // Use new type
					savedAt: item.savedAt, // Use new savedAt timestamp
					isRead: item.isRead ?? existingArticle.isRead ?? false, // Prefer new isRead, fallback to existing, then false
					favorite: item.favorite ?? existingArticle.favorite ?? false, // Prefer new favorite, fallback to existing, then false
					content: item.content, // Always use new content
					...(item.fileData && { fileData: item.fileData }),
					...(item.htmlContent && { htmlContent: item.htmlContent }),
					...(item.excerpt && { excerpt: item.excerpt }),
					...(item.author && { author: item.author }),
					...(item.siteName && { siteName: item.siteName }),
					...(item.publishedDate && { publishedDate: item.publishedDate }),
					...(item.tags && { tags: item.tags }),
					...(item.readingProgress && {
						readingProgress: item.readingProgress,
					}),
					...(item.readAt && { readAt: item.readAt }), // Use new readAt if present
					...(item.scrollPosition && { scrollPosition: item.scrollPosition }),
					...(item.coverImage && { coverImage: item.coverImage }),
					...(item.language && { language: item.language }),
					...(item.pageCount && { pageCount: item.pageCount }),
					...(item.estimatedReadTime && {
						// Use new read time if present
						estimatedReadTime: item.estimatedReadTime,
					}),
					...(item._rev && { _rev: item._rev }), // Use new revision if present
				};

				console.log(`Attempting to update item in KV with key: ${key}`);
				const itemString = JSON.stringify(itemToSave);
				const kvPromise = env.SAVED_ITEMS_KV.put(key, itemString);

				// Ensure the background task completes even if the request is short-lived
				ctx.waitUntil(
					kvPromise.catch((err) => {
						console.error(
							`KV put (update) failed for key ${key} in waitUntil:`,
							err,
						);
					}),
				);

				// Wait for the update to complete before sending the response
				await kvPromise;

				console.log(`Successfully updated item in KV: ${key}`);
				// Return 200 OK for a successful update
				return jsonResponse(
					{
						status: "success",
						message: "Article updated successfully",
						item: itemToSave, // Return the updated item data
						updatedExisting: true,
						originalRequestId: item._id, // Signal the ID from the request that triggered the update
					},
					200,
				);
			}
		}

		const key = createUserItemKey(item.userId, item._id);
		const itemToSave: WorkerArticle = {
			_id: item._id,
			userId: item.userId,
			url: item.url,
			title: item.title,
			type: item.type,
			savedAt: item.savedAt,
			isRead: item.isRead ?? false,
			favorite: item.favorite ?? false,
			...(item.content && { content: item.content }),
			...(item.fileData && { fileData: item.fileData }),
			...(item.htmlContent && { htmlContent: item.htmlContent }),
			...(item.excerpt && { excerpt: item.excerpt }),
			...(item.author && { author: item.author }),
			...(item.siteName && { siteName: item.siteName }),
			...(item.publishedDate && { publishedDate: item.publishedDate }),
			...(item.tags && { tags: item.tags }),
			...(item.readingProgress && { readingProgress: item.readingProgress }),
			...(item.readAt && { readAt: item.readAt }),
			...(item.scrollPosition && { scrollPosition: item.scrollPosition }),
			...(item.coverImage && { coverImage: item.coverImage }),
			...(item.language && { language: item.language }),
			...(item.pageCount && { pageCount: item.pageCount }),
			...(item.estimatedReadTime && {
				estimatedReadTime: item.estimatedReadTime,
			}),
			...(item._rev && { _rev: item._rev }),
		};

		console.log(`Attempting to save item to KV with key: ${key}`);
		// Log the structure of the object being saved to KV
		// console.log("Saving item structure:", JSON.stringify(itemToSave, null, 2)); // Use stringify for full object view if needed
		const itemString = JSON.stringify(itemToSave);
		const kvPromise = env.SAVED_ITEMS_KV.put(key, itemString);

		// Using waitUntil correctly
		ctx.waitUntil(
			kvPromise.catch((err) => {
				console.error(`KV put failed for key ${key} in waitUntil:`, err);
			}),
		);

		try {
			await kvPromise; // Wait for completion for the response path
			console.log(`Successfully saved item to KV: ${key}`);
		} catch (kvError) {
			console.error(`KV put failed for key ${key}:`, kvError);
			// Rethrow or handle appropriately - here we let the outer catch handle it
			throw kvError;
		}

		return jsonResponse(
			{
				status: "success",
				message: "Article saved successfully",
				item: itemToSave,
			},
			201,
		);
	} catch (saveError: any) {
		console.error("Error saving article:", saveError);
		// Check if the error is due to invalid JSON in the request body
		if (saveError instanceof SyntaxError) {
			return errorResponse("Invalid JSON format in request body", 400);
		}
		return errorResponse(saveError.message || "Failed to save article", 500);
	}
}

/**
 * Handles GET /items/:id requests. Retrieves a specific item for the authenticated user.
 */
export async function handleGetItem(
	request: Request,
	env: Env,
	userId: string,
	itemId: string,
): Promise<Response> {
	console.log(`Getting item ${itemId} for user: ${userId}`);
	try {
		const key = createUserItemKey(userId, itemId);
		const value = await env.SAVED_ITEMS_KV.get(key);
		if (value === null) {
			return errorResponse("Item not found", 404);
		}
		// Now parse only if value is not null
		try {
			// Ensure we parse the value which is confirmed not null here
			const parsedItem = JSON.parse(value);
			// Log structure before sending back
			// console.log(`Returning item (get): ${parsedItem._id}`, JSON.stringify(parsedItem));
			return jsonResponse(parsedItem);
		} catch (parseError) {
			console.error(
				`Failed to parse item ${itemId} from KV:`,
				parseError,
				"Raw value:",
				value,
			);
			return errorResponse(
				"Failed to retrieve item data (invalid format)",
				500,
			);
		}
	} catch (getError) {
		console.error(`Error retrieving item ${itemId}:`, getError);
		return errorResponse("Failed to retrieve item", 500);
	}
}

/**
 * Handles DELETE /items/:id requests. Deletes a specific item for the authenticated user.
 */
export async function handleDeleteItem(
	request: Request,
	env: Env,
	userId: string,
	itemId: string,
): Promise<Response> {
	console.log(`Deleting item ${itemId} for user: ${userId}`);
	try {
		const key = createUserItemKey(userId, itemId);
		await env.SAVED_ITEMS_KV.delete(key);
		return jsonResponse({
			status: "success",
			message: "Item deleted successfully",
		});
	} catch (deleteError) {
		console.error(`Error deleting item ${itemId}:`, deleteError);
		return errorResponse("Failed to delete item", 500);
	}
}
