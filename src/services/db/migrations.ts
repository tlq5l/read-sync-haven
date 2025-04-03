// src/services/db/migrations.ts
// Helper functions to update the database schema or fix data issues

// Removed static imports for dynamic loading below
// import { getEstimatedReadingTime as getEpubReadingTime } from "@/services/epub";
// import { getEstimatedReadingTime as getPdfReadingTime } from "@/services/pdf";
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

			// 3. Process each document asynchronously to update values
			const updatePromises = documentsToUpdate.map(async (doc) => {
				// Skip if missing revision
				if (!doc._rev) {
					console.warn(`Document ${doc._id} is missing _rev, cannot update.`);
					return null; // Return null for documents that cannot be updated
				}

				let updated = false;
				const docToUpdate = { ...doc }; // Clone doc to avoid modifying original in case of partial failure

				// Add siteName if missing
				if (!docToUpdate.siteName) {
					try {
						// Attempt to derive from URL for web articles
						if (docToUpdate.type === "article" && docToUpdate.url) {
							const url = new URL(docToUpdate.url);
							// Remove 'www.' if present
							docToUpdate.siteName = url.hostname.replace(/^www\./, "");
						} else if (docToUpdate.type === "pdf") {
							docToUpdate.siteName = "PDF Document";
						} else if (docToUpdate.type === "epub") {
							docToUpdate.siteName = "EPUB Book";
						} else {
							docToUpdate.siteName = "Unknown Source"; // Fallback
						}
						updated = true;
					} catch (e) {
						console.warn(
							`Failed to parse URL for siteName on ${docToUpdate._id}: ${docToUpdate.url}`,
						);
						docToUpdate.siteName = "Unknown Source"; // Fallback on URL parse error
						updated = true;
					}
				}

				// Add estimatedReadTime if missing
				if (!docToUpdate.estimatedReadTime && docToUpdate.fileSize) {
					try {
						if (docToUpdate.type === "pdf") {
							const { getEstimatedReadingTime: getPdfReadingTime } =
								await import("@/services/pdf");
							docToUpdate.estimatedReadTime = getPdfReadingTime(
								docToUpdate.fileSize,
								docToUpdate.pageCount,
							);
							updated = true;
						} else if (docToUpdate.type === "epub") {
							const { getEstimatedReadingTime: getEpubReadingTime } =
								await import("@/services/epub");
							docToUpdate.estimatedReadTime = getEpubReadingTime(
								docToUpdate.fileSize,
							);
							updated = true;
						}
					} catch (importError) {
						console.error(
							`Failed to dynamically import reading time function for ${docToUpdate._id}:`,
							importError,
						);
					}
				}

				// Add default reading time if we couldn't calculate it
				if (!docToUpdate.estimatedReadTime) {
					if (docToUpdate.type === "article" && docToUpdate.content) {
						// Basic estimation for web articles based on content length
						const words = docToUpdate.content.split(/\s+/).length;
						docToUpdate.estimatedReadTime = Math.max(1, Math.ceil(words / 200)); // Assume 200 WPM, min 1 min
					} else if (docToUpdate.type === "pdf") {
						docToUpdate.estimatedReadTime = docToUpdate.pageCount
							? docToUpdate.pageCount * 2
							: 10; // 2 minutes per page or 10 minutes default
					} else if (docToUpdate.type === "epub") {
						docToUpdate.estimatedReadTime = 60; // Default to 60 minutes for EPUBs
					} else {
						docToUpdate.estimatedReadTime = 5; // General fallback
					}
					updated = true;
				}

				// Add excerpt if missing and content exists
				if (
					(!docToUpdate.excerpt || docToUpdate.excerpt.trim() === "") &&
					docToUpdate.content
				) {
					// Simple excerpt: first 200 chars, add ellipsis if longer
					const plainTextContent = docToUpdate.content
						.replace(/<[^>]+>/g, " ")
						.replace(/\s+/g, " ")
						.trim(); // Basic HTML strip + whitespace normalize
					if (plainTextContent.length > 0) {
						docToUpdate.excerpt =
							plainTextContent.length > 200
								? `${plainTextContent.substring(0, 200)}...`
								: plainTextContent;
						updated = true;
					} else if (!docToUpdate.excerpt) {
						// If content was only HTML/empty, set a default placeholder
						docToUpdate.excerpt = "No excerpt available";
						updated = true;
					}
				}

				return updated ? docToUpdate : null; // Return updated doc or null if no changes
			});

			// Wait for all updates to process and filter out nulls
			const results = await Promise.all(updatePromises);
			const updatedDocs: Article[] = results.filter(
				(doc): doc is Article => doc !== null,
			);

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
