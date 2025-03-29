import type { Article } from "./db"; // Use type-only import

// Interface for items from the Cloudflare Worker
interface CloudItem {
	id: string;
	url: string;
	title: string;
	content?: string;
	scrapedAt: string;
	type: "article" | "youtube" | "other";
	userId: string;
}

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

		const items = (await response.json()) as CloudItem[];
		console.log(`Retrieved ${items.length} items from cloud`);

		// Convert to PouchDB Article format
		return items.map((item) => ({
			_id: item.id,
			title: item.title,
			url: item.url,
			content: item.content || "",
			excerpt: extractExcerpt(item.content || ""),
			savedAt: new Date(item.scrapedAt).getTime(),
			isRead: false,
			favorite: false,
			tags: [],
			type: mapItemType(item.type),
			userId: item.userId, // Keep original userId for debugging
		}));
	} catch (error) {
		console.error("Error fetching cloud items:", error);
		return [];
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
				body: JSON.stringify({
					id: article._id,
					url: article.url,
					title: article.title,
					content: article.content,
					scrapedAt: new Date(article.savedAt).toISOString(),
					type: mapArticleType(article.type),
					userId: article.userId,
				}),
			},
		);

		return response.ok;
	} catch (error) {
		console.error("Error saving item to cloud:", error);
		return false;
	}
}

// Removed importCloudItems function as it's no longer needed with automatic cloud sync

/**
 * Helper function to extract a short excerpt from HTML content
 */
function extractExcerpt(htmlContent: string, maxLength = 150): string {
	// Simple excerpt extraction - remove HTML tags and limit length
	const plainText = htmlContent.replace(/<\/?[^>]+(>|$)/g, " ").trim();
	return plainText.length > maxLength
		? `${plainText.substring(0, maxLength)}...`
		: plainText;
}

/**
 * Map cloud item type to article type
 */
function mapItemType(type: string): Article["type"] {
	switch (type) {
		case "article":
			return "article";
		case "youtube":
			return "article"; // Map YouTube to article for now
		default:
			return "article";
	}
}

/**
 * Map article type to cloud item type
 */
function mapArticleType(
	type: Article["type"],
): "article" | "youtube" | "other" {
	switch (type) {
		case "article":
			return "article";
		case "pdf":
		case "epub":
		case "note":
			return "other";
		default:
			return "article";
	}
}
