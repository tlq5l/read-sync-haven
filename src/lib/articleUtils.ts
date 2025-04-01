import type { ArticleView } from "@/hooks/useArticleView"; // Assuming this path is correct
import { fetchCloudItems, saveItemToCloud } from "@/services/cloudSync";
import type { Article } from "@/services/db";
import { getAllArticles, updateArticle } from "@/services/db"; // Import updateArticle
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
 * Removes duplicate articles from the provided array based on _id field.
 * If duplicates are found, the most recent version (highest savedAt value) is kept.
 *
 * @param articles - Array of articles that may contain duplicates
 * @returns A new array with duplicates removed, keeping the most recent versions
 */
export const deduplicateArticles = (articles: Article[]): Article[] => {
	// Use a Map to track the most recent version of each article by _id
	const articleMap = new Map<string, Article>();

	// Process each article
	for (const article of articles) {
		if (!article._id) continue; // Skip articles without an _id

		// If we haven't seen this article before or this version is newer
		const existingArticle = articleMap.get(article._id);
		if (!existingArticle || article.savedAt > existingArticle.savedAt) {
			articleMap.set(article._id, article);
		}
	}

	// Convert the Map values back to an array
	return Array.from(articleMap.values());
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

			// --- Start Local EPUB Migration ---
			let migrationErrors = 0;
			// Find local EPUBs with potential content as base64 data but missing fileData field
			const localEpubsToMigrate = localArticles.filter(
				(a) =>
					a.type === "epub" &&
					!a.fileData && // fileData is missing
					a.content &&
					a.content.length > 100 && // content exists and is long enough to be base64
					!a.content.startsWith("<") && // Not likely HTML content
					a._id &&
					a._rev, // Ensure we have ID and revision for update
			);

			if (localEpubsToMigrate.length > 0) {
				console.log(
					`Utils: Found ${localEpubsToMigrate.length} local EPUBs potentially needing migration.`,
				);
				for (const epub of localEpubsToMigrate) {
					console.log(
						`Utils: Attempting migration for local EPUB ${epub._id}...`,
					);
					try {
						// MIGRATE: Move content to fileData and set placeholder in content
						const updates = {
							_id: epub._id as string, // Already checked existence
							_rev: epub._rev as string, // Already checked existence
							fileData: epub.content, // Move content to fileData
							content: "EPUB content migrated locally.", // Set placeholder
						};
						await updateArticle(updates);
						console.log(`Utils: Successfully migrated local EPUB ${epub._id}.`);
					} catch (migrationErr) {
						migrationErrors++;
						console.error(
							`Utils: Error migrating local EPUB ${epub._id}:`,
							migrationErr,
						);
					}
				}
				if (migrationErrors > 0) {
					console.warn(
						`Utils: Completed local EPUB migration with ${migrationErrors} errors.`,
					);
				} else {
					console.log("Utils: Local EPUB migration completed successfully.");
				}
			}
			// --- End Local EPUB Migration ---

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
			console.log("Utils: One-time sync for existing files already completed.");
		}
	} catch (oneTimeSyncError) {
		console.error(
			"Utils: Error during one-time sync process:",
			oneTimeSyncError,
		);
	}
};
