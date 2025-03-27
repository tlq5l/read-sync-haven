import { type Article, getArticle, saveArticle } from "./db";

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
 * Fetches items for a specific user from the Cloudflare Worker
 */
export async function fetchCloudItems(userId: string): Promise<Article[]> {
	try {
		const url = `https://bondwise-sync-api.vikione.workers.dev/items?userId=${encodeURIComponent(userId)}`;
		console.log(`Fetching cloud items from: ${url}`);
		
		const response = await fetch(url);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`Worker API error response: ${response.status} ${response.statusText}`, errorText);
			throw new Error(`API error: ${response.status} ${response.statusText}`);
		}

		const responseText = await response.text();
		console.log("Worker API response text:", responseText);
		
		// Parse the JSON response
		const items = JSON.parse(responseText) as CloudItem[];
		console.log(`Retrieved ${items.length} items from worker`);

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
			userId: item.userId,
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

/**
 * Imports cloud items into local PouchDB database
 * Returns the number of items imported successfully
 */
export async function importCloudItems(userId: string): Promise<number> {
	try {
		console.log(`Starting import process for user: ${userId}`);
		const cloudItems = await fetchCloudItems(userId);
		console.log(`Fetched ${cloudItems.length} items from cloud for import`);
		let importedCount = 0;

		for (const item of cloudItems) {
			try {
				// Check if item already exists
				const existingItem = await getArticle(item._id);

				if (!existingItem) {
					console.log(`Importing new item: ${item._id} - ${item.title}`);
					await saveArticle(item);
					importedCount++;
				} else {
					console.log(`Item already exists, skipping: ${item._id} - ${item.title}`);
				}
			} catch (error) {
				console.error(`Error importing item ${item._id}:`, error);
			}
		}

		console.log(`Import finished: ${importedCount} new items added`);
		return importedCount;
	} catch (error) {
		console.error("Error importing cloud items:", error);
		return 0;
	}
}

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
