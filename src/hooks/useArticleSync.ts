import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/authClient"; // Import authClient
import { fetchCloudItems } from "@/services/cloudSync"; // Assuming this service uses authClient.$fetch internally now
import { type Article, getAllArticles, saveArticle } from "@/services/db";
import { useCallback, useEffect, useRef, useState } from "react";

// Deduplicates articles based on _id, keeping the one with the latest savedAt timestamp.
const deduplicateArticlesById = (articlesToDedup: Article[]): Article[] => {
	const articleMap = new Map<string, Article>();

	for (const article of articlesToDedup) {
		if (!article._id) {
			console.warn("Deduplicating article without an ID:", article);
			continue;
		}

		const existingArticle = articleMap.get(article._id);
		const currentSavedAt = article.savedAt ?? 0;
		const existingSavedAt = existingArticle?.savedAt ?? 0;

		if (!existingArticle || currentSavedAt > existingSavedAt) {
			articleMap.set(article._id, article);
		}
	}

	return Array.from(articleMap.values());
};

/**
 * Hook to manage article fetching, synchronization, and state.
 *
 * @param isInitialized - Whether the database is initialized.
 * @returns An object containing articles, loading states, errors, and refresh/retry functions.
 */
export function useArticleSync(isInitialized: boolean) {
	const [articles, setArticles] = useState<Article[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);
	const fetchLockRef = useRef<boolean>(false);
	const { toast } = useToast();
	const { data: session, isPending: isSessionLoading } =
		authClient.useSession(); // Use session hook

	const userId = session?.user?.id; // Derive userId from session
	const userEmail = session?.user?.email; // Derive email from session

	// --- Internal Core Logic Functions (Wrapped in useCallback) ---

	const loadArticlesFromCache = useCallback(
		async (isMounted: boolean): Promise<boolean> => {
			if (!session || !userId) return false;

			try {
				console.log(
					`Sync Hook: Attempting to load articles from cache for user ${userId}...`,
				);
				const cachedArticles = await getAllArticles({ userIds: [userId] });

				if (isMounted && cachedArticles && cachedArticles.length > 0) {
					console.log(
						`Sync Hook: Loaded ${cachedArticles.length} articles from cache.`,
					);
					const dedupedArticles = deduplicateArticlesById(cachedArticles);
					if (dedupedArticles.length < cachedArticles.length) {
						console.log(
							`Sync Hook: Removed ${cachedArticles.length - dedupedArticles.length} duplicate articles from cache.`,
						);
					}

					const sortedArticles = [...dedupedArticles].sort((a, b) => {
						const timeA = a.savedAt ?? 0;
						const timeB = b.savedAt ?? 0;
						return timeB - timeA; // Descending
					});

					setArticles(sortedArticles);
					setIsLoading(false);
					setIsRefreshing(true);
					return true;
				}
				if (isMounted) {
					console.log(
						"Sync Hook: No articles found in cache or component unmounted.",
					);
					setIsLoading(true);
					setIsRefreshing(false);
					setArticles([]);
				}
			} catch (cacheErr) {
				console.error(
					"Sync Hook: Error loading articles from cache:",
					cacheErr,
				);
				if (isMounted) {
					setIsLoading(true);
					setIsRefreshing(false);
					setArticles([]);
				}
			}
			return false;
		},
		[session, userId],
	);

	const performCloudSync = useCallback(
		async (isMounted: boolean, loadedFromCache: boolean) => {
			if (!session || !userId) return;

			if (!loadedFromCache && isMounted) {
				setIsLoading(true);
				setIsRefreshing(false);
			}

			let syncTimeoutId: NodeJS.Timeout | null = null;
			let syncInProgress = true;

			syncTimeoutId = setTimeout(() => {
				if (isMounted && syncInProgress) {
					console.warn("Sync Hook: Cloud sync timed out");
					if (isMounted) {
						setIsRefreshing(false);
						fetchLockRef.current = false;
						const timeoutError = new Error(
							"Syncing articles timed out. Displaying cached data.",
						);
						setError(timeoutError);
						toast({
							title: "Sync Timeout",
							description: timeoutError.message,
							variant: "default",
						});
					}
				}
			}, 15000);

			try {
				console.log("Sync Hook: Starting sync with cloud...");
				// No need to get token explicitly if fetchCloudItems uses authClient.$fetch
				// const token = await authClient.getAccessToken(); // Removed
				// if (!token) { // Removed
				// 	throw new Error("Could not retrieve authentication token for sync."); // Removed
				// } // Removed

				// Ensure userEmail is available before syncing
				if (!userEmail) {
					throw new Error("User email is not available for cloud sync.");
				}
				// Pass derived userEmail
				const fetchedArticles = await fetchCloudItems(userEmail);
				syncInProgress = false;
				if (syncTimeoutId) clearTimeout(syncTimeoutId);

				console.log(
					`Sync Hook: Synced ${fetchedArticles.length} articles from cloud for user ${userId} / ${userEmail}`,
				);

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

				if (completeArticles.length > 0) {
					console.log(
						`Sync Hook: Attempting to save/update ${completeArticles.length} complete synced articles locally...`,
					);
					for (const article of completeArticles) {
						try {
							const articleToSave = { ...article, userId };

							if (articleToSave.type === "epub") {
								if (
									!articleToSave.fileData &&
									articleToSave.content &&
									articleToSave.content.length > 100
								) {
									console.warn(
										`Sync Hook: Migrating EPUB ${articleToSave._id} from content to fileData during cloud sync.`,
									);
									articleToSave.fileData = articleToSave.content;
									articleToSave.content =
										"EPUB content migrated from content field.";
								} else if (articleToSave.fileData) {
									articleToSave.content = "EPUB content is stored in fileData.";
								} else {
									console.warn(
										`Sync Hook: EPUB ${articleToSave._id} from cloud is missing fileData.`,
									);
								}
							}
							await saveArticle(articleToSave);
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

				console.log(
					"Sync Hook: Re-fetching articles from local DB after sync...",
				);
				const localArticlesAfterSync = await getAllArticles({
					userIds: [userId],
				});
				console.log(
					`Sync Hook: Fetched ${localArticlesAfterSync.length} articles locally after sync.`,
				);

				const dedupedArticlesAfterSync = deduplicateArticlesById(
					localArticlesAfterSync,
				);
				if (dedupedArticlesAfterSync.length < localArticlesAfterSync.length) {
					console.log(
						`Sync Hook: Removed ${localArticlesAfterSync.length - dedupedArticlesAfterSync.length} duplicate articles after sync.`,
					);
				}

				const sortedArticlesAfterSync = [...dedupedArticlesAfterSync].sort(
					(a, b) => {
						const timeA = a.savedAt ?? 0;
						const timeB = b.savedAt ?? 0;
						return timeB - timeA;
					},
				);

				const filteredArticles = sortedArticlesAfterSync;

				if (isMounted) {
					setArticles(filteredArticles);
					setError(null);
				}
			} catch (syncErr) {
				syncInProgress = false;
				if (syncTimeoutId) clearTimeout(syncTimeoutId);
				console.error("Sync Hook: Failed to sync articles:", syncErr);

				if (isMounted) {
					const error =
						syncErr instanceof Error
							? syncErr
							: new Error("Failed to sync articles");
					if (!loadedFromCache) {
						setError(error);
						setArticles([]);
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
			}
		},
		[session, userId, userEmail, toast], // Removed explicit token dependency
	);

	// --- Main Load and Sync Effect ---
	useEffect(() => {
		let isMounted = true;

		const loadData = async () => {
			if (!isInitialized || isSessionLoading) {
				if (!isInitialized) setIsLoading(true);
				if (isSessionLoading) setIsLoading(true);
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
				setError(null);
			}

			try {
				const loadedFromCache = await loadArticlesFromCache(isMounted);

				if (session && userId) {
					await performCloudSync(isMounted, loadedFromCache);
				} else if (isMounted) {
					setArticles([]);
					setIsLoading(false);
					setIsRefreshing(false);
					setError(null);
				}
			} catch (err) {
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
					setIsLoading(false);
				}
				fetchLockRef.current = false;
			}
		};

		loadData();

		return () => {
			isMounted = false;
		};
	}, [
		isInitialized,
		isSessionLoading,
		session,
		userId,
		loadArticlesFromCache,
		performCloudSync,
		isRefreshing,
	]);

	// --- Refresh Function ---
	const refreshArticles = useCallback(async () => {
		let isMounted = true;
		const cleanup = () => {
			isMounted = false;
		};

		if (!isInitialized || isSessionLoading) {
			cleanup();
			return articles;
		}
		if (!session || !userId) {
			console.log(
				"Sync Hook: User not signed in, clearing articles on refresh.",
			);
			setArticles([]);
			setIsLoading(false);
			setIsRefreshing(false);
			setError(null);
			cleanup();
			return [];
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
			await performCloudSync(isMounted, true);
			cleanup();
			return articles;
		} catch (err) {
			console.error("Sync Hook: Error during refreshArticles wrapper:", err);
			cleanup();
			return articles;
		} finally {
			fetchLockRef.current = false;
			if (!isMounted) cleanup();
		}
	}, [
		isInitialized,
		isSessionLoading,
		session,
		userId,
		performCloudSync,
		articles,
	]);

	// --- Retry Function ---
	const retryLoading = useCallback(() => {
		if (fetchLockRef.current) {
			console.log("Sync Hook: Retry operation already in progress, skipping");
			return;
		}
		console.log("Sync Hook: Retry loading triggered.");
		setIsLoading(true);
		setError(null);
		toast({
			title: "Retrying",
			description: "Retrying to load articles...",
		});
		refreshArticles();
	}, [refreshArticles, toast]);

	return {
		articles,
		isLoading,
		isRefreshing,
		error,
		refreshArticles,
		retryLoading,
	};
}
