import { useToast } from "@/hooks/use-toast";
import { type Article, bulkSaveArticles, getAllArticles } from "@/services/db";
import { fetchCloudItems, type CloudSyncStatus } from "@/services/cloudSync";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useCallback, useEffect, useRef, useState } from "react";

// --- Helper Functions ---

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

// Loads articles from the local cache (PouchDB)
async function _loadArticlesFromCache(
	isMounted: boolean,
	isSignedIn: boolean | null | undefined,
	userId: string | null | undefined,
	setArticles: React.Dispatch<React.SetStateAction<Article[]>>,
	setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
	setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>,
): Promise<boolean> {
	if (!isSignedIn || !userId) return false;

	try {
		console.log(`Sync Hook: Attempting to load articles from cache for user ${userId}...`);
		const cachedArticles = await getAllArticles({ userIds: [userId] });

		if (isMounted && cachedArticles && cachedArticles.length > 0) {
			console.log(`Sync Hook: Loaded ${cachedArticles.length} articles from cache.`);
			const dedupedArticles = deduplicateArticlesById(cachedArticles);
			if (dedupedArticles.length < cachedArticles.length) {
				console.log(`Sync Hook: Removed ${cachedArticles.length - dedupedArticles.length} duplicate articles from cache.`);
			}
			const sortedArticles = [...dedupedArticles].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
			setArticles(sortedArticles);
			setIsLoading(false);
			setIsRefreshing(true); // Start background refresh
			return true; // Loaded from cache
		}
		if (isMounted) {
			console.log("Sync Hook: No articles found in cache or component unmounted.");
			setIsLoading(true); // Need to load from cloud
			setIsRefreshing(false);
			setArticles([]);
		}
	} catch (cacheErr) {
		console.error("Sync Hook: Error loading articles from cache:", cacheErr);
		if (isMounted) {
			setIsLoading(true); // Need to try cloud
			setIsRefreshing(false);
			setArticles([]);
		}
	}
	return false; // Not loaded from cache
}

