// bondwise-worker/src/handlers/items.ts

import type { Env, WorkerArticle } from "../types";
import { createUserItemKey, errorResponse, jsonResponse } from "../utils";

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
		for (const key of userListResult.keys) combinedKeys.set(key.name, key);
		if (emailListResult) {
			for (const key of emailListResult.keys) combinedKeys.set(key.name, key);
		}
		console.log(`Found ${combinedKeys.size} unique keys for user/email.`);

		const items: WorkerArticle[] = [];
		for (const key of combinedKeys.values()) {
			const value = await env.SAVED_ITEMS_KV.get(key.name);
			if (value) {
				try {
					items.push(JSON.parse(value) as WorkerArticle);
				} catch (parseError) {
					console.error(`Failed to parse item with key ${key.name}:`, parseError);
				}
			}
		}
		return jsonResponse(items);
	} catch (listError) {
		console.error("Error listing items:", listError);
		return errorResponse("Failed to list items", 500);
	}
}

/**
 * Handles POST /items requests. Creates or updates an item for the authenticated user.
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
			!item || !item._id || !item.url || !item.title || !item.userId || !item.type || item.savedAt === undefined
		) {
			return errorResponse("Invalid article data - missing required fields", 400);
		}

		// Ensure the item's userId matches the authenticated user
		if (item.userId !== userId) {
			console.warn(`Attempt to save item for user ${item.userId} by authenticated user ${userId}`);
			return errorResponse("User ID mismatch", 403); // Forbidden
		}

		console.log(`Processing article: ${item._id} (Type: ${item.type}) for user: ${userId}`);

		const key = createUserItemKey(item.userId, item._id);
		const itemToSave: WorkerArticle = {
			_id: item._id, userId: item.userId, url: item.url, title: item.title, type: item.type, savedAt: item.savedAt,
			isRead: item.isRead ?? false, favorite: item.favorite ?? false,
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
			...(item.estimatedReadTime && { estimatedReadTime: item.estimatedReadTime }),
			...(item._rev && { _rev: item._rev }),
		};

		const kvPromise = env.SAVED_ITEMS_KV.put(key, JSON.stringify(itemToSave));
		ctx.waitUntil(kvPromise.catch(err => console.error(`Background KV put failed for ${key}:`, err))); // Log background errors
		await kvPromise; // Wait for completion before responding

		return jsonResponse({ status: "success", message: "Article saved successfully", item: itemToSave }, 201);
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
		// Assuming value is valid JSON stringified WorkerArticle
		return jsonResponse(JSON.parse(value));
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
		return jsonResponse({ status: "success", message: "Item deleted successfully" });
	} catch (deleteError) {
		console.error(`Error deleting item ${itemId}:`, deleteError);
		return errorResponse("Failed to delete item", 500);
	}
}