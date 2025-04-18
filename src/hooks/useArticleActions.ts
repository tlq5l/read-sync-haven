import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/authClient"; // Import authClient
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
import { parseArticle } from "@/services/parser";
import { useCallback, useMemo } from "react"; // Import useMemo

/**
 * Hook providing functions to perform actions on articles (add, update, delete).
 *
 * @param refreshArticles - A callback function to trigger a refresh of the article list after an action.
 */
export function useArticleActions(refreshArticles: () => Promise<void>) {
	const { toast } = useToast();
	const { data: session } = authClient.useSession(); // Use session hook
	const userId = session?.user?.id; // Derive userId

	// Debounced function for syncing progress updates to the cloud
	const debouncedSyncProgress = useMemo(
		() =>
			debounce((articleToSync: Article) => {
				// Check if session exists before syncing
				if (!session) {
					console.warn("Debounced sync skipped: User not authenticated.");
					return;
				}
				saveItemToCloud(articleToSync)
					.then((status: CloudSyncStatus) => {
						if (status !== "success") {
							console.warn(
								`Debounced sync for progress update ${articleToSync._id} failed with status: ${status}`,
							);
						}
					})
					.catch((err) => {
						console.error(
							`Error syncing progress update for ${articleToSync._id}:`,
							err,
						);
					});
			}, 1500),
		[session], // Depend on session
	);

	// Add article by URL
	const addArticleByUrl = useCallback(
		async (url: string): Promise<Article | null> => {
			// Check session and derived userId
			if (!session || !userId) {
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
					userId, // Use derived userId
					savedAt: Date.now(),
					status: "inbox",
					isRead: false,
					favorite: false,
					tags: [],
					readingProgress: 0,
				};

				const savedArticle = await saveArticle(articleWithUser);

				toast({
					title: "Article saved",
					description: `"${parsedArticle.title}" has been saved.`,
				});

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
		[toast, session, userId, refreshArticles], // Updated dependencies
	);

	// Add article by file (EPUB or PDF)
	const addArticleByFile = useCallback(
		async (file: File): Promise<Article | null> => {
			// Check session and derived userId
			if (!session || !userId) {
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
						userId, // Use derived userId
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
							userId, // Use derived userId
							title: metadata.title || file.name.replace(/\.pdf$/i, ""),
							type: "pdf",
							content: base64Content, // For PDFs, content might still be used? Revisit if fileData preferred.
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
						throw new Error(
							"Invalid file type. Only EPUB and PDF formats are supported.",
						);
					}
				}

				const savedArticle = await saveArticle(articleToSave);

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

				toast({
					title: `${fileType?.toUpperCase()} saved`,
					description: `"${savedArticle.title}" has been saved.`,
				});

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
		[toast, session, userId, refreshArticles], // Updated dependencies
	);

	// Update article status
	const updateArticleStatus = useCallback(
		async (
			id: string,
			updates: {
				isRead?: boolean;
				favorite?: boolean;
				status?: "inbox" | "later" | "archived";
			},
		) => {
			// Check session and derived userId
			if (!session || !userId) {
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

				if (fetchedArticle.userId !== userId) {
					// Use derived userId
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
					console.log("No actual updates provided to updateArticleStatus");
					return;
				}

				const updatedArticle = await updateArticle(updatePayload);

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
		[toast, session, userId, refreshArticles], // Updated dependencies
	);

	// Update reading progress
	const updateReadingProgress = useCallback(
		async (id: string, progress: number) => {
			// Check session and derived userId first
			if (!session || !userId) return; // Silently fail if not signed in

			try {
				const fetchedArticle = await getArticle(id);
				if (!fetchedArticle || !fetchedArticle._rev) {
					console.warn(
						`Could not retrieve article ${id} for progress update. It might have been deleted.`,
					);
					return;
				}

				if (fetchedArticle.userId !== userId) {
					// Use derived userId
					console.warn(
						`Permission denied to update progress for article ${id}.`,
					);
					return;
				}

				const currentProgress = fetchedArticle.readingProgress ?? 0;
				if (Math.abs(progress - currentProgress) < 1 && progress !== 100) {
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

				debouncedSyncProgress(updatedArticle);
			} catch (err) {
				console.error("Failed to update reading progress:", err);
			}
		},
		[session, userId, debouncedSyncProgress], // Updated dependencies
	);

	// Remove article
	const removeArticle = useCallback(
		async (id: string): Promise<boolean> => {
			// Check session and derived userId
			if (!session || !userId) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to remove articles.",
					variant: "destructive",
				});
				return false;
			}

			try {
				const articleToDelete = await getArticle(id);
				if (!articleToDelete) {
					console.log(`Article ${id} not found locally during remove attempt.`);
					return true;
				}

				if (articleToDelete.userId !== userId) {
					// Use derived userId
					throw new Error("Permission denied to remove this article.");
				}

				if (!articleToDelete._rev) {
					throw new Error("Cannot delete article without revision ID.");
				}

				await deleteArticle(id, articleToDelete._rev);

				toast({
					title: "Article removed",
					description: "The article has been removed.",
				});

				deleteItemFromCloud(id)
					.then((status: CloudSyncStatus) => {
						if (status === "success") {
							console.log(`Successfully triggered cloud deletion for ${id}.`);
						} else if (status === "not_found") {
							console.log(
								`Item ${id} already deleted or not found in cloud during deletion trigger.`,
							);
						} else {
							console.warn(
								`Cloud deletion trigger for ${id} failed with status: ${status}`,
							);
						}
					})
					.catch((err) => {
						console.error(`Error triggering cloud deletion for ${id}:`, err);
					});

				return true;
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
				return false;
			}
		},
		[toast, session, userId], // Updated dependencies
	);

	// Remove duplicate articles locally
	const removeDuplicateLocalArticles = useCallback(async () => {
		// Check session and derived userId
		if (!session || !userId) {
			toast({
				title: "Authentication Required",
				description: "Please sign in to manage articles.",
				variant: "destructive",
			});
			return;
		}

		try {
			console.log("Attempting to remove duplicate articles...");
			// removeDuplicateArticles likely doesn't need userId if it operates globally or fetches internally
			const removedCount = await removeDuplicateArticles();

			if (removedCount > 0) {
				toast({
					title: "Duplicates Removed",
					description: `${removedCount} duplicate article(s) removed locally.`,
				});
				await refreshArticles();
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
	}, [toast, session, userId, refreshArticles]); // Updated dependencies

	return {
		addArticleByUrl,
		addArticleByFile,
		updateArticleStatus,
		updateReadingProgress,
		removeArticle,
		removeDuplicateLocalArticles,
	};
}
