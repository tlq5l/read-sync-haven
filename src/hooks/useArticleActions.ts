import { useToast } from "@/hooks/use-toast";
import { type DexieArticle, db } from "@/services/db/dexie"; // Import Dexie db instance
import type { Article } from "@/services/db/types"; // Import original Article type
import { parseArticle } from "@/services/parser";
import { useAuth } from "@clerk/clerk-react"; // Keep for userId association
import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid"; // Import uuid for generating IDs
// Removed cloudSync imports
// Removed old db imports
// Removed useReadingProgress import (handled separately if needed)

// Map original Article (using '_id') to DexieArticle (using 'id') for saving/updating
// Note: Need to generate 'id' if the input Article doesn't have one (_id).
const mapArticleToDexie = (
	article: Partial<Article> & { _id?: string },
): DexieArticle => {
	// Corrected &amp; to &
	const { _id, _rev, _deleted, version, ...rest } = article;
	const id = _id || uuidv4(); // Use existing _id or generate a new UUID for Dexie 'id'

	// Ensure all required fields for DexieArticle are present or have defaults
	return {
		id,
		title: rest.title ?? "Untitled",
		url: rest.url ?? "",
		content: rest.content ?? "",
		excerpt: rest.excerpt ?? "",
		savedAt: rest.savedAt ?? Date.now(),
		isRead: rest.isRead ?? false,
		favorite: rest.favorite ?? false,
		tags: rest.tags ?? [],
		type: rest.type ?? "article",
		status: rest.status ?? "inbox",
		userId: rest.userId, // Keep userId if present
		author: rest.author,
		publishedDate: rest.publishedDate,
		readAt: rest.readAt,
		siteName: rest.siteName,
		estimatedReadTime: rest.estimatedReadTime,
		readingProgress: rest.readingProgress ?? 0,
		fileData: rest.fileData,
		fileSize: rest.fileSize,
		fileName: rest.fileName,
		pageCount: rest.pageCount,
		category: rest.category,
		htmlContent: rest.htmlContent,
		scrollPosition: rest.scrollPosition,
		coverImage: rest.coverImage,
		language: rest.language,
		deletedAt: rest.deletedAt, // Keep for potential soft-delete logic
	};
};

// Map DexieArticle (using 'id') back to original Article (using '_id') for returning
const mapDexieToArticle = (dexieArticle: DexieArticle): Article => {
	const { id, ...rest } = dexieArticle;
	return {
		_id: id, // Map id back to _id
		version: 1, // Add a default version or retrieve if stored
		...rest, // Spread the rest of the properties
	};
};

// Helper function to process EPUB files (Modified to return Dexie compatible structure)
async function processEpubFile(
	file: File,
	userId: string,
): Promise<DexieArticle> {
	// Return DexieArticle directly
	const epubModule = await import("@/services/epub");
	if (!epubModule.isValidEpub(file)) {
		throw new Error("Invalid EPUB file.");
	}
	const fileBuffer = await file.arrayBuffer();
	const metadata = await epubModule.extractEpubMetadata(fileBuffer);
	const base64Content = epubModule.arrayBufferToBase64(fileBuffer);
	const estimatedReadingTime = await epubModule.getEstimatedReadingTime(
		fileBuffer.byteLength,
	);
	const id = uuidv4(); // Generate ID for Dexie

	return {
		id, // Use generated ID
		userId,
		title: metadata.title || file.name.replace(/\.epub$/i, ""),
		type: "epub",
		fileData: base64Content,
		content: "EPUB content is stored in fileData.", // Placeholder
		url: `local-epub://${file.name}`,
		savedAt: Date.now(),
		status: "inbox",
		isRead: false,
		favorite: false,
		tags: [],
		author: metadata.author,
		publishedDate: metadata.publishedDate,
		excerpt: metadata.description || "EPUB file",
		readingProgress: 0,
		siteName: "EPUB Book",
		estimatedReadTime: estimatedReadingTime,
		fileName: file.name,
		fileSize: fileBuffer.byteLength,
		// Remove PouchDB specific fields like _rev, _deleted
	};
}

