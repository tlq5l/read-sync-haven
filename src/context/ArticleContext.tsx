import { useArticleActions } from "@/hooks/useArticleActions";
import { useArticleSync } from "@/hooks/useArticleSync";
import { type ArticleView, useArticleView } from "@/hooks/useArticleView";
import { useDatabaseInit } from "@/hooks/useDatabaseInit";
import type { Article } from "@/services/db"; // Keep Article type import
import type React from "react";
import { createContext, useContext, useMemo } from "react";
// import { useToast } from "@/hooks/use-toast"; // Removed as unused

// Define the shape of the context value
interface ArticleContextType {
	// From useArticleSync
	articles: Article[];
	isLoading: boolean; // Combined loading state (DB init + initial sync)
	isRefreshing: boolean; // Background sync state
	error: Error | null; // Combined error state (DB init + sync)
	refreshArticles: () => Promise<Article[]>; // Renamed from hook's return for consistency
	retryLoading: () => void; // Renamed from hook's return

	// From useArticleView
	currentView: ArticleView;
	setCurrentView: (view: ArticleView) => void;

	// From useArticleActions
	addArticleByUrl: (url: string) => Promise<Article | null>;
	addArticleByFile: (file: File) => Promise<Article | null>;
	updateArticleStatus: (
		id: string,
		isRead: boolean,
		favorite?: boolean,
	) => Promise<void>;
	removeArticle: (id: string, rev: string) => Promise<void>; // Note: rev might be redundant now
	updateReadingProgress: (id: string, progress: number) => Promise<void>;

	// Potentially add isInitialized if needed by consumers
	isDbInitialized: boolean;
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
	} = useArticleSync(isDbInitialized, currentView);

	// 4. Article Actions (depends on refresh function from sync)
	const {
		addArticleByUrl,
		addArticleByFile,
		updateArticleStatus,
		removeArticle, // Consider if 'rev' is still needed here or handled internally
		updateReadingProgress,
	} = useArticleActions(async () => {
		await syncRefreshArticles();
	}); // Wrap refresh to return void

	// Combine loading and error states
	const isLoading = !isDbInitialized || (isDbInitialized && isSyncLoading);
	const error = dbError || syncError;

	// Memoize the context value
	const contextValue = useMemo(
		() => ({
			articles,
			isLoading,
			isRefreshing,
			error,
			refreshArticles: syncRefreshArticles, // Provide the renamed function
			retryLoading: syncRetryLoading, // Provide the renamed function
			currentView,
			setCurrentView,
			addArticleByUrl,
			addArticleByFile,
			updateArticleStatus,
			removeArticle,
			updateReadingProgress,
			isDbInitialized, // Expose DB init status
		}),
		[
			articles,
			isLoading,
			isRefreshing,
			error,
			syncRefreshArticles,
			syncRetryLoading,
			currentView,
			setCurrentView,
			addArticleByUrl,
			addArticleByFile,
			updateArticleStatus,
			removeArticle,
			updateReadingProgress,
			isDbInitialized,
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
