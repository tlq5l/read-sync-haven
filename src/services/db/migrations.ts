// src/services/db/migrations.ts
// Helper functions to update the database schema or fix data issues

import { getEstimatedReadingTime as getEpubReadingTime } from "@/services/epub";
import { getEstimatedReadingTime as getPdfReadingTime } from "@/services/pdf";
import { articlesDb } from "./config";
import type { Article } from "./types";
import { executeWithRetry } from "./utils";

/**
 * Updates articles (including PDF/EPUB) missing siteName, estimatedReadTime, or excerpt.
 * This helps fix issues with content cards showing "Unknown source", "? min read", or "No excerpt".
 *
 * @returns The number of articles updated
 */
export async function updateMissingMetadata(): Promise<number> {
	console.log("Starting metadata update for all article types...");
	return executeWithRetry(async () => {
		try {
			// 1. Fetch all articles
			const allDocsResponse = await articlesDb.allDocs<Article>({
				include_docs: true,
			});

			const articles: Article[] = allDocsResponse.rows
				.filter((row) => !!row.doc)
				.map((row) => row.doc as Article);

			console.log(
				`Fetched ${articles.length} articles to check for missing metadata.`,
			);

			// 2. Filter for any article type missing siteName, estimatedReadTime, or excerpt
			const documentsToUpdate: Article[] = articles.filter((article) => {
				const isMissingSiteName = !article.siteName;
				const isMissingReadTime = !article.estimatedReadTime;
				// Check for missing or empty excerpt
				const isMissingExcerpt =
					!article.excerpt || article.excerpt.trim() === "";
				// Only process articles that have content needed for excerpt generation
				const hasContent = !!article.content && article.content.trim() !== "";

				return (
					isMissingSiteName ||
					isMissingReadTime ||
					(isMissingExcerpt && hasContent)
				);
			});

			console.log(
				`Found ${documentsToUpdate.length} documents potentially missing metadata (siteName, readTime, excerpt).`,
			);

			// 3. Update each document with appropriate values
			const updatedDocs: Article[] = [];

			for (const doc of documentsToUpdate) {
				// Skip if missing revision
				if (!doc._rev) {
					console.warn(`Document ${doc._id} is missing _rev, cannot update.`);
					continue;
				}

				let updated = false;

				// Add siteName if missing
				if (!doc.siteName) {
					try {
						// Attempt to derive from URL for web articles
						if (doc.type === "article" && doc.url) {
							const url = new URL(doc.url);
							// Remove 'www.' if present
							doc.siteName = url.hostname.replace(/^www\./, "");
						} else if (doc.type === "pdf") {
							doc.siteName = "PDF Document";
						} else if (doc.type === "epub") {
							doc.siteName = "EPUB Book";
						} else {
							doc.siteName = "Unknown Source"; // Fallback
						}
						updated = true;
					} catch (e) {
						console.warn(
							`Failed to parse URL for siteName on ${doc._id}: ${doc.url}`,
						);
						doc.siteName = "Unknown Source"; // Fallback on URL parse error
						updated = true;
					}
				}

				// Add estimatedReadTime if missing
				// Add estimatedReadTime if missing
				if (!doc.estimatedReadTime) {
					if (doc.type === "pdf" && doc.fileSize) {
						doc.estimatedReadTime = getPdfReadingTime(
							doc.fileSize,
							doc.pageCount,
						);
						updated = true;
					} else if (doc.type === "epub" && doc.fileSize) {
						doc.estimatedReadTime = getEpubReadingTime(doc.fileSize);
						updated = true;
					}
					// Add default for web articles or if calculation failed
					if (!doc.estimatedReadTime) {
						// Basic estimation for web articles based on content length (very rough)
						if (doc.type === "article" && doc.content) {
							const words = doc.content.split(/\s+/).length;
							doc.estimatedReadTime = Math.max(1, Math.ceil(words / 200)); // Assume 200 WPM, min 1 min
						} else if (doc.type === "pdf") {
							// Default for PDF if size/page count missing
							doc.estimatedReadTime = doc.pageCount ? doc.pageCount * 2 : 10;
						} else if (doc.type === "epub") {
							// Default for EPUB if size missing
							doc.estimatedReadTime = 60;
						} else {
							// General fallback
							doc.estimatedReadTime = 5;
						}
						updated = true;
					}
				}

				// Add excerpt if missing and content exists
				if ((!doc.excerpt || doc.excerpt.trim() === "") && doc.content) {
					// Simple excerpt: first 200 chars, add ellipsis if longer
					const plainTextContent = doc.content
						.replace(/<[^>]+>/g, " ")
						.replace(/\s+/g, " ")
						.trim(); // Basic HTML strip + whitespace normalize
					if (plainTextContent.length > 0) {
						doc.excerpt =
							plainTextContent.length > 200
								? `${plainTextContent.substring(0, 200)}...`
								: plainTextContent;
						updated = true;
					} else if (!doc.excerpt) {
						// If content was only HTML/empty, set a default placeholder
						doc.excerpt = "No excerpt available";
						updated = true;
					}
				}

				if (updated) {
					updatedDocs.push(doc);
				}
			}

			if (updatedDocs.length > 0) {
				console.log(
					`Updating ${updatedDocs.length} documents with new metadata...`,
				);
				const bulkResponse = await articlesDb.bulkDocs(updatedDocs);

				// Check for errors
				const errors = bulkResponse.filter(
					(res): res is PouchDB.Core.Error => "error" in res && !!res.error,
				);

				if (errors.length > 0) {
					console.error("Errors occurred during bulk update:", errors);
					for (const err of errors) {
						const message = err.message || err.reason || "Unknown error";
						console.error(`Failed to update ${err.id}: ${message}`);
					}
					throw new Error(
						`Failed to update ${errors.length} out of ${updatedDocs.length} documents. Check logs for details.`,
					);
				}

				console.log(
					`Successfully updated ${updatedDocs.length} documents with metadata.`,
				);
				return updatedDocs.length;
			}

			console.log("No documents needed metadata updates.");
			return 0;
		} catch (error) {
			console.error("Error during article metadata update:", error);
			throw error;
		}
	});
}