// Helper function to process PDF files (Modified to return Dexie compatible structure)
async function processPdfFile(
	file: File,
	userId: string,
): Promise<DexieArticle> {
	// Return DexieArticle directly
	const pdfModule = await import("@/services/pdf");
	if (!pdfModule.isValidPdf(file)) {
		throw new Error("Invalid PDF file.");
	}
	const fileBuffer = await file.arrayBuffer();
	const metadata = await pdfModule.extractPdfMetadata(file, fileBuffer);
	const base64Content = pdfModule.arrayBufferToBase64(fileBuffer);
	const estimatedReadingTime = await pdfModule.getEstimatedReadingTime(
		fileBuffer.byteLength,
		metadata.pageCount,
	);
	const id = uuidv4(); // Generate ID for Dexie

	return {
		id, // Use generated ID
		userId,
		title: metadata.title || file.name.replace(/\.pdf$/i, ""),
		type: "pdf",
		content: base64Content, // Store base64 content
		url: `local-pdf://${file.name}`,
		savedAt: Date.now(),
		status: "inbox",
		isRead: false,
		favorite: false,
		tags: [],
		author: metadata.author,
		publishedDate: metadata.publishedDate,
		excerpt: metadata.description || "PDF file",
		pageCount: metadata.pageCount,
		readingProgress: 0,
		siteName: "PDF Document",
		estimatedReadTime: estimatedReadingTime,
		fileName: file.name,
		fileSize: fileBuffer.byteLength,
		// Remove PouchDB specific fields like _rev, _deleted
	};
}

/**
 * Hook providing functions to perform actions on articles using Dexie.
 *
 * @param refreshArticles - A callback function to trigger a refresh of the article list after an action.
 */
