import { useArticleActions } from "@/hooks/useArticleActions";
import { useArticleSync } from "@/hooks/useArticleSync";
import { type ArticleView, useArticleView } from "@/hooks/useArticleView";
import { useDatabaseInit } from "@/hooks/useDatabaseInit";
import { filterArticles, sortArticles } from "@/lib/articleUtils"; // Import utils
import { type Article, type Tag, getAllTags } from "@/services/db"; // Import Tag and getAllTags
import type {
	ArticleFilters,
	ArticleSortField,
	SortCriteria,
} from "@/types/articles"; // Import new types
import type React from "react";
import {
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

	// --- View Management ---
	currentView: ArticleView;
	setCurrentView: (view: ArticleView) => void;

	// --- Filtering & Sorting ---
	filters: ArticleFilters;
	setFilters: React.Dispatch<React.SetStateAction<ArticleFilters>>; // Allow direct setting
	setSearchQuery: (query: string) => void;
	// Add specific filter setters if needed (e.g., addSiteFilter, removeTagFilter)
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
		isRead: boolean,
		favorite?: boolean,
	) => Promise<void>;
	removeArticle: (id: string, rev: string) => Promise<void>;
	updateReadingProgress: (id: string, progress: number) => Promise<void>;
}

// Create the context
const ArticleContext = createContext<ArticleContextType | undefined>(undefined);

// Create the provider component
export const ArticleProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	// const { toast } = useToast(); // Keep toast hook in case provider needs direct access - Removed as unused

	// 1. Initialize Database
	const { isInitialized: isDbInitialized, dbError } = useDatabaseInit();

	// 2. Manage View State
	const { currentView, setCurrentView } = useArticleView("all");

	// 3. Sync Articles (depends on DB initialization and view)
	const {
		articles,
		isLoading: isSyncLoading,
		isRefreshing,
		error: syncError,
		refreshArticles: syncRefreshArticles, // Rename to avoid conflict
		retryLoading: syncRetryLoading, // Rename to avoid conflict
	} = useArticleSync(isDbInitialized, currentView); // This provides the raw 'articles' based on view

	// 4. Tags State
	const [allTags, setAllTags] = useState<Tag[]>([]);

	// 5. Filtering State
	const [filters, setFilters] = useState<ArticleFilters>({
		siteNames: [],
		types: [],
		tags: [],
		searchQuery: "",
	});

	// 6. Sorting State
	const [sortCriteria, setSortCriteria] = useState<SortCriteria>({
		field: "savedAt",
		direction: "desc",
	});

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

	// Fetch all tags once DB is initialized
	useEffect(() => {
		let isMounted = true;
		if (isDbInitialized) {
			getAllTags()
				.then((tags) => {
					if (isMounted) setAllTags(tags);
				})
				.catch((err) => {
					console.error("Failed to fetch tags:", err);
					// Optionally set an error state specific to tags
				});
		}
		return () => {
			isMounted = false;
		};
	}, [isDbInitialized]);

	// Combine loading and error states
	const isLoading = !isDbInitialized || (isDbInitialized && isSyncLoading);
	const error = dbError || syncError;

	// Memoize processed articles (filtering + sorting)
	const processedArticles = useMemo(() => {
		// Apply filtering first
		const filtered = filterArticles(articles, filters);
		// Then apply sorting
		return sortArticles(filtered, sortCriteria);
	}, [articles, filters, sortCriteria]);

	// --- Context Value & Helper Functions ---

	// Wrap helper functions in useCallback for stable references
	const setSearchQuery = useCallback((query: string) => {
		setFilters((prev) => ({ ...prev, searchQuery: query }));
	}, []); // setFilters is stable

	const setSortField = useCallback((field: ArticleSortField) => {
		setSortCriteria((prev) => ({ ...prev, field }));
	}, []); // setSortCriteria is stable

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
			currentView,
			setCurrentView,
			filters,
			setFilters, // Expose direct setter
			setSearchQuery, // Stable helper
			sortCriteria,
			setSortCriteria, // Expose direct setter
			setSortField, // Stable helper
			toggleSortDirection, // Stable helper
			refreshArticles: syncRefreshArticles,
			retryLoading: syncRetryLoading,
			addArticleByUrl,
			addArticleByFile,
			updateArticleStatus,
			removeArticle,
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
			currentView,
			setCurrentView, // Include if view logic affects context value directly elsewhere
			filters,
			// setFilters is stable
			setSearchQuery, // Stable helper reference
			sortCriteria,
			// setSortCriteria is stable
			setSortField, // Stable helper reference
			toggleSortDirection, // Stable helper reference
			syncRefreshArticles, // Stable function reference
			syncRetryLoading, // Stable function reference
			addArticleByUrl, // Stable function reference
			addArticleByFile, // Stable function reference
			updateArticleStatus, // Stable function reference
			removeArticle, // Stable function reference
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
