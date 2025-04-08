import { useToast } from "@/hooks/use-toast";
import { type DexieArticle, db } from "@/services/db/dexie"; // Import Dexie db instance
import type { Article } from "@/services/db/types"; // Import original Article type
import { useLiveQuery } from "dexie-react-hooks"; // Use Dexie's React hook for live updates
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// Removed unused imports: useEffect, useRef, uuidv4

// --- Helper Functions (Can be simplified or removed if not needed) ---

// Map DexieArticle (using 'id') back to original Article (using '_id')
const mapDexieToArticle = (dexieArticle: DexieArticle): Article => {
	const { id, ...rest } = dexieArticle;
	return {
		_id: id, // Map id back to _id
		version: 1, // Add a default version if needed by Article type
		// fileData: rest.fileData, // Ensure large fields like fileData are handled if needed
		// htmlContent: rest.htmlContent, // Ensure large fields are handled if needed
		...rest, // Spread the rest of the properties
	};
};

// Simple sorting helper now works with Article type
const sortArticlesBySavedAt = (articles: Article[]): Article[] => {
	if (!articles) return [];
	return [...articles].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
};

// --- Main Hook - Refactored for Local Dexie Storage ---
export function useArticleSync(
	isDbInitialized: boolean, // Keep dependency on DB initialization
	// Remove hidingArticleIds - optimistic updates handled differently or in ArticleContext
) {
	const { toast: toastFn } = useToast(); // Keep toast for error reporting

	// Ref to store the latest toast function to avoid dependency issues
	const toastRef = useRef(toastFn);
	useEffect(() => {
		toastRef.current = toastFn;
	}, [toastFn]);

	// State for loading and error, simplified as sync is removed
	const [isLoading, setIsLoading] = useState<boolean>(true); // Still useful for initial load
	const [error, setError] = useState<Error | null>(null);

	// Use Dexie's useLiveQuery for reactive updates from the database
	const rawArticles = useLiveQuery(
		async () => {
			if (!isDbInitialized) {
				console.log(
					"useArticleSync: DB not initialized, returning null for live query.",
				);
				setIsLoading(true); // Ensure loading is true if DB isn't ready
				return undefined; // Return undefined to indicate not ready
			}
			try {
				console.log(
					"useArticleSync: DB initialized, fetching articles from Dexie...",
				);
				setIsLoading(true); // Set loading true before fetch
				const articlesFromDb = await db.articles
					// Add filtering if needed, e.g., .where('status').notEqual('archived')
					// Or filter by userId if implementing multi-user offline support
					.toArray();
				console.log(
					`useArticleSync: Fetched ${articlesFromDb.length} articles.`,
				);
				setError(null); // Clear error on successful fetch
				setIsLoading(false); // Set loading false after fetch
				return articlesFromDb;
			} catch (dbError: any) {
				console.error(
					"useArticleSync: Error fetching articles from Dexie:",
					dbError,
				);
				setError(
					dbError instanceof Error
						? dbError
						: new Error("Failed to load articles from local database."),
				);
				setIsLoading(false); // Set loading false even on error
				// Consider toasting here or letting the context handle it
				toastRef.current({
					// Use the ref to call the latest toast function
					title: "Error Loading Local Data",
					description:
						error?.message || "Could not load articles from the database.",
					variant: "destructive",
				});
				return []; // Return empty array on error
			}
		},
		[isDbInitialized], // Rerun query when DB initialization status changes
		[], // Default value while loading or if DB not initialized
	);

	// Sort articles whenever rawArticles changes
	// Note: PouchDB types like _id, _rev are gone. We use 'id' from DexieArticle.
	// We also need to map back to the original `Article` type if ArticleContext expects it.
	// For now, let's work with DexieArticle internally and map later if needed.
	// Map raw Dexie articles to the original Article type and then sort
	const articles: Article[] = useMemo(() => {
		if (rawArticles === undefined) return []; // Handle undefined state during init/loading
		const mappedArticles = rawArticles.map(mapDexieToArticle);
		return sortArticlesBySavedAt(mappedArticles);
	}, [rawArticles]);

	// --- Refresh Function ---
	// Dexie's useLiveQuery handles reactivity, so manual refresh might not be strictly needed
	// for UI updates. However, providing a refresh function can be useful for explicit re-fetches
	// or potentially re-triggering the live query if needed (though usually not necessary).
	const refreshArticles = useCallback(async (): Promise<Article[]> => {
		// Return Article[]
		console.log("useArticleSync: Refresh Triggered");
		if (!isDbInitialized) {
			console.warn("useArticleSync: Refresh skipped - DB not initialized.");
			return [];
		}
		setIsLoading(true);
		setError(null);
		try {
			// Explicitly fetch again - useLiveQuery should update automatically,
			// but this ensures the latest data if there were any issues with reactivity.
			const refreshedArticles = await db.articles.toArray();
			setIsLoading(false);
			console.log(
				`useArticleSync: Refresh successful, fetched ${refreshedArticles.length} articles.`,
			);
			// Map and sort the refreshed articles before returning
			const mappedRefreshed = refreshedArticles.map(mapDexieToArticle);
			return sortArticlesBySavedAt(mappedRefreshed);
		} catch (err: any) {
			console.error("useArticleSync: Error during manual refresh:", err);
			setError(
				err instanceof Error ? err : new Error("Failed to refresh articles."),
			);
			setIsLoading(false);
			toastRef.current({
				// Use the ref to call the latest toast function
				title: "Error Refreshing Data",
				description: err?.message || "Could not refresh articles.",
				variant: "destructive",
			});
			return []; // Return empty array on error
		}
	}, [isDbInitialized]); // toast dependency removed, using ref instead

	// --- Retry Function ---
	// Similar to refresh, mainly clears error and potentially re-triggers fetch
	const retryLoading = useCallback(() => {
		console.log("useArticleSync: Retry Triggered");
		if (!isDbInitialized) {
			console.warn("useArticleSync: Retry skipped - DB not initialized.");
			return;
		}
		setError(null);
		setIsLoading(true); // Set loading to true
		// Trigger a refresh to attempt loading again
		refreshArticles();
	}, [isDbInitialized, refreshArticles]); // Depends on refreshArticles

	// Memoize the returned object
	// Note: Removed isRefreshing, syncStatus as they relate to cloud sync
	// biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally omitting isLoading and error to stabilize the returned object reference and prevent infinite loops in consumers depending on the object reference itself. Consumers needing loading/error state should select those properties specifically.
	const returnedValue = useMemo(
		() => ({
			articles, // Now returns mapped and sorted Article[]
			isLoading, // Loading state for initial fetch/refresh
			isRefreshing: isLoading, // Can map isLoading to isRefreshing if needed by context
			error,
			refreshArticles,
			retryLoading,
			// Map loading/error state to the syncStatus expected by ArticleContext
			syncStatus: isLoading
				? ("syncing" as const)
				: error
					? ("offline" as const)
					: ("success" as const),
		}),
		[articles, refreshArticles, retryLoading],
	);

	return returnedValue;
}
