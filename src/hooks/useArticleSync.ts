import { useToast } from "@/hooks/use-toast";
import {
	deduplicateArticles,
	filterAndSortArticles,
	runOneTimeFileSync,
} from "@/lib/articleUtils";
import { fetchCloudItems } from "@/services/cloudSync";
import { type Article, getAllArticles, saveArticle } from "@/services/db";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ArticleView } from "./useArticleView"; // Import the type

/**
 * Hook to manage article fetching, synchronization, and state.
 *
 * @param isInitialized - Whether the database is initialized.
 * @param currentView - The current article view filter ('all', 'unread', 'favorites').
 * @returns An object containing articles, loading states, errors, and refresh/retry functions.
 */
export function useArticleSync(
	isInitialized: boolean,
	currentView: ArticleView,
) {
	const [articles, setArticles] = useState<Article[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true); // True initially
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);
	const fetchLockRef = useRef<boolean>(false);
	const { toast } = useToast();
	const { userId, isSignedIn, isLoaded, getToken } = useAuth();
	const { user } = useUser();

	// --- Internal Core Logic Functions (Wrapped in useCallback) ---

	const loadArticlesFromCache = useCallback(
		async (isMounted: boolean): Promise<boolean> => {
			if (!isSignedIn || !userId) return false;

			try {
				console.log(
					`Sync Hook: Attempting to load articles from cache for user ${userId}...`,
				);
				const cachedArticles = await getAllArticles({ userIds: [userId] });

				if (isMounted && cachedArticles && cachedArticles.length > 0) {
					console.log(
						`Sync Hook: Loaded ${cachedArticles.length} articles from cache.`,
					);
					// Deduplicate articles before filtering and sorting
					const dedupedArticles = deduplicateArticles(cachedArticles);
					if (dedupedArticles.length < cachedArticles.length) {
						console.log(
							`Sync Hook: Removed ${cachedArticles.length - dedupedArticles.length} duplicate articles from cache.`,
						);
					}
					const filteredCached = filterAndSortArticles(
						dedupedArticles,
						currentView,
					);
					setArticles(filteredCached);
					setIsLoading(false);
					setIsRefreshing(true); // Start background refresh after cache load
					return true; // Loaded from cache
				}
				if (isMounted) {
					console.log(
						"Sync Hook: No articles found in cache or component unmounted.",
					);
					setIsLoading(true); // Need to load from cloud
					setIsRefreshing(false);
					setArticles([]); // Ensure articles are empty if cache is empty
				}
			} catch (cacheErr) {
				console.error(
					"Sync Hook: Error loading articles from cache:",
					cacheErr,
				);
				if (isMounted) {
					setIsLoading(true); // Need to try cloud
					setIsRefreshing(false);
					setArticles([]); // Clear articles on cache error
				}
			}
			return false; // Not loaded from cache
		},
		// Dependencies: These influence the cache query or filtering
		[isSignedIn, userId, currentView],
	);

	const performCloudSync = useCallback(
		async (isMounted: boolean, loadedFromCache: boolean) => {
			if (!isSignedIn || !userId) return;

			if (!loadedFromCache && isMounted) {
				setIsLoading(true);
				setIsRefreshing(false);
			}

			let syncTimeoutId: NodeJS.Timeout | null = null;
			let syncInProgress = true;

			syncTimeoutId = setTimeout(() => {
				if (isMounted && syncInProgress) {
					console.warn(
						`Sync Hook: Cloud sync for ${currentView} view timed out`,
					);
					if (isMounted) {
						setIsRefreshing(false);
						fetchLockRef.current = false; // Release lock on timeout
						const timeoutError = new Error(
							`Syncing ${currentView} articles timed out. Displaying cached data.`,
						);
						setError(timeoutError); // Set error on timeout
						toast({
							title: "Sync Timeout",
							description: timeoutError.message,
							variant: "default",
						});
					}
				}
			}, 15000); // 15 second timeout

			try {
				console.log("Sync Hook: Starting sync with cloud...");
				const token = await getToken();
				const userEmail = user?.primaryEmailAddress?.emailAddress;

				if (!token) {
					throw new Error("Could not retrieve authentication token for sync.");
				}

				const fetchedArticles = await fetchCloudItems(token, userEmail);
				syncInProgress = false; // Mark sync as complete before processing
				if (syncTimeoutId) clearTimeout(syncTimeoutId);

				console.log(
					`Sync Hook: Synced ${fetchedArticles.length} articles from cloud for user ${userId} / ${userEmail}`,
				);

				// Filter out incomplete articles before saving
				const completeArticles = fetchedArticles.filter((article) => {
					const hasEssentialFields =
						article.title && article.url && article.content;
					if (!hasEssentialFields) {
						console.warn(
							`Sync Hook: Skipping save for incomplete article ${article._id} (missing title, url, or content)`,
						);
					}
					return hasEssentialFields;
				});

				// Save/Update fetched articles locally
				if (completeArticles.length > 0) {
					console.log(
						`Sync Hook: Attempting to save/update ${completeArticles.length} complete synced articles locally...`,
					);
					for (const article of completeArticles) {
						try {
							// Preprocess article before saving, especially EPUBs
							const articleToSave = { ...article, userId }; // Create a mutable copy with userId

							if (articleToSave.type === "epub") {
								// Check if fileData is missing but content looks like Base64 (migration needed)
								if (
									!articleToSave.fileData &&
									articleToSave.content &&
									articleToSave.content.length > 100
								) {
									// Basic check for Base64-like content
									console.warn(
										`Sync Hook: Migrating EPUB ${articleToSave._id} from content to fileData during cloud sync.`,
									);
									articleToSave.fileData = articleToSave.content; // Move content to fileData
									articleToSave.content =
										"EPUB content migrated from content field."; // Set placeholder
								} else if (articleToSave.fileData) {
									// Ensure content is just a placeholder if fileData exists
									articleToSave.content = "EPUB content is stored in fileData.";
								} else {
									// EPUB type but no fileData and content doesn't look like Base64
									console.warn(
										`Sync Hook: EPUB ${articleToSave._id} from cloud is missing fileData.`,
									);
									// Keep original content for now, might be a placeholder already
								}
							}
							// TODO: Similar check might be needed for PDF if fileData is used there too

							await saveArticle(articleToSave); // Save the potentially modified article
						} catch (saveErr) {
							console.warn(
								`Sync Hook: Failed to save/update synced article ${article._id} locally:`,
								saveErr,
							);
						}
					}
					console.log(
						"Sync Hook: Finished saving/updating synced articles locally.",
					);
				}

				// Re-fetch from local DB AFTER saving cloud data
				console.log(
					"Sync Hook: Re-fetching articles from local DB after sync...",
				);
				const localArticlesAfterSync = await getAllArticles({
					userIds: [userId],
				});
				console.log(
					`Sync Hook: Fetched ${localArticlesAfterSync.length} articles locally after sync.`,
				);

				// Deduplicate articles after sync
				const dedupedArticlesAfterSync = deduplicateArticles(
					localArticlesAfterSync,
				);
				if (dedupedArticlesAfterSync.length < localArticlesAfterSync.length) {
					console.log(
						`Sync Hook: Removed ${localArticlesAfterSync.length - dedupedArticlesAfterSync.length} duplicate articles after sync.`,
					);
				}

				const filteredArticles = filterAndSortArticles(
					dedupedArticlesAfterSync,
					currentView,
				);

				if (isMounted) {
					setArticles(filteredArticles);
					setError(null); // Clear error on successful sync
				}

				// Run one-time sync for existing local files
				await runOneTimeFileSync(userId, getToken, user);
			} catch (syncErr) {
				syncInProgress = false; // Mark sync as complete on error too
				if (syncTimeoutId) clearTimeout(syncTimeoutId);
				console.error(
					`Sync Hook: Failed to sync articles for ${currentView} view:`,
					syncErr,
				);

				if (isMounted) {
					const error =
						syncErr instanceof Error
							? syncErr
							: new Error("Failed to sync articles");
					// Only set global error if cache didn't load initially
					if (!loadedFromCache) {
						setError(error);
						setArticles([]); // Clear articles if sync fails AND cache didn't load
					}
					toast({
						title: "Cloud Sync Failed",
						description: `${error.message}. Displaying local data if available.`,
						variant: "destructive",
					});
				}
			} finally {
				if (isMounted) {
					setIsLoading(false);
					setIsRefreshing(false);
				}
				// Lock is released within the main effect or refresh function
			}
		},
		// Dependencies: These influence the cloud sync operation
		// filterAndSortArticles and runOneTimeFileSync are stable imports from "@/lib/articleUtils"
		[isSignedIn, userId, getToken, user, currentView, toast],
	);

	// --- Main Load and Sync Effect ---
	useEffect(() => {
		let isMounted = true; // Track mount status for async operations

		const loadData = async () => {
			if (!isInitialized || !isLoaded) {
				if (!isInitialized) setIsLoading(true);
				if (!isLoaded) setIsLoading(true);
				setArticles([]);
				setIsRefreshing(false);
				setError(null);
				return;
			}

			if (fetchLockRef.current) {
				console.log("Sync Hook: Load/Sync already in progress, skipping");
				return;
			}

			fetchLockRef.current = true;
			if (!isRefreshing) {
				setError(null); // Clear error only if not already refreshing
			}

			try {
				// 1. Load from cache
				const loadedFromCache = await loadArticlesFromCache(isMounted);

				// 2. Sync with cloud (always runs if signed in and cache load finished)
				if (isSignedIn && userId) {
					await performCloudSync(isMounted, loadedFromCache);
				} else if (isMounted) {
					// Not signed in, ensure state is clean
					setArticles([]);
					setIsLoading(false);
					setIsRefreshing(false);
					setError(null);
				}
			} catch (err) {
				// Catch errors from loadArticlesFromCache if any (though it handles internally)
				console.error("Sync Hook: Unexpected error during loadData:", err);
				if (isMounted) {
					setError(
						err instanceof Error
							? err
							: new Error("An unexpected error occurred"),
					);
					setIsLoading(false);
					setIsRefreshing(false);
				}
			} finally {
				if (isMounted) {
					// Ensure loading/refreshing states are eventually false
					// performCloudSync handles its own state updates, but this is a safeguard
					setIsLoading(false);
					// Don't set refreshing false here if sync started it
				}
				fetchLockRef.current = false; // Release lock
			}
		};

		loadData();

		return () => {
			isMounted = false;
			// Cleanup logic (e.g., clear timeouts) is now handled within performCloudSync
		};
	}, [
		isInitialized,
		isLoaded,
		isSignedIn,
		userId,
		// currentView is implicitly handled via loadArticlesFromCache/performCloudSync deps
		loadArticlesFromCache,
		performCloudSync,
		isRefreshing, // Keep isRefreshing to reset error correctly
	]);

	// --- Refresh Function ---
	const refreshArticles = useCallback(async () => {
		// Use a local isMounted flag for this specific callback instance
		let isMounted = true;
		const cleanup = () => {
			isMounted = false;
		};

		if (!isInitialized || !isLoaded) {
			cleanup();
			return articles; // Return current articles if not ready
		}
		if (!isSignedIn || !userId) {
			console.log(
				"Sync Hook: User not signed in, clearing articles on refresh.",
			);
			setArticles([]);
			setIsLoading(false);
			setIsRefreshing(false);
			setError(null);
			cleanup();
			return []; // Return empty array if not signed in
		}

		if (fetchLockRef.current) {
			console.log("Sync Hook: Refresh operation already in progress, skipping");
			cleanup();
			return articles;
		}

		console.log("Sync Hook: Manual refresh triggered.");
		setIsRefreshing(true);
		setError(null);
		fetchLockRef.current = true;

		try {
			// Directly call performCloudSync for refresh logic
			// Pass true for loadedFromCache because we want to show existing data while refreshing
			await performCloudSync(isMounted, true);
			// Re-fetch happens inside performCloudSync, state is updated there
			// Return the latest state after sync completes (or potentially cached on error)
			// State is updated within performCloudSync, just need to return the current state
			cleanup();
			// Since 'articles' state is updated within performCloudSync, we can't directly return it here.
			// The component consuming this hook will re-render with the updated 'articles' state.
			// We return the 'articles' state *before* the async call started,
			// acknowledging the UI will update shortly after.
			return articles;
		} catch (err) {
			// performCloudSync handles its internal errors and toasts
			console.error("Sync Hook: Error during refreshArticles wrapper:", err);
			// Error state is set within performCloudSync if needed
			cleanup();
			return articles; // Return existing articles on outer error
		} finally {
			// performCloudSync sets refreshing/loading to false internally
			fetchLockRef.current = false; // Release lock here
			if (!isMounted) cleanup(); // Ensure cleanup if error happened before return
		}
	}, [
		isInitialized,
		isLoaded,
		isSignedIn,
		userId,
		performCloudSync, // Depend on the core sync logic
		articles, // Return existing articles on error/skip
		// currentView, // No longer needed after removing redundant filter/sort
		// filterAndSortArticles is a stable import, no need to list
	]);

	// --- Retry Function ---
	const retryLoading = useCallback(() => {
		if (fetchLockRef.current) {
			console.log("Sync Hook: Retry operation already in progress, skipping");
			return;
		}
		console.log("Sync Hook: Retry loading triggered.");
		setIsLoading(true); // Set loading true for retry
		setError(null);
		toast({
			title: "Retrying",
			description: `Retrying to load ${currentView} articles...`,
		});
		// The main useEffect will re-run due to state changes or dependencies
		// Alternatively, directly call refreshArticles if preferred
		// Directly trigger the main effect logic by changing a dependency or state
		// Or, more directly, call refreshArticles which now encapsulates the sync
		refreshArticles();
	}, [refreshArticles, currentView, toast]); // Add missing dependencies

	// Helper functions are now imported from @/lib/articleUtils

	return {
		articles,
		isLoading,
		isRefreshing,
		error,
		refreshArticles,
		retryLoading,
	};
}
