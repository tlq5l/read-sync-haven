import { useToast } from "@/hooks/use-toast"; // Ensure useToast is imported only once
import { useArticleActions } from "@/hooks/useArticleActions";
import { useArticleSync } from "@/hooks/useArticleSync";
import { type ArticleView, useArticleView } from "@/hooks/useArticleView";
// Removed PouchDB init hook import: import { useDatabaseInit } from "@/hooks/useDatabaseInit";
import { filterArticles, sortArticles } from "@/lib/articleUtils"; // Import utils
import {
	type DexieArticle, // Import DexieArticle type
	type DexieTag,
	db,
	initializeDexieDatabase,
} from "@/services/db/dexie"; // Import Dexie db and init function
import type {
	Article,
	ArticleCategory,
	Tag,
	// Removed PouchDB getAllTags: getAllTags,
} from "@/services/db/types"; // Import original types
import type {
	ArticleFilters,
	ArticleSortField,
	SortCriteria,
} from "@/types/articles"; // Import new types
import { useAuth } from "@clerk/clerk-react"; // Import useAuth
import type React from "react";
import {
	type Dispatch, // Add Dispatch
	type SetStateAction, // Add SetStateAction
	createContext,
	useCallback, // Import useCallback
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

// Define the shape of the context value
interface ArticleContextType {
	// --- Core Data & State ---
	articles: Article[]; // Raw articles from sync based on view
	processedArticles: Article[]; // Filtered and sorted articles for display
	isLoading: boolean;
	isRefreshing: boolean;
	error: Error | null;
	isDbInitialized: boolean;
	allTags: Tag[]; // All available tags for filtering UI
	syncStatus: "idle" | "syncing" | "success" | "offline"; // Add sync status

	// --- View Management ---
	currentView: ArticleView;
	setCurrentView: (view: ArticleView) => void;

	// --- Filtering & Sorting ---
	filters: ArticleFilters;
	setFilters: Dispatch<SetStateAction<ArticleFilters>>; // Allow direct setting
	setSearchQuery: (query: string) => void;
	// Add specific filter setters if needed (e.g., addSiteFilter, removeTagFilter)
	setSelectedCategory: (category: ArticleCategory | null) => void; // New setter for category
	sortCriteria: SortCriteria;
	setSortCriteria: (criteria: SortCriteria) => void;
	setSortField: (field: ArticleSortField) => void;
	toggleSortDirection: () => void;

	// --- Actions ---
	refreshArticles: () => Promise<Article[]>;
	retryLoading: () => void;
	addArticleByUrl: (url: string) => Promise<Article | null>;
	addArticleByFile: (file: File) => Promise<Article | null>;
	updateArticleStatus: (
		id: string,
		updates: {
			isRead?: boolean;
			favorite?: boolean;
			status?: "inbox" | "later" | "archived";
		},
	) => Promise<void>;
	optimisticRemoveArticle: (id: string) => Promise<void>; // Revert rename
	updateReadingProgress: (id: string, progress: number) => Promise<void>;
}

// Create the context
const ArticleContext = createContext<ArticleContextType | undefined>(undefined);

// Create the provider component
export const ArticleProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const { toast } = useToast(); // Add toast hook back

	// 1. Initialize Database (Using Dexie)
	const [isDbInitialized, setIsDbInitialized] = useState(false);
	const [dbError, setDbError] = useState<Error | null>(null);
	const [hasFetchedInitialData, setHasFetchedInitialData] = useState(false); // Track initial fetch

	// Clerk Auth Hook
	const { isLoaded, isSignedIn, getToken } = useAuth();

	useEffect(() => {
		let isMounted = true;
		console.log("ArticleContext: Initializing Dexie DB...");
		initializeDexieDatabase()
			.then(() => {
				if (isMounted) {
					console.log("ArticleContext: Dexie DB Initialized.");
					setIsDbInitialized(true);
					setDbError(null);
				}
			})
			.catch((err) => {
				if (isMounted) {
					console.error("ArticleContext: Dexie DB Initialization failed:", err);
					setDbError(
						err instanceof Error
							? err
							: new Error("Database initialization failed"),
					);
					setIsDbInitialized(false); // Explicitly set to false on error
				}
			});
		return () => {
			isMounted = false;
		};
	}, []); // Run once on mount

	// 1.5. Fetch initial data from backend after auth and DB init
	useEffect(() => {
		let isMounted = true;
		const fetchInitialData = async () => {
			if (isLoaded && isSignedIn && isDbInitialized && !hasFetchedInitialData) {
				console.log(
					"ArticleContext: Auth ready & DB initialized. Fetching initial data...",
				);
				try {
					const token = await getToken();
					if (!token) {
						throw new Error("Failed to retrieve authentication token.");
					}

					const workerUrl = import.meta.env.VITE_WORKER_URL;
					if (!workerUrl) {
						console.error(
							"ArticleContext: VITE_WORKER_URL is not defined. Cannot fetch data.",
						);
						// Optionally set an error state here
						return;
					}

					const response = await fetch(`${workerUrl}/items`, {
						headers: {
							Authorization: `Bearer ${token}`,
						},
					});

					if (!response.ok) {
						throw new Error(
							`Failed to fetch initial data: ${response.status} ${response.statusText}`,
						);
					}

					const fetchedItems: Article[] = await response.json(); // Assume backend returns Article[] compatible data

					// Map fetched Article to DexieArticle, notably _id -> id
					const dexieArticles: DexieArticle[] = fetchedItems.map((item) => ({
						...item, // Spread existing properties
						id: item._id, // Map _id to id
						// Explicitly ensure all required DexieArticle fields are present.
						// The Omit in DexieArticle definition handles _rev, _deleted, version.
						// Assuming the rest of the fields in 'Article' match 'DexieArticle' requirements.
					}));

					// Use Dexie's bulkPut with the mapped data
					await db.articles.bulkPut(dexieArticles);

					console.log(
						`ArticleContext: Successfully fetched and saved ${fetchedItems.length} items to Dexie.`,
					);

					if (isMounted) {
						setHasFetchedInitialData(true); // Mark initial fetch as complete
					}
				} catch (error) {
					console.error(
						"ArticleContext: Error fetching initial data from backend:",
						error,
					);
					// Optionally set an error state in the context
					if (isMounted) {
						// Maybe retry or notify user?
					}
				}
			}
		};

		fetchInitialData();

		return () => {
			isMounted = false;
		};
	}, [isLoaded, isSignedIn, isDbInitialized, hasFetchedInitialData, getToken]); // Dependencies for the effect

	// 2. Manage View State
	const { currentView, setCurrentView } = useArticleView("all");

	// State to track articles being optimistically removed
	// Moved declaration before useArticleSync
	const [hidingArticleIds, setHidingArticleIds] = useState<Set<string>>(
		new Set(),
	);

	// 3. Sync Articles (depends on DB initialization, view, and hidden IDs)
	const {
		articles,
		isLoading: isSyncLoading,
		isRefreshing,
		error: syncError,
		refreshArticles: syncRefreshArticles, // Rename to avoid conflict
		retryLoading: syncRetryLoading, // Rename to avoid conflict
		syncStatus, // Destructure syncStatus from useArticleSync
	} = useArticleSync(isDbInitialized); // Remove hidingArticleIds from call

	// Log removed

	// 4. Tags State
	const [allTags, setAllTags] = useState<Tag[]>([]);

	// 5. Filtering State
	const [filters, setFilters] = useState<ArticleFilters>({
		siteNames: [],
		types: [],
		tags: [],
		searchQuery: "",
		category: null, // Initialize category filter
	});

	// 6. Sorting State
	const [sortCriteria, setSortCriteria] = useState<SortCriteria>({
		field: "savedAt",
		direction: "desc",
	});
	// Declaration moved up

	// 7. Article Actions (depends on refresh function from sync)

	const {
		addArticleByUrl,
		addArticleByFile,
		updateArticleStatus,
		removeArticle,
		updateReadingProgress,
	} = useArticleActions(async () => {
		await syncRefreshArticles(); // Refresh raw articles after an action
	});

	// --- Derived State & Effects ---

	// Map DexieTag back to original Tag type
	const mapDexieToTag = useCallback((dexieTag: DexieTag): Tag => {
		const { id, ...rest } = dexieTag;
		return {
			_id: id, // Map id back to _id
			...rest,
		};
	}, []); // Empty dependency array as it doesn't rely on component state/props

	// Fetch all tags once DB is initialized using Dexie
	useEffect(() => {
		let isMounted = true;
		if (isDbInitialized) {
			console.log("ArticleContext: Fetching tags from Dexie...");
			db.tags
				.toArray()
				.then((dexieTags) => {
					if (isMounted) {
						const mappedTags = dexieTags.map(mapDexieToTag);
						setAllTags(mappedTags);
						console.log(`ArticleContext: Fetched ${mappedTags.length} tags.`);
					}
				})
				.catch((err) => {
					if (isMounted) {
						console.error(
							"ArticleContext: Failed to fetch tags from Dexie:",
							err,
						);
						setAllTags([]); // Clear tags on error
					}
					// Optionally set an error state specific to tags
				});
		} else {
			if (isMounted) setAllTags([]); // Clear tags if DB is not ready
		}
		return () => {
			isMounted = false;
		};
	}, [isDbInitialized, mapDexieToTag]); // Re-add mapDexieToTag (now wrapped in useCallback)

	// Combine loading and error states
	// Combine loading and error states (use isDbInitialized directly)
	// isSyncLoading now represents Dexie loading state from useArticleSync
	const isLoading = !isDbInitialized || isSyncLoading;
	const error = dbError || syncError; // Prioritize DB init error

	// Memoize processed articles (filtering + sorting + optimistic hiding)
	const processedArticles = useMemo(() => {
		// Filter out optimistically hidden articles first
		const visibleArticles = articles.filter(
			// Use _id from the mapped Article type
			(a) => !hidingArticleIds.has(a._id),
		);
		// Apply user filters
		const filtered = filterArticles(visibleArticles, filters);
		// Then apply sorting
		return sortArticles(filtered, sortCriteria);
	}, [articles, filters, sortCriteria, hidingArticleIds]); // Revert dependencies

	// --- Context Value & Helper Functions ---

	// Wrap helper functions in useCallback for stable references
	const setSearchQuery = useCallback((query: string) => {
		setFilters((prev) => ({ ...prev, searchQuery: query }));
	}, []); // setFilters is stable

	const setSortField = useCallback((field: ArticleSortField) => {
		setSortCriteria((prev) => ({ ...prev, field }));
	}, []); // setSortCriteria is stable

	const setSelectedCategory = useCallback(
		(category: ArticleCategory | null) => {
			setFilters((prev) => ({ ...prev, category }));
		},
		[],
	); // setFilters is stable

	// Revert to original Optimistic remove function
	const optimisticRemoveArticle = useCallback(
		async (id: string) => {
			// id here should be the Article._id
			// Optimistically hide the article
			// Still hide based on _id
			setHidingArticleIds((prev) => new Set(prev).add(id));

			try {
				// Pass the _id to removeArticle (assuming it will be updated for Dexie)
				const success = await removeArticle(id);

				if (!success) {
					// Revert optimistic update on failure
					toast({
						title: "Failed to Remove Article",
						description: "The article could not be removed. Please try again.",
						variant: "destructive",
					});
					setHidingArticleIds((prev) => {
						const next = new Set(prev);
						next.delete(id);
						return next;
					});
				}
				// On success, the article remains hidden.
				// The next sync/refresh will permanently remove it from the main 'articles' state.
			} catch (error) {
				// Catch any unexpected errors from removeArticle itself
				console.error("Error during optimistic remove:", error);
				toast({
					title: "Error Removing Article",
					description: "An unexpected error occurred.",
					variant: "destructive",
				});
				// Revert optimistic update
				setHidingArticleIds((prev) => {
					const next = new Set(prev);
					next.delete(id);
					return next;
				});
			}
		},
		[removeArticle, toast], // Revert dependencies
	);

	const toggleSortDirection = useCallback(() => {
		setSortCriteria((prev) => ({
			...prev,
			direction: prev.direction === "asc" ? "desc" : "asc",
		}));
	}, []); // setSortCriteria is stable

	// Memoize the context value
	const contextValue = useMemo(
		() => ({
			articles, // Raw articles
			processedArticles, // Filtered & sorted articles
			isLoading,
			isRefreshing,
			error,
			isDbInitialized,
			allTags,
			syncStatus, // Add syncStatus to context value
			currentView,
			setCurrentView,
			filters,
			setFilters, // Expose direct setter
			setSearchQuery, // Stable helper
			setSelectedCategory, // Add category setter
			sortCriteria,
			setSortCriteria, // Expose direct setter
			setSortField, // Stable helper
			toggleSortDirection, // Stable helper
			refreshArticles: syncRefreshArticles,
			retryLoading: syncRetryLoading,
			addArticleByUrl,
			addArticleByFile,
			updateArticleStatus,
			optimisticRemoveArticle, // Revert context value
			updateReadingProgress,
		}),
		[
			// Dependencies: Recalculate when these change
			articles,
			processedArticles,
			isLoading,
			isRefreshing,
			error,
			isDbInitialized,
			allTags,
			syncStatus, // Add syncStatus dependency
			currentView,
			setCurrentView, // Include if view logic affects context value directly elsewhere
			filters,
			// setFilters is stable
			setSearchQuery, // Stable helper reference
			setSelectedCategory, // Add category setter reference
			sortCriteria,
			// setSortCriteria is stable
			setSortField, // Stable helper reference
			toggleSortDirection, // Stable helper reference
			syncRefreshArticles, // Stable function reference
			syncRetryLoading, // Stable function reference
			addArticleByUrl, // Stable function reference
			addArticleByFile, // Stable function reference
			updateArticleStatus, // Stable function reference
			optimisticRemoveArticle, // Revert dependency
			updateReadingProgress, // Stable function reference
		],
	);

	return (
		<ArticleContext.Provider value={contextValue}>
			{children}
		</ArticleContext.Provider>
	);
};

// Custom hook to consume the context
export const useArticles = () => {
	const context = useContext(ArticleContext);
	if (context === undefined) {
		throw new Error("useArticles must be used within an ArticleProvider");
	}
	return context;
};
