import type { Article } from "./db"; // Use type-only import

// Define possible outcomes for cloud operations
export type CloudSyncStatus =
	| "success"
	| "not_found"
	| "unauthorized"
	| "error"
	| "no_user_id"
	| "no_article_id";

// Interface for items from the Cloudflare Worker
// Define the structure expected from the worker (should match WorkerArticle in worker)
// We can reuse the Article type if it's identical or define a specific CloudArticle type
// For now, let's assume the worker returns data compatible with the frontend Article type
// interface CloudArticle extends Article {} // Example if needed

/**
 * Fetches items for the authenticated user from the Cloudflare Worker using Clerk token
 * and optionally the user's email for fallback lookup.
 */
export async function fetchCloudItems(
	token: string,
	email?: string | null, // Add optional email parameter
): Promise<Article[]> {
	if (!token) {
		console.error("Cannot fetch cloud items: No token provided.");
		return []; // Or throw an error, depending on desired handling
	}
	try {
		// Construct URL, adding email query param if available
		let fetchUrl = "https://bondwise-sync-api.vikione.workers.dev/items";
		if (email) {
			fetchUrl += `?email=${encodeURIComponent(email)}`;
		}
		console.log(
			`Fetching cloud items for authenticated user from: ${fetchUrl}`,
		);

		const response = await fetch(fetchUrl, {
			headers: {
				// Add the Authorization header
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.ok) {
			// Handle specific auth error
			if (response.status === 401) {
				console.error("Authentication failed when fetching cloud items.");
				// Optionally trigger re-authentication or sign-out
				throw new Error("Authentication failed. Please sign in again.");
			}
			throw new Error(`API error: ${response.status} ${response.statusText}`);
		}

		// Expecting an array of objects matching the frontend Article structure (or WorkerArticle)
		const rawItems = await response.json();

		// Map the incoming 'id' field to '_id'
		const items: Article[] = rawItems.map((item: any) => ({
			...item,
			_id: item.id, // Map id to _id
			// Ensure other fields match Article type, add defaults if necessary
			savedAt: item.savedAt || Date.parse(item.scrapedAt) || Date.now(), // Use savedAt or parse scrapedAt
			isRead: item.isRead ?? false,
			favorite: item.favorite ?? false,
			tags: item.tags || [],
			// _rev will be undefined here, which is correct for initial fetch
		}));
		console.log(`Retrieved ${items.length} items from cloud`);

		// No mapping needed if worker returns data matching the Article structure
		// TODO: Add validation here if needed to ensure received data matches Article type
		return items;
	} catch (error) {
		console.error("Error fetching cloud items:", error);
		throw error; // Re-throw the error so the caller knows about it
	}
}

/**
 * Saves an article to the Cloudflare Worker
 */
export async function saveItemToCloud(
	article: Article,
	token: string, // Add token parameter
): Promise<CloudSyncStatus> {
	if (!article.userId) {
		console.error("Cannot save to cloud: article has no userId", article._id);
		return "no_user_id";
	}
	if (!token) {
		// Added check for token
		console.error("Cannot save to cloud: no token provided", article._id);
		return "unauthorized"; // Or a more specific status? Using unauthorized for now.
	}

	try {
		const response = await fetch(
			"https://bondwise-sync-api.vikione.workers.dev/items",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`, // Add Authorization header
				},
				// Send the entire Article object. The worker now expects fields
				// like _id, savedAt (as number), fileData, and the correct type directly.
				body: JSON.stringify(article),
			},
		);

		if (response.ok) {
			// Status 200 OK or 201 Created typically indicate success
			return "success";
		}
		if (response.status === 401) {
			console.error(
				`Unauthorized: Failed to save item ${article._id} to cloud.`,
			);
			return "unauthorized";
		}
		// Handle other non-OK statuses as generic errors
		const errorBody = await response.text();
		console.error(
			`Error saving item ${article._id} to cloud. Status: ${response.status}, Body: ${errorBody}`,
		);
		return "error";
	} catch (error) {
		console.error(`Error saving item ${article._id} to cloud:`, error);
		return "error";
	}
}

/**
 * Deletes an article from the Cloudflare Worker
 */
export async function deleteItemFromCloud(
	articleId: string,
	token: string, // Add token parameter
): Promise<CloudSyncStatus> {
	if (!articleId) {
		console.error("Cannot delete from cloud: articleId is missing.");
		return "no_article_id";
	}
	if (!token) {
		// Added check for token
		console.error("Cannot delete from cloud: no token provided", articleId);
		return "unauthorized"; // Or a more specific status? Using unauthorized for now.
	}

	try {
		// Construct the URL with the item ID
		const deleteUrl = `https://bondwise-sync-api.vikione.workers.dev/items/${encodeURIComponent(
			articleId,
		)}`;
		console.log(
			`Attempting to delete item ${articleId} from cloud at ${deleteUrl}`,
		);

		const response = await fetch(deleteUrl, {
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${token}`, // Add Authorization header
			},
		});

		if (response.ok) {
			// Status 200 OK or 204 No Content typically indicate success
			console.log(`Successfully deleted item ${articleId} from cloud.`);
			return "success";
		}
		if (response.status === 404) {
			console.warn(`Item ${articleId} not found in cloud for deletion.`);
			return "not_found";
		}
		if (response.status === 401) {
			console.error(
				`Unauthorized: Failed to delete item ${articleId} from cloud.`,
			);
			return "unauthorized";
		}

		// Handle other non-OK statuses as generic errors
		const errorBody = await response.text();
		console.error(
			`Error deleting item ${articleId} from cloud. Status: ${response.status}, Body: ${errorBody}`,
		);
		return "error";
	} catch (error) {
		console.error(`Error during delete request for ${articleId}:`, error);
		return "error";
	}
}

// Removed importCloudItems function as it's no longer needed with automatic cloud sync
// Removed unused extractExcerpt function (was causing TypeScript error TS6133)

// Removed unused mapItemType function
// Removed mapArticleType as we now send the original type directly