export function useArticleActions(refreshArticles: () => Promise<void>) {
	const { toast } = useToast();
	const { userId, isSignedIn } = useAuth(); // Keep auth for userId association

	// Add article by URL
	const addArticleByUrl = useCallback(
		async (url: string): Promise<Article | null> => {
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required", // Keep auth check for user association
					description: "Please sign in to save articles.",
					variant: "destructive",
				});
				return null;
			}

			try {
				const parsedArticleData = await parseArticle(url);

				// Prepare data for Dexie, generating a new ID
				const dexieArticle = mapArticleToDexie({
					...parsedArticleData,
					userId,
					savedAt: Date.now(),
					status: "inbox",
					isRead: false,
					favorite: false,
					tags: [],
					readingProgress: 0,
					// version: 1, // Removed version, handled by Dexie if needed
				});

				// Save using Dexie
				await db.articles.add(dexieArticle);
				const savedArticle = mapDexieToArticle(dexieArticle); // Map back for return

				toast({
					title: "Article saved",
					description: `"${savedArticle.title}" has been saved locally.`, // Updated message
				});

				// Trigger UI refresh
				await refreshArticles();

				// Removed cloud sync logic

				return savedArticle;
			} catch (err) {
				console.error("Failed to add article by URL:", err);
				toast({
					title: "Parsing Failed",
					description: `Could not parse the article from the provided URL. The article was not saved. Error: ${
						err instanceof Error ? err.message : String(err)
					}`,
					variant: "destructive",
				});
				return null;
			}
		},
		[toast, userId, isSignedIn, refreshArticles], // Removed getToken
	);

	// Add article by file (EPUB or PDF)
	const addArticleByFile = useCallback(
		async (file: File): Promise<Article | null> => {
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to save files.",
					variant: "destructive",
				});
				return null;
			}

			try {
				let dexieArticle: DexieArticle;
				let fileType: "epub" | "pdf";

				// Process file using updated helpers returning DexieArticle
				if (file.name.toLowerCase().endsWith(".epub")) {
					dexieArticle = await processEpubFile(file, userId);
					fileType = "epub";
				} else if (file.name.toLowerCase().endsWith(".pdf")) {
					dexieArticle = await processPdfFile(file, userId);
					fileType = "pdf";
				} else {
					throw new Error(
						"Invalid file type. Only EPUB and PDF formats are supported.",
					);
				}

				// Save using Dexie
				await db.articles.add(dexieArticle);
				const savedArticle = mapDexieToArticle(dexieArticle); // Map back for return

				// Removed Cloud Sync logic

				// Show success toast
				toast({
					title: `${fileType.toUpperCase()} saved`,
					description: `"${savedArticle.title}" has been saved locally.`, // Updated message
				});

				// Trigger UI refresh
				await refreshArticles();

				return savedArticle;
			} catch (err) {
				console.error("Failed to add file:", err);
				toast({
					title: "Parsing Failed",
					description: `Could not parse the uploaded file (EPUB/PDF). The file was not saved. Error: ${
						err instanceof Error ? err.message : String(err)
					}`,
					variant: "destructive",
				});
				return null;
			}
		},
		[toast, userId, isSignedIn, refreshArticles], // Removed getToken
	);

	// Update article status (isRead, favorite, status) using Dexie
	const updateArticleStatus = useCallback(
		async (
			id: string, // This is the Dexie primary key 'id' (same as Article._id)
			updates: {
				isRead?: boolean;
				favorite?: boolean;
				status?: "inbox" | "later" | "archived";
			},
		) => {
			// Keep auth check for context, though operation is local
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to update articles.",
					variant: "destructive",
				});
				return;
			}

			try {
				// Dexie's update handles fetching and merging internally
				// We just need the ID and the changes object.
				const changes: Partial<DexieArticle> = {};
				let statusUpdateMessage = "";

				if (updates.isRead !== undefined) {
					changes.isRead = updates.isRead;
					if (updates.isRead) {
						// Check if readAt needs setting (only set if not already set)
						const existing = await db.articles.get(id);
						if (existing && !existing.readAt) {
							changes.readAt = Date.now();
						}
					}
					statusUpdateMessage = updates.isRead
						? "marked as read"
						: "marked as unread";
				}
				if (updates.favorite !== undefined) {
					changes.favorite = updates.favorite;
					statusUpdateMessage = updates.favorite
						? "added to favorites"
						: "removed from favorites";
				}
				if (updates.status !== undefined) {
					changes.status = updates.status;
					statusUpdateMessage = `moved to ${updates.status}`;
				}

				if (Object.keys(changes).length === 0) {
					console.log("No actual updates provided to updateArticleStatus");
					return;
				}

				// Use Dexie's update method
				const updateCount = await db.articles.update(id, changes);

				if (updateCount === 0) {
					// This means the article with the given ID was not found
					console.warn(`Article ${id} not found for update.`);
					// Optionally throw an error or show a specific toast
					toast({
						title: "Update Failed",
						description: "Article not found.",
						variant: "destructive",
					});
					return; // Exit if not found
				}

				// Removed Cloud Sync logic

				toast({
					title: "Article updated",
					description: `Article ${statusUpdateMessage} locally.`, // Updated message
				});

				// Trigger UI refresh (useLiveQuery in useArticleSync should handle this)
				// But calling refreshArticles might still be useful for immediate consistency guarantees
				await refreshArticles();
			} catch (err) {
				console.error("Failed to update article status:", err);
				toast({
					title: "Failed to update article",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while updating the article.",
					variant: "destructive",
				});
			}
		},
		[toast, userId, isSignedIn, refreshArticles], // Removed getToken
	);

	// Update reading progress using Dexie
	const updateReadingProgress = useCallback(
		async (id: string, progress: number) => {
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in.",
					variant: "destructive",
				});
				return;
			}
			try {
				// Update directly using Dexie
				const count = await db.articles.update(id, {
					readingProgress: progress,
				});
				if (count === 0) {
					console.warn(`Article ${id} not found for reading progress update.`);
					// Optional: show toast if article not found
				} else {
					console.log(
						`Updated reading progress for article ${id} to ${progress}`,
					);
				}
				// No need to refresh UI here if useLiveQuery is working correctly
			} catch (err) {
				console.error(
					`Failed to update reading progress for article ${id}:`,
					err,
				);
				toast({
					title: "Failed to Update Progress",
					description:
						err instanceof Error ? err.message : "An error occurred.",
					variant: "destructive",
				});
			}
		},
		[toast, userId, isSignedIn], // Only depends on auth state and toast
	);

	// Remove article using Dexie - Returns true on successful DB delete, false otherwise.
	const removeArticle = useCallback(
		async (id: string): Promise<boolean> => {
			// id is Dexie primary key
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in.",
					variant: "destructive",
				});
				return false;
			}

			try {
				// Optional: Fetch first to check ownership if necessary, though Dexie doesn't require it for delete
				// const articleToDelete = await db.articles.get(id);
				// if (!articleToDelete || articleToDelete.userId !== userId) {
				//     throw new Error("Permission denied or article not found.");
				// }

				// Use Dexie's delete method
				await db.articles.delete(id);

				toast({
					title: "Article removed",
					description: "The article has been removed locally.", // Updated message
				});

				// Removed Cloud Deletion logic

				// No refresh here - UI update handled by useLiveQuery via caller/context.
				return true; // Indicate success
			} catch (err) {
				console.error("Failed to remove article:", err);
				toast({
					title: "Failed to remove article",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while removing the article.",
					variant: "destructive",
				});
				return false; // Indicate failure
			}
		},
		[toast, userId, isSignedIn], // Removed getToken and refreshArticles
	);

	// removeDuplicateLocalArticles - This logic needs complete rethinking for Dexie
	// Dexie doesn't have PouchDB's complex revision handling or built-in conflict resolution.
	// Duplicates might need to be identified based on URL or title+content hash within the specific userId scope.
	// This is complex and potentially slow. For now, let's comment it out or provide a placeholder.
	const removeDuplicateLocalArticles = useCallback(async () => {
		toast({
			title: "Not Implemented",
			description:
				"Duplicate removal feature needs reimplementation for local storage.",
			variant: "default",
		});
		console.warn(
			"removeDuplicateLocalArticles needs reimplementation for Dexie.",
		);
		// Placeholder - does nothing for now
		return;

		// --- Example of potential Dexie logic (needs refinement and testing) ---
		/*
        if (!isSignedIn || !userId) { ... return; }
        try {
            console.log("Attempting to find and remove duplicate articles (Dexie)...");
            const allArticles = await db.articles.where({ userId }).toArray();
            const urlMap = new Map<string, DexieArticle[]>();
            allArticles.forEach(article => {
                if (article.url) { // Only consider articles with URLs for simplicity
                    const existing = urlMap.get(article.url) || [];
                    existing.push(article);
                    urlMap.set(article.url, existing);
                }
            });

            let removedCount = 0;
            const idsToRemove: string[] = [];
            for (const articlesWithSameUrl of urlMap.values()) {
                if (articlesWithSameUrl.length > 1) {
                    // Keep the one saved most recently (or oldest, depending on preference)
                    articlesWithSameUrl.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0)); // Keep newest
                    const ids = articlesWithSameUrl.slice(1).map(a => a.id); // Mark all but the first for removal
                    idsToRemove.push(...ids);
                    removedCount += ids.length;
                }
            }

            if (idsToRemove.length > 0) {
                await db.articles.bulkDelete(idsToRemove);
                toast({ ... });
                await refreshArticles(); // Refresh needed after manual bulk delete
            } else {
                toast({ ... });
            }
        } catch (err) { ... }
        */
	}, [toast /*, userId, isSignedIn, refreshArticles */]); // Dependencies removed for placeholder

	return {
		addArticleByUrl,
		addArticleByFile,
		updateArticleStatus,
		updateReadingProgress, // Return the Dexie-based update function
		removeArticle,
		removeDuplicateLocalArticles, // Return the placeholder/disabled function
	};
}