// Performs synchronization with the cloud
async function _performCloudSync(
	isMounted: boolean,
	loadedFromCache: boolean,
	isSignedIn: boolean | null | undefined,
	userId: string | null | undefined,
	getToken: () => Promise<string | null>,
	user: { primaryEmailAddress?: { emailAddress?: string | null } | null } | null | undefined,
	toast: (props: any) => void, // Consider using a more specific type if available from useToast
	setArticles: React.Dispatch<React.SetStateAction<Article[]>>,
	setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
	setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>,
	setError: React.Dispatch<React.SetStateAction<Error | null>>,
	fetchLockRef: React.MutableRefObject<boolean>, // Pass ref to manage lock
) {
	if (!isSignedIn || !userId) return;

	if (!loadedFromCache && isMounted) {
		setIsLoading(true);
		setIsRefreshing(false);
	}

	let syncTimeoutId: NodeJS.Timeout | null = null;
	let syncInProgress = true;

	// Setup timeout for the sync operation
	syncTimeoutId = setTimeout(() => {
		if (isMounted && syncInProgress) {
			console.warn("Sync Hook: Cloud sync timed out");
			setIsRefreshing(false);
			fetchLockRef.current = false; // Release lock on timeout
			const timeoutError = new Error("Syncing articles timed out. Displaying cached data.");
			setError(timeoutError);
			toast({ title: "Sync Timeout", description: timeoutError.message, variant: "default" });
		}
	}, 15000); // 15 second timeout

	try {
		console.log("Sync Hook: Starting sync with cloud...");
		const token = await getToken();
		const userEmail = user?.primaryEmailAddress?.emailAddress;

		if (!token) throw new Error("Could not retrieve authentication token for sync.");

		const fetchedArticles = await fetchCloudItems(token, userEmail);
		syncInProgress = false; // Mark sync as complete
		if (syncTimeoutId) clearTimeout(syncTimeoutId);

		console.log(`Sync Hook: Synced ${fetchedArticles.length} articles from cloud for user ${userId} / ${userEmail}`);

		const completeArticles = fetchedArticles.filter((article) => {
			const hasEssentialFields = article.title && article.url && article.content;
			if (!hasEssentialFields) console.warn(`Sync Hook: Skipping save for incomplete article ${article._id}`);
			return hasEssentialFields;
		});

		const articlesToBulkSave = completeArticles.map((article) => {
			const articleToSave = { ...article, userId };
			if (articleToSave.type === "epub") {
				if (!articleToSave.fileData && articleToSave.content && articleToSave.content.length > 100) {
					console.warn(`Sync Hook: Migrating EPUB ${articleToSave._id} from content to fileData during bulk sync.`);
					articleToSave.fileData = articleToSave.content;
					articleToSave.content = "EPUB content migrated from content field.";
				} else if (articleToSave.fileData) {
					articleToSave.content = "EPUB content is stored in fileData.";
				} else {
					console.warn(`Sync Hook: EPUB ${articleToSave._id} from cloud is missing fileData.`);
				}
			}
			return articleToSave;
		});

		if (articlesToBulkSave.length > 0) {
			console.log(`Sync Hook: Attempting to bulk save/update ${articlesToBulkSave.length} synced articles locally...`);
			try {
				const bulkResponse = await bulkSaveArticles(articlesToBulkSave);
				console.log("Sync Hook: Bulk save operation completed.");
				const successfulOpsCount = bulkResponse.filter((res): res is PouchDB.Core.Response => "ok" in res && res.ok).length;
				const failedOpsCount = bulkResponse.length - successfulOpsCount;
				if (failedOpsCount > 0) console.warn(`Sync Hook: Failed to bulk save/update ${failedOpsCount} articles.`, bulkResponse.filter((res): res is PouchDB.Core.Error => "error" in res && !!res.error));
				if (successfulOpsCount > 0) console.log(`Sync Hook: Successfully saved/updated ${successfulOpsCount} articles via bulk operation.`);
			} catch (bulkErr) {
				console.error("Sync Hook: Critical error during bulk save operation:", bulkErr);
			}
		}

		console.log("Sync Hook: Refetching all local articles after cloud sync and bulk save...");
		const allLocalArticles = await getAllArticles({ userIds: [userId] });
		console.log(`Sync Hook: Fetched ${allLocalArticles.length} articles from local DB after sync.`);

		const dedupedArticlesAfterSync = deduplicateArticlesById(allLocalArticles);
		if (dedupedArticlesAfterSync.length < allLocalArticles.length) {
			console.log(`Sync Hook: Removed ${allLocalArticles.length - dedupedArticlesAfterSync.length} duplicate articles after refetch.`);
		}

		const sortedArticlesAfterSync = [...dedupedArticlesAfterSync].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));

		if (isMounted) {
			setArticles(sortedArticlesAfterSync);
			setError(null); // Clear error on successful sync
		}

	} catch (syncErr) {
		syncInProgress = false; // Mark sync as complete on error too
		if (syncTimeoutId) clearTimeout(syncTimeoutId);
		console.error("Sync Hook: Failed to sync articles:", syncErr);

		if (isMounted) {
			const error = syncErr instanceof Error ? syncErr : new Error("Failed to sync articles");
			if (!loadedFromCache) {
				setError(error);
				setArticles([]);
			}
			toast({ title: "Cloud Sync Failed", description: `${error.message}. Displaying local data if available.`, variant: "destructive" });
		}
	} finally {
		if (isMounted) {
			setIsLoading(false);
			setIsRefreshing(false);
		}
		// Lock is released within the main effect or refresh function that calls this helper
	}
}


// --- Main Hook ---

