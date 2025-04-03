import { useToast } from "@/hooks/use-toast";
import { debounce } from "@/lib/utils";
import { type CloudSyncStatus, saveItemToCloud } from "@/services/cloudSync";
import { type Article, getArticle, updateArticle } from "@/services/db";
import { useAuth } from "@clerk/clerk-react";
import { useCallback, useMemo } from "react";

export function useReadingProgress() {
	const { userId, isSignedIn } = useAuth();
	// Note: Toast is not used here, but kept in case error handling needs it later.
	// const { toast } = useToast();

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

			} catch (err) {
				console.error("Failed to update reading progress:", err);
				// No toast for progress updates
			}
		},
		[userId, isSignedIn, debouncedSyncProgress], // Add stable debounced function
	);

	return { updateReadingProgress };
}