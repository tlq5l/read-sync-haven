import type { ArticleView } from "@/hooks/useArticleView"; // Assuming this path is correct
import { fetchCloudItems, saveItemToCloud } from "@/services/cloudSync";
import type { Article } from "@/services/db";
import { getAllArticles } from "@/services/db";
import type { UserResource } from "@clerk/types"; // Import UserResource type

/**
 * Filters and sorts articles based on the specified view.
 *
 * @param articlesToFilter - The array of articles to process.
 * @param view - The current article view ('all', 'unread', 'favorites').
 * @returns A new array containing the filtered and sorted articles.
 */
export const filterAndSortArticles = (
	articlesToFilter: Article[],
	view: ArticleView,
): Article[] => {
	let filtered = articlesToFilter;
	if (view === "unread") {
		filtered = articlesToFilter.filter((a) => !a.isRead);
	} else if (view === "favorites") {
		filtered = articlesToFilter.filter((a) => a.favorite);
	}
	// Sort by savedAt descending
	filtered.sort((a, b) => b.savedAt - a.savedAt);
	return filtered;
};

/**
 * Performs a one-time sync for existing local EPUB/PDF files that haven't been synced to the cloud yet.
 * This prevents duplicate uploads on subsequent loads.
 *
 * @param currentUserId - The ID of the currently logged-in user.
 * @param getTokenFn - Function to retrieve the authentication token.
 * @param currentUser - The Clerk user object.
 */
export const runOneTimeFileSync = async (
	currentUserId: string | null | undefined,
	getTokenFn: () => Promise<string | null>,
	currentUser: UserResource | null | undefined, // Use UserResource type
) => {
	if (!currentUserId) return;

	const syncFlagKey = `hasSyncedExistingFiles_${currentUserId}`;
	try {
		const hasSynced = localStorage.getItem(syncFlagKey);
		if (!hasSynced) {
			console.log(
				"Utils: Running one-time sync for existing local EPUB/PDF files...",
			);
			const localArticles = await getAllArticles({
				userIds: [currentUserId],
			});
			const localFilesToSync = localArticles.filter(
				(a) => a.type === "epub" || a.type === "pdf",
			);

			if (localFilesToSync.length > 0) {
				const token = await getTokenFn();
				const userEmail = currentUser?.primaryEmailAddress?.emailAddress;
				let cloudIds: Set<string> = new Set();
				if (token) {
					try {
						const cloudItems = await fetchCloudItems(token, userEmail);
						cloudIds = new Set(cloudItems.map((item) => item._id));
					} catch (fetchErr) {
						console.warn(
							"Utils: Error fetching cloud items for one-time sync check:",
							fetchErr,
						);
						// Proceed without cloud check if fetch fails
					}
				} else {
					console.warn(
						"Utils: Could not get token for one-time sync check. Skipping cloud ID check.",
					);
				}

				const unsyncedFiles = localFilesToSync.filter(
					(localFile) => !cloudIds.has(localFile._id),
				);

				console.log(
					`Utils: Found ${unsyncedFiles.length} local EPUB/PDF files to sync.`,
				);

				let syncErrors = 0;
				for (const articleToSync of unsyncedFiles) {
					try {
						// Ensure the article has the correct user ID before syncing
						const articleWithCorrectUser = {
							...articleToSync,
							userId: currentUserId,
						};
						const success = await saveItemToCloud(articleWithCorrectUser);
						if (success) {
							console.log(
								`Utils: One-time sync: Successfully synced ${articleToSync._id} (${articleToSync.type})`,
							);
						} else {
							syncErrors++;
							console.warn(
								`Utils: One-time sync: Failed to sync ${articleToSync._id} (API returned false)`,
							);
						}
					} catch (syncErr) {
						syncErrors++;
						console.error(
							`Utils: One-time sync: Error syncing ${articleToSync._id}:`,
							syncErr,
						);
					}
				}

				if (syncErrors === 0) {
					console.log(
						"Utils: One-time sync completed successfully for all files.",
					);
					localStorage.setItem(syncFlagKey, "true");
				} else {
					console.warn(
						`Utils: One-time sync completed with ${syncErrors} errors. Will retry on next load.`,
					);
				}
			} else {
				console.log(
					"Utils: No local EPUB/PDF files found requiring one-time sync.",
				);
				localStorage.setItem(syncFlagKey, "true");
			}
		} else {
			// console.log("Utils: One-time sync for existing files already completed.");
		}
	} catch (oneTimeSyncError) {
		console.error(
			"Utils: Error during one-time sync process:",
			oneTimeSyncError,
		);
	}
};
