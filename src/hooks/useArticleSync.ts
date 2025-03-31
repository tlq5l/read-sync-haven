import { useToast } from "@/hooks/use-toast";
import { fetchCloudItems, saveItemToCloud } from "@/services/cloudSync";
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

	// --- Main Load and Sync Effect ---
	useEffect(() => {
		if (!isInitialized || !isLoaded) {
			// If not initialized or auth not loaded, reset state if needed
			if (!isInitialized) setIsLoading(true); // Keep loading if DB not ready
			if (!isLoaded) setIsLoading(true); // Keep loading if auth not ready
			setArticles([]); // Clear articles if dependencies aren't met
			setIsRefreshing(false);
			setError(null);
			return;
		}

		// Use fetch lock to prevent concurrent fetches/syncs
		if (fetchLockRef.current) {
			console.log(
				"Sync Hook: Load/Sync operation already in progress, skipping",
			);
			return;
		}

		let isMounted = true;
		let syncTimeoutId: NodeJS.Timeout | null = null;

		const loadAndSyncArticles = async () => {
			fetchLockRef.current = true;
			let loadedFromCache = false;

			// Reset error state at the beginning of a fetch attempt
			// but only if we are not already in a refreshing state (to avoid flicker)
			if (!isRefreshing) {
				setError(null);
			}

			// --- 1. Attempt to load from local cache first ---
			if (isSignedIn && userId) {
				try {
					console.log(
						`Sync Hook: Attempting to load articles from cache for user ${userId}...`,
					);
					const cachedArticles = await getAllArticles({ userIds: [userId] });

					if (isMounted && cachedArticles && cachedArticles.length > 0) {
						console.log(
							`Sync Hook: Loaded ${cachedArticles.length} articles from cache.`,
						);
						const filteredCached = filterAndSortArticles(
							cachedArticles,
							currentView,
						);
						setArticles(filteredCached);
						setIsLoading(false);
						setIsRefreshing(true); // Start background refresh
						// setError(null); // Already reset above
						loadedFromCache = true;
					} else if (isMounted) {
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
			} else {
				// Not signed in
				if (isMounted) {
					setArticles([]);
					setIsLoading(false);
					setIsRefreshing(false);
					setError(null);
				}
				fetchLockRef.current = false;
				return;
			}

			// --- 2. Sync with Cloud (always runs if signed in) ---
			if (!isSignedIn || !userId) {
				fetchLockRef.current = false;
				return;
			}

			if (!loadedFromCache && isMounted) {
				setIsLoading(true);
				setIsRefreshing(false);
			}

			let syncInProgress = true;
			syncTimeoutId = setTimeout(() => {
				if (isMounted && syncInProgress) {
					console.warn(
						`Sync Hook: Cloud sync for ${currentView} view timed out`,
					);
					if (isMounted) {
						setIsRefreshing(false);
						fetchLockRef.current = false;
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
				console.log("Sync Hook: Starting background sync with cloud...");
				const token = await getToken();
				const userEmail = user?.primaryEmailAddress?.emailAddress;

				if (!token) {
					throw new Error("Could not retrieve authentication token for sync.");
				}

				const fetchedArticles = await fetchCloudItems(token, userEmail);
				syncInProgress = false;
				if (syncTimeoutId) clearTimeout(syncTimeoutId);

				console.log(
					`Sync Hook: Synced ${fetchedArticles.length} articles from cloud for user ${userId} / ${userEmail}`,
				);

				// Save/Update fetched articles locally
				if (fetchedArticles.length > 0) {
					console.log(
						`Sync Hook: Attempting to save/update ${fetchedArticles.length} synced articles locally...`,
					);
					for (const article of fetchedArticles) {
						try {
							await saveArticle({ ...article, userId });
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

				const filteredArticles = filterAndSortArticles(
					localArticlesAfterSync,
					currentView,
				);

				if (isMounted) {
					setArticles(filteredArticles);
					setError(null); // Clear error on successful sync
				}

				// --- One-time sync for existing local files ---
				await runOneTimeFileSync(userId, getToken, user);
				// --- End one-time sync ---
			} catch (syncErr) {
				syncInProgress = false;
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
					// Only set global error if cache didn't load
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
				fetchLockRef.current = false;
			}
		};

		loadAndSyncArticles();

		return () => {
			isMounted = false;
			if (syncTimeoutId) clearTimeout(syncTimeoutId);
		};
	}, [
		isInitialized,
		currentView,
		isSignedIn,
		isLoaded,
		getToken,
		user,
		userId,
		toast,
		isRefreshing,
	]); // Combined dependencies

	// --- Refresh Function ---
	const refreshArticles = useCallback(async () => {
		if (!isInitialized || !isLoaded) return articles; // Return current articles if not ready

		if (fetchLockRef.current) {
			console.log("Sync Hook: Refresh operation already in progress, skipping");
			return articles;
		}

		console.log("Sync Hook: Manual refresh triggered.");
		setIsRefreshing(true); // Indicate manual refresh start
		setError(null); // Clear previous errors on manual refresh
		fetchLockRef.current = true;

		try {
			let fetchedArticles: Article[] = [];
			if (isSignedIn && userId) {
				const token = await getToken();
				const userEmail = user?.primaryEmailAddress?.emailAddress;
				if (token) {
					fetchedArticles = await fetchCloudItems(token, userEmail);
					console.log(
						`Sync Hook: Refreshed ${fetchedArticles.length} articles from cloud for user ${userId} / ${userEmail}`,
					);

					// Save/Update locally
					if (fetchedArticles.length > 0) {
						console.log(
							`Sync Hook: Saving/updating ${fetchedArticles.length} refreshed articles locally...`,
						);
						for (const article of fetchedArticles) {
							try {
								await saveArticle({ ...article, userId });
							} catch (saveErr) {
								console.warn(
									`Sync Hook: Failed to save/update refreshed article ${article._id} locally:`,
									saveErr,
								);
							}
						}
					}
				} else {
					throw new Error(
						"Could not retrieve authentication token for refresh.",
					);
				}
			} else {
				// Not signed in, clear local state on manual refresh
				setArticles([]);
				console.log(
					"Sync Hook: User not signed in, clearing articles on refresh.",
				);
				return []; // Return empty array
			}

			// Re-fetch from local DB after saving cloud data
			console.log(
				"Sync Hook: Re-fetching articles from local DB after refresh...",
			);
			const localArticlesAfterRefresh = await getAllArticles({
				userIds: [userId],
			});
			console.log(
				`Sync Hook: Fetched ${localArticlesAfterRefresh.length} articles locally after refresh.`,
			);

			const filteredArticles = filterAndSortArticles(
				localArticlesAfterRefresh,
				currentView,
			);
			setArticles(filteredArticles);
			setError(null); // Clear error on success
			return filteredArticles;
		} catch (err) {
			console.error("Sync Hook: Failed to refresh articles:", err);
			const error =
				err instanceof Error ? err : new Error("Failed to refresh articles");
			setError(error);
			toast({
				title: "Refresh Failed",
				description: error.message,
				variant: "destructive",
			});
			return articles; // Return existing articles on error
		} finally {
			setIsRefreshing(false);
			setIsLoading(false); // Ensure loading is also false
			fetchLockRef.current = false;
		}
	}, [
		isInitialized,
		isLoaded,
		isSignedIn,
		userId,
		getToken,
		user,
		currentView,
		toast,
		articles, // Include articles to return it on error/skip
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
		refreshArticles(); // Trigger refresh on retry
	}, [currentView, toast, refreshArticles]); // Dependencies for retry

	// --- Helper Functions ---
	const filterAndSortArticles = (
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

	const runOneTimeFileSync = async (
		currentUserId: string | null | undefined,
		getTokenFn: () => Promise<string | null>,
		currentUser: any, // Consider defining a stricter type for user if possible
	) => {
		if (!currentUserId) return;

		const syncFlagKey = `hasSyncedExistingFiles_${currentUserId}`;
		try {
			const hasSynced = localStorage.getItem(syncFlagKey);
			if (!hasSynced) {
				console.log(
					"Sync Hook: Running one-time sync for existing local EPUB/PDF files...",
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
								"Sync Hook: Error fetching cloud items for one-time sync check:",
								fetchErr,
							);
							// Proceed without cloud check if fetch fails
						}
					} else {
						console.warn(
							"Sync Hook: Could not get token for one-time sync check. Skipping cloud ID check.",
						);
					}

					const unsyncedFiles = localFilesToSync.filter(
						(localFile) => !cloudIds.has(localFile._id),
					);

					console.log(
						`Sync Hook: Found ${unsyncedFiles.length} local EPUB/PDF files to sync.`,
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
									`Sync Hook: One-time sync: Successfully synced ${articleToSync._id} (${articleToSync.type})`,
								);
							} else {
								syncErrors++;
								console.warn(
									`Sync Hook: One-time sync: Failed to sync ${articleToSync._id} (API returned false)`,
								);
							}
						} catch (syncErr) {
							syncErrors++;
							console.error(
								`Sync Hook: One-time sync: Error syncing ${articleToSync._id}:`,
								syncErr,
							);
						}
					}

					if (syncErrors === 0) {
						console.log(
							"Sync Hook: One-time sync completed successfully for all files.",
						);
						localStorage.setItem(syncFlagKey, "true");
					} else {
						console.warn(
							`Sync Hook: One-time sync completed with ${syncErrors} errors. Will retry on next load.`,
						);
					}
				} else {
					console.log(
						"Sync Hook: No local EPUB/PDF files found requiring one-time sync.",
					);
					localStorage.setItem(syncFlagKey, "true");
				}
			} else {
				// console.log("Sync Hook: One-time sync for existing files already completed.");
			}
		} catch (oneTimeSyncError) {
			console.error(
				"Sync Hook: Error during one-time sync process:",
				oneTimeSyncError,
			);
		}
	};

	return {
		articles,
		isLoading,
		isRefreshing,
		error,
		refreshArticles,
		retryLoading,
	};
}
