// src/services/db/migrations.ts
// Helper functions to update the database schema or fix data issues

// Removed static imports for dynamic loading below
// import { getEstimatedReadingTime as getEpubReadingTime } from "@/services/epub";
// import { getEstimatedReadingTime as getPdfReadingTime } from "@/services/pdf";
import { articlesDb } from "./config";
import type { Article } from "./types";
import { executeWithRetry } from "./utils";

/**
 * Updates PDF and EPUB documents that are missing siteName and estimatedReadTime
 * This helps fix the issue with content cards showing "Unknown source" and "? min read"
 *
 * @returns The number of articles updated
 */
export async function updateMissingMetadata(): Promise<number> {
	console.log("Starting metadata update for PDFs and EPUBs...");
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

			// 2. Filter to PDF/EPUB documents missing siteName or estimatedReadTime
			const documentsToUpdate: Article[] = articles.filter(
				(article) =>
					(article.type === "pdf" || article.type === "epub") &&
					(!article.siteName || !article.estimatedReadTime),
			);

			console.log(
				`Found ${documentsToUpdate.length} PDF/EPUB documents with missing metadata.`,
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
					if (docToUpdate.type === "pdf") {
						docToUpdate.siteName = "PDF Document";
						updated = true;
					} else if (docToUpdate.type === "epub") {
						docToUpdate.siteName = "EPUB Book";
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
						// Decide how to handle: skip update, use default, etc.
						// Here, we'll proceed to default calculation if needed.
					}
				}

				// Add default reading time if we couldn't calculate it (either missing size or import failed)
				if (!docToUpdate.estimatedReadTime) {
					if (docToUpdate.type === "pdf") {
						docToUpdate.estimatedReadTime = docToUpdate.pageCount
							? docToUpdate.pageCount * 2
							: 10; // 2 minutes per page or 10 minutes default
						updated = true;
					} else if (docToUpdate.type === "epub") {
						// Default to 60 minutes for EPUBs without size info
						docToUpdate.estimatedReadTime = 60;
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
			console.error("Error during PDF/EPUB metadata update:", error);
			throw error;
		}
	});
}