export function useArticleSync(isInitialized: boolean) {
	const [articles, setArticles] = useState<Article[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
	const [error, setError] = useState<Error | null>(null);
	const fetchLockRef = useRef<boolean>(false);
	const { toast } = useToast();
	const { userId, isSignedIn, isLoaded, getToken } = useAuth();
	const { user } = useUser();

	// --- Internal Core Logic Functions (Wrapped in useCallback) ---

	const loadArticlesFromCache = useCallback(
		async (isMounted: boolean): Promise<boolean> => {
			// Call the standalone helper function
			return _loadArticlesFromCache(
				isMounted,
				isSignedIn,
				userId,
				setArticles,
				setIsLoading,
				setIsRefreshing,
			);
		},
		[isSignedIn, userId], // Dependencies for the useCallback wrapper
	);

	const performCloudSync = useCallback(
		async (isMounted: boolean, loadedFromCache: boolean) => {
			// Call the standalone helper function
			await _performCloudSync(
				isMounted,
				loadedFromCache,
				isSignedIn,
				userId,
				getToken,
				user,
				toast,
				setArticles,
				setIsLoading,
				setIsRefreshing,
				setError,
				fetchLockRef, // Pass the ref
			);
		},
		[isSignedIn, userId, getToken, user, toast], // Dependencies for the useCallback wrapper
	);

	// --- Main Load and Sync Effect ---
	useEffect(() => {
		let isMounted = true;

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
				setError(null);
			}

			try {
				const loadedFromCache = await loadArticlesFromCache(isMounted);
				if (isSignedIn && userId) {
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
					setError(err instanceof Error ? err : new Error("An unexpected error occurred"));
					setIsLoading(false);
					setIsRefreshing(false);
				}
			} finally {
				if (isMounted) {
					setIsLoading(false);
					// isRefreshing is handled within performCloudSync
				}
				fetchLockRef.current = false; // Release lock
			}
		};

		loadData();

		return () => {
			isMounted = false;
		};
	}, [
		isInitialized,
		isLoaded,
		isSignedIn,
		userId,
		loadArticlesFromCache, // Now depends on the stable useCallback reference
		performCloudSync,    // Now depends on the stable useCallback reference
		isRefreshing,
	]);

	// --- Refresh Function ---
	const refreshArticles = useCallback(async () => {
		let isMounted = true;
		const cleanup = () => { isMounted = false; };

		if (!isInitialized || !isLoaded) { cleanup(); return articles; }
		if (!isSignedIn || !userId) {
			console.log("Sync Hook: User not signed in, clearing articles on refresh.");
			setArticles([]); setIsLoading(false); setIsRefreshing(false); setError(null);
			cleanup(); return [];
		}
		if (fetchLockRef.current) { console.log("Sync Hook: Refresh operation already in progress, skipping"); cleanup(); return articles; }

		console.log("Sync Hook: Manual refresh triggered.");
		setIsRefreshing(true); setError(null); fetchLockRef.current = true;

		try {
			// Call the standalone sync function directly
			await _performCloudSync(isMounted, true, isSignedIn, userId, getToken, user, toast, setArticles, setIsLoading, setIsRefreshing, setError, fetchLockRef);
			cleanup();
			return articles; // Return state before async call, UI updates via state setters
		} catch (err) {
			console.error("Sync Hook: Error during refreshArticles wrapper:", err);
			cleanup();
			return articles;
		} finally {
			fetchLockRef.current = false;
			if (!isMounted) cleanup();
		}
	}, [
		isInitialized, isLoaded, isSignedIn, userId, getToken, user, toast, articles, // Include articles for return value consistency
		// No need to depend on performCloudSync useCallback wrapper here, call helper directly
	]);

	// --- Retry Function ---
	const retryLoading = useCallback(() => {
		if (fetchLockRef.current) { console.log("Sync Hook: Retry operation already in progress, skipping"); return; }
		console.log("Sync Hook: Retry loading triggered.");
		setIsLoading(true); setError(null);
		toast({ title: "Retrying", description: "Retrying to load articles..." });
		refreshArticles(); // Call the refactored refresh function
	}, [refreshArticles, toast]);

	return { articles, isLoading, isRefreshing, error, refreshArticles, retryLoading };
}
