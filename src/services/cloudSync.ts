import type { Article } from "./db"; // Use type-only import

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
export async function saveItemToCloud(article: Article): Promise<boolean> {
	if (!article.userId) {
		console.error("Cannot save to cloud: article has no userId");
		return false;
	}

	try {
		const response = await fetch(
			"https://bondwise-sync-api.vikione.workers.dev/items",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				// Send the entire Article object. The worker now expects fields
				// like _id, savedAt (as number), fileData, and the correct type directly.
				body: JSON.stringify(article),
			},
		);

		return response.ok;
	} catch (error) {
		console.error("Error saving item to cloud:", error);
		return false;
	}
}

/**
 * Deletes an article from the Cloudflare Worker
 */
export async function deleteItemFromCloud(articleId: string): Promise<boolean> {
	if (!articleId) {
		console.error("Cannot delete from cloud: articleId is missing");
		return false;
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
				// Add authentication headers if required by the worker
				// Assuming the worker uses the same auth as fetch/save
				// If not, this needs adjustment based on worker requirements
			},
		});

		if (!response.ok) {
			// Log specific error details if possible
			const errorBody = await response.text();
			console.error(
				`Failed to delete item ${articleId} from cloud. Status: ${response.status}, Body: ${errorBody}`,
			);
			return false;
		}

		console.log(`Successfully deleted item ${articleId} from cloud.`);
		return response.ok;
	} catch (error) {
		console.error(`Error deleting item ${articleId} from cloud:`, error);
		return false;
	}
}

// Removed importCloudItems function as it's no longer needed with automatic cloud sync
// Removed unused extractExcerpt function (was causing TypeScript error TS6133)

// Removed unused mapItemType function
// Removed mapArticleType as we now send the original type directly
