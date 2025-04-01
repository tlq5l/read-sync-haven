import { useToast } from "@/hooks/use-toast";
import { saveItemToCloud } from "@/services/cloudSync"; // Import cloud save
import {
	type Article,
	deleteArticle,
	getArticle,
	removeDuplicateArticles, // Import the new function
	saveArticle,
	updateArticle,
} from "@/services/db";
import {
	arrayBufferToBase64 as epubToBase64,
	extractEpubMetadata,
	isValidEpub,
} from "@/services/epub";
import { parseArticle } from "@/services/parser";
import {
	extractPdfMetadata,
	isValidPdf,
	arrayBufferToBase64 as pdfToBase64,
} from "@/services/pdf";
import { useAuth } from "@clerk/clerk-react"; // Removed useUser as unused
import { useCallback } from "react";

/**
 * Hook providing functions to perform actions on articles (add, update, delete).
 *
 * @param refreshArticles - A callback function to trigger a refresh of the article list after an action.
 */
export function useArticleActions(refreshArticles: () => Promise<void>) {
	const { toast } = useToast();
	const { userId, isSignedIn } = useAuth();
	// const { user } = useUser(); // Removed as unused - permission checks use userId directly

	// Add article by URL
	const addArticleByUrl = useCallback(
		async (url: string): Promise<Article | null> => {
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to save articles.",
					variant: "destructive",
				});
				return null;
			}

			try {
				const parsedArticle = await parseArticle(url);

				const articleWithUser: Omit<Article, "_id" | "_rev"> & {
					_id?: string;
					_rev?: string;
				} = {
					...parsedArticle,
					userId, // Assign the current Clerk user ID
					savedAt: Date.now(),
					isRead: false,
					favorite: false,
					tags: [],
					readingProgress: 0, // Initialize progress
				};

				const savedArticle = await saveArticle(articleWithUser);

				toast({
					title: "Article saved",
					description: `"${parsedArticle.title}" has been saved.`,
				});

				// Trigger refresh after successful save
				await refreshArticles();

				return savedArticle;
			} catch (err) {
				console.error("Failed to add article by URL:", err);
				toast({
					title: "Failed to save article",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while saving the article.",
					variant: "destructive",
				});
				return null;
			}
		},
		[toast, userId, isSignedIn, refreshArticles],
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
				let articleToSave: Omit<Article, "_id" | "_rev"> & {
					_id?: string;
					_rev?: string;
				};
				let fileType: "epub" | "pdf" | null = null;

				if (isValidEpub(file)) {
					fileType = "epub";
					const fileBuffer = await file.arrayBuffer();
					const metadata = await extractEpubMetadata(fileBuffer);
					const base64Content = epubToBase64(fileBuffer);

					articleToSave = {
						userId,
						title: metadata.title || file.name.replace(/\.epub$/i, ""),
						type: "epub",
						fileData: base64Content, // Store base64 in fileData for EPUB
						content: "EPUB content is stored in fileData.", // Placeholder for content field
						url: `local-epub://${file.name}`,
						savedAt: Date.now(),
						isRead: false,
						favorite: false,
						tags: [],
						author: metadata.author,
						publishedDate: metadata.publishedDate,
						excerpt: metadata.description || "EPUB file",
						readingProgress: 0,
					};
				} else if (isValidPdf(file)) {
					fileType = "pdf";
					const fileBuffer = await file.arrayBuffer();
					const metadata = await extractPdfMetadata(file, fileBuffer);
					const base64Content = pdfToBase64(fileBuffer);

					articleToSave = {
						userId,
						title: metadata.title || file.name.replace(/\.pdf$/i, ""),
						type: "pdf",
						content: base64Content,
						url: `local-pdf://${file.name}`,
						savedAt: Date.now(),
						isRead: false,
						favorite: false,
						tags: [],
						author: metadata.author,
						publishedDate: metadata.publishedDate,
						excerpt: metadata.description || "PDF file",
						pageCount: metadata.pageCount,
						readingProgress: 0,
					};
				} else {
					throw new Error(
						"Invalid file type. Only EPUB and PDF formats are supported.",
					);
				}

				const savedArticle = await saveArticle(articleToSave);

				// Sync to Cloud (fire and forget)
				saveItemToCloud(savedArticle)
					.then((success) => {
						if (success) {
							console.log(
								`Successfully synced ${fileType} ${savedArticle._id} to cloud.`,
							);
						} else {
							console.warn(
								`Failed to sync ${fileType} ${savedArticle._id} to cloud (API returned false).`,
							);
						}
					})
					.catch((err) => {
						console.error(
							`Error syncing ${fileType} ${savedArticle._id} to cloud:`,
							err,
						);
					});

				toast({
					title: `${fileType?.toUpperCase()} saved`,
					description: `"${savedArticle.title}" has been saved.`,
				});

				// Trigger refresh after successful save
				await refreshArticles();

				return savedArticle;
			} catch (err) {
				console.error("Failed to add file:", err);
				toast({
					title: "Failed to save file",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while saving the file.",
					variant: "destructive",
				});
				return null;
			}
		},
		[toast, userId, isSignedIn, refreshArticles],
	);

	// Update article read status and favorite status
	const updateArticleStatus = useCallback(
		async (id: string, isRead: boolean, favorite?: boolean) => {
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to update articles.",
					variant: "destructive",
				});
				return;
			}

			try {
				const fetchedArticle = await getArticle(id);
				if (!fetchedArticle || !fetchedArticle._rev) {
					throw new Error(
						"Could not retrieve article details for update. It might have been deleted.",
					);
				}

				// Basic permission check (can be enhanced)
				if (fetchedArticle.userId !== userId) {
					throw new Error("Permission denied to update this article.");
				}

				const updates: Partial<Article> & { _id: string; _rev: string } = {
					_id: id,
					_rev: fetchedArticle._rev,
					isRead,
				};

				if (favorite !== undefined) {
					updates.favorite = favorite;
				}
				if (isRead && !fetchedArticle.readAt) {
					updates.readAt = Date.now();
				}

				const updatedArticle = await updateArticle(updates);

				// Sync update to cloud (fire and forget)
				saveItemToCloud(updatedArticle)
					.then((success) => {
						if (success) {
							console.log(
								`Successfully synced status update for ${id} to cloud.`,
							);
						} else {
							console.warn(
								`Failed to sync status update for ${id} (API returned false).`,
							);
						}
					})
					.catch((err) => {
						console.error(`Error syncing status update for ${id}:`, err);
					});

				// Trigger refresh to reflect changes everywhere
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
		[toast, userId, isSignedIn, refreshArticles],
	);

	// Update reading progress
	const updateReadingProgress = useCallback(
		async (id: string, progress: number) => {
			if (!isSignedIn || !userId) return; // Silently fail if not signed in

			try {
				const fetchedArticle = await getArticle(id);
				if (!fetchedArticle || !fetchedArticle._rev) {
					console.warn(
						`Could not retrieve article ${id} for progress update. It might have been deleted.`,
					);
					return;
				}

				// Basic permission check
				if (fetchedArticle.userId !== userId) {
					console.warn(
						`Permission denied to update progress for article ${id}.`,
					);
					return;
				}

				// Avoid unnecessary updates if progress hasn't changed significantly
				const currentProgress = fetchedArticle.readingProgress ?? 0;
				if (Math.abs(progress - currentProgress) < 1 && progress !== 100) {
					// Allow explicit 100%
					return;
				}

				const updates: Partial<Article> & { _id: string; _rev: string } = {
					_id: id,
					_rev: fetchedArticle._rev,
					readingProgress: progress,
				};

				if (progress >= 90 && !fetchedArticle.isRead) {
					updates.isRead = true;
					updates.readAt = Date.now();
				}

				const updatedArticle = await updateArticle(updates);

				// Sync progress update to cloud (fire and forget, maybe less frequently?)
				// Consider debouncing this or only syncing significant changes
				saveItemToCloud(updatedArticle)
					.then((success) => {
						if (success) {
							// console.log(`Synced progress update for ${id} to cloud.`); // Maybe too noisy
						} else {
							console.warn(
								`Failed to sync progress update for ${id} (API returned false).`,
							);
						}
					})
					.catch((err) => {
						console.error(`Error syncing progress update for ${id}:`, err);
					});

				// No refresh needed here, UI should update optimistically or via direct state update if required elsewhere
				// await refreshArticles(); // Avoid refreshing on every progress update
			} catch (err) {
				console.error("Failed to update reading progress:", err);
				// No toast for progress updates
			}
		},
		[userId, isSignedIn], // No toast or refresh needed here
	);

	// Remove article
	const removeArticle = useCallback(
		async (
			id: string /* rev: string - Removed as unused, fetched internally */,
		) => {
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to remove articles.",
					variant: "destructive",
				});
				return;
			}

			try {
				// Fetch article first to verify ownership before deleting
				const articleToDelete = await getArticle(id);
				if (!articleToDelete) {
					// Already deleted or doesn't exist
					toast({
						title: "Article not found",
						description: "It may have already been removed.",
					});
					await refreshArticles(); // Refresh to ensure list consistency
					return;
				}

				if (articleToDelete.userId !== userId) {
					throw new Error("Permission denied to remove this article.");
				}

				// Use the revision from the fetched article for safety, ignore passed 'rev'
				if (!articleToDelete._rev) {
					throw new Error("Cannot delete article without revision ID.");
				}

				await deleteArticle(id, articleToDelete._rev);

				toast({
					title: "Article removed",
					description: "The article has been removed.",
				});

				// Trigger refresh after successful delete
				await refreshArticles();
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
			}
		},
		[toast, userId, isSignedIn, refreshArticles],
	);

	// Remove duplicate articles locally
	const removeDuplicateLocalArticles = useCallback(async () => {
		if (!isSignedIn || !userId) {
			toast({
				title: "Authentication Required",
				description: "Please sign in to manage articles.",
				variant: "destructive",
			});
			return;
		}

		try {
			console.log("Attempting to remove duplicate articles...");
			const removedCount = await removeDuplicateArticles();

			if (removedCount > 0) {
				toast({
					title: "Duplicates Removed",
					description: `${removedCount} duplicate article(s) removed locally.`,
				});
				await refreshArticles(); // Refresh the list
			} else {
				toast({
					title: "No Duplicates Found",
					description: "No duplicate articles were found locally.",
				});
			}
		} catch (err) {
			console.error("Failed to remove duplicate articles:", err);
			toast({
				title: "Failed to Remove Duplicates",
				description:
					err instanceof Error
						? err.message
						: "An error occurred while removing duplicates.",
				variant: "destructive",
			});
		}
	}, [toast, userId, isSignedIn, refreshArticles]);

	return {
		addArticleByUrl,
		addArticleByFile,
		updateArticleStatus,
		updateReadingProgress,
		removeArticle,
		removeDuplicateLocalArticles, // Ensure the function is returned
	};
}
