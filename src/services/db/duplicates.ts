// src/services/db/duplicates.ts

import { articlesDb } from "./config";
import type { Article } from "./types";
import { executeWithRetry } from "./utils";

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
				.filter(
					(row: PouchDB.Core.AllDocsResponse<Article>["rows"][number]) =>
						!!row.doc && row.id.startsWith("article_"),
				) // Ensure doc exists and is an article
				.map(
					(row: PouchDB.Core.AllDocsResponse<Article>["rows"][number]) =>
						row.doc as Article,
				);

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
				const errors = bulkResponse.filter(
					(
						res: PouchDB.Core.Response | PouchDB.Core.Error,
					): res is PouchDB.Core.Error => "error" in res && !!res.error,
				);
				if (errors.length > 0) {
					console.error("Errors occurred during bulk deletion:", errors);
					for (const err of errors) {
						const message = err.message || err.reason || "Unknown error";
						console.error(`Failed to delete ${err.id}: ${message}`);
					}
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
