import { useToast } from "@/hooks/use-toast";
import { debounce } from "@/lib/utils"; // Import debounce
import {
	type CloudSyncStatus, // Import the status type
	deleteItemFromCloud,
	saveItemToCloud,
} from "@/services/cloudSync"; // Import cloud save and delete
import {
	type Article,
	deleteArticle,
	getArticle,
	removeDuplicateArticles, // Import the new function
	saveArticle,
	updateArticle,
} from "@/services/db";
// Removed static imports for dynamic loading below
// import {
// 	arrayBufferToBase64 as epubToBase64,
// 	extractEpubMetadata,
// 	isValidEpub,
// } from "@/services/epub";
import { parseArticle } from "@/services/parser";
// Removed static imports for dynamic loading below
// import {
// 	extractPdfMetadata,
// 	isValidPdf,
// 	arrayBufferToBase64 as pdfToBase64,
// } from "@/services/pdf";
import { useAuth } from "@clerk/clerk-react"; // Removed useUser as unused
import { useCallback, useMemo } from "react"; // Import useMemo

/**
 * Hook providing functions to perform actions on articles (add, update, delete).
 *
 * @param refreshArticles - A callback function to trigger a refresh of the article list after an action.
 */
export function useArticleActions(refreshArticles: () => Promise<void>) {
	const { toast } = useToast();
	const { userId, isSignedIn } = useAuth();

	// Debounced function for syncing progress updates to the cloud
	const debouncedSyncProgress = useMemo(
		() =>
			debounce((articleToSync: Article) => {
				saveItemToCloud(articleToSync)
					.then((status: CloudSyncStatus) => {
						if (status !== "success") {
							console.warn(
								`Debounced sync for progress update ${articleToSync._id} failed with status: ${status}`,
							);
						}
						// No console log on success to reduce noise
					})
					.catch((err) => {
						console.error(
							`Error syncing progress update for ${articleToSync._id}:`,
							err,
						);
					});
			}, 1500), // Debounce for 1.5 seconds
		[], // No dependencies, saveItemToCloud is a stable import
	);

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

				// Add default status when creating article from URL
				const articleWithUser: Omit<Article, "_id" | "_rev"> & {
					_id?: string;
					_rev?: string;
				} = {
					...parsedArticle,
					userId, // Assign the current Clerk user ID
					savedAt: Date.now(),
					status: "inbox", // Default status
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

				// Dynamically import epub functions first
				const epubModule = await import("@/services/epub");
				if (epubModule.isValidEpub(file)) {
					fileType = "epub";
					const fileBuffer = await file.arrayBuffer();
					const metadata = await epubModule.extractEpubMetadata(fileBuffer);
					const base64Content = epubModule.arrayBufferToBase64(fileBuffer);
					const estimatedReadingTime = await epubModule.getEstimatedReadingTime(
						fileBuffer.byteLength,
					);

					articleToSave = {
						userId,
						title: metadata.title || file.name.replace(/\.epub$/i, ""),
						type: "epub",
						fileData: base64Content,
						content: "EPUB content is stored in fileData.",
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
					};
				} else {
					// Dynamically import pdf functions only if not epub
					const pdfModule = await import("@/services/pdf");
					if (pdfModule.isValidPdf(file)) {
						fileType = "pdf";
						const fileBuffer = await file.arrayBuffer();
						const metadata = await pdfModule.extractPdfMetadata(
							file,
							fileBuffer,
						);
						const base64Content = pdfModule.arrayBufferToBase64(fileBuffer);
						const estimatedReadingTime =
							await pdfModule.getEstimatedReadingTime(
								fileBuffer.byteLength,
								metadata.pageCount,
							);

						articleToSave = {
							userId,
							title: metadata.title || file.name.replace(/\.pdf$/i, ""),
							type: "pdf",
							content: base64Content,
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
						};
					} else {
						// If neither EPUB nor PDF is valid
						throw new Error(
							"Invalid file type. Only EPUB and PDF formats are supported.",
						);
					}
				}

				// Save the article locally
				const savedArticle = await saveArticle(articleToSave);

				// Sync to Cloud (fire and forget)
				saveItemToCloud(savedArticle)
					.then((status: CloudSyncStatus) => {
						if (status === "success") {
							console.log(
								`Successfully synced ${fileType} ${savedArticle._id} to cloud.`,
							);
						} else {
							console.warn(
								`Sync for ${fileType} ${savedArticle._id} failed with status: ${status}`,
							);
						}
					})
					.catch((err) => {
						console.error(
							`Error syncing ${fileType} ${savedArticle._id} to cloud:`,
							err,
						);
					});

				// Show success toast
				toast({
					title: `${fileType?.toUpperCase()} saved`,
					description: `"${savedArticle.title}" has been saved.`,
				});

				// Trigger refresh after successful save
				await refreshArticles();

				return savedArticle; // Return the saved article on success
			} catch (err) {
				// Catch any error during the process (import, validation, save)
				console.error("Failed to add file:", err);
				toast({
					title: "Failed to save file",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while saving the file.",
					variant: "destructive",
				});
				return null; // Return null on failure
			}
		}, // End of async function passed to useCallback
		[toast, userId, isSignedIn, refreshArticles], // Dependencies for useCallback
	); // End of useCallback

	// Update article status (isRead, favorite, status)
	const updateArticleStatus = useCallback(
		async (
			id: string,
			updates: {
				isRead?: boolean;
				favorite?: boolean;
				status?: "inbox" | "later" | "archived";
			},
		) => {
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

				const updatePayload: Partial<Article> & { _id: string; _rev: string } =
					{
						_id: id,
						_rev: fetchedArticle._rev,
					};

				let statusUpdateMessage = "";
				if (updates.isRead !== undefined) {
					updatePayload.isRead = updates.isRead;
					if (updates.isRead && !fetchedArticle.readAt) {
						updatePayload.readAt = Date.now();
					}
					statusUpdateMessage = updates.isRead
						? "marked as read"
						: "marked as unread";
				}
				if (updates.favorite !== undefined) {
					updatePayload.favorite = updates.favorite;
					statusUpdateMessage = updates.favorite
						? "added to favorites"
						: "removed from favorites";
				}
				if (updates.status !== undefined) {
					updatePayload.status = updates.status;
					statusUpdateMessage = `moved to ${updates.status}`;
				}

				if (Object.keys(updatePayload).length <= 2) {
					// Only _id and _rev
					console.log("No actual updates provided to updateArticleStatus");
					return; // No actual updates to perform
				}

				const updatedArticle = await updateArticle(updatePayload);

				// Sync update to cloud (fire and forget)
				saveItemToCloud(updatedArticle)
					.then((status: CloudSyncStatus) => {
						if (status === "success") {
							console.log(
								`Successfully synced status update for ${id} to cloud.`,
							);
						} else {
							console.warn(
								`Sync for status update ${id} failed with status: ${status}`,
							);
						}
					})
					.catch((err) => {
						console.error(`Error syncing status update for ${id}:`, err);
					});

				toast({
					title: "Article updated",
					description: `Article ${statusUpdateMessage}.`,
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

				// Sync progress update to cloud using the debounced function
				debouncedSyncProgress(updatedArticle);

				// No refresh needed here, UI should update optimistically or via direct state update if required elsewhere
				// await refreshArticles(); // Avoid refreshing on every progress update
			} catch (err) {
				console.error("Failed to update reading progress:", err);
				// No toast for progress updates
			}
		},
		[userId, isSignedIn, debouncedSyncProgress], // Add stable debounced function
	);

	// Remove article - Returns true on successful DB delete, false otherwise.
	// Refresh is handled by the caller/context optimistically.
	const removeArticle = useCallback(
		async (id: string): Promise<boolean> => {
			if (!isSignedIn || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to remove articles.",
					variant: "destructive",
				});
				return false; // Indicate failure
			}

			try {
				// Fetch article first to verify ownership before deleting
				const articleToDelete = await getArticle(id);
				if (!articleToDelete) {
					// Already deleted or doesn't exist locally.
					// Refresh will reconcile with the cloud state.
					console.log(`Article ${id} not found locally during remove attempt.`);
					// Don't refresh here, let the caller handle UI state.
					// Consider if returning true is appropriate if already deleted locally.
					// For now, let's return true as the desired state (gone) is achieved locally.
					return true;
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

				// Trigger cloud deletion (fire and forget, but log errors)
				deleteItemFromCloud(id)
					.then((status: CloudSyncStatus) => {
						if (status === "success") {
							console.log(`Successfully triggered cloud deletion for ${id}.`);
						} else if (status === "not_found") {
							console.log(
								`Item ${id} already deleted or not found in cloud during deletion trigger.`,
							);
						} else {
							// Log other failures but don't block UI return, as local delete succeeded
							console.warn(
								`Cloud deletion trigger for ${id} failed with status: ${status}`,
							);
						}
					})
					.catch((err) => {
						// Log error but don't block UI return, as local delete succeeded
						console.error(`Error triggering cloud deletion for ${id}:`, err);
					});

				// No refresh here - handled optimistically by caller.
				return true; // Indicate success of local deletion
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
		[toast, userId, isSignedIn], // Removed refreshArticles dependency
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
