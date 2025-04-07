import { db } from "@/services/db/dexie"; // Import dexie db
// import { useToast } from "@/hooks/use-toast"; // Removed unused import
// Removed unused import: import { debounce } from "@/lib/utils";
// Removed cloudSync import
import type { Article } from "@/services/db/types"; // Update type import path
import { useAuth } from "@clerk/clerk-react"; // Keep useAuth for userId/isSignedIn check
import { useCallback } from "react"; // Removed unused useMemo

export function useReadingProgress() {
	const { userId, isSignedIn } = useAuth(); // Removed getToken
	// Note: Toast is not used here.

	// Removed debouncedSyncProgress logic as cloud sync is removed

	// Update reading progress
	const updateReadingProgress = useCallback(
		async (id: string, progress: number) => {
			if (!isSignedIn || !userId) return; // Silently fail if not signed in

			try {
				// Fetch using Dexie
				const fetchedArticle = await db.articles.get(id);
				if (!fetchedArticle) {
					// No _rev in Dexie
					console.warn(`Could not retrieve article ${id} for progress update.`);
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

				// Prepare updates for Dexie
				// We only need the fields being changed
				const updates: Partial<
					Pick<Article, "readingProgress" | "isRead" | "readAt">
				> = {
					readingProgress: progress,
				};

				if (progress >= 90 && !fetchedArticle.isRead) {
					updates.isRead = true;
					updates.readAt = Date.now();
				}

				// Update using Dexie's update method
				const updateCount = await db.articles.update(id, updates);

				if (updateCount === 0) {
					console.warn(`Article ${id} not found for progress update.`);
					return;
				}
				// Removed cloud sync call (debouncedSyncProgress)
			} catch (err) {
				console.error("Failed to update reading progress:", err);
				// No toast for progress updates
			}
		},
		[userId, isSignedIn], // Removed debouncedSyncProgress dependency
	);

	return { updateReadingProgress };
}
