import { useToast } from "@/hooks/use-toast";
import {
	type Article,
	deleteArticle,
	getAllArticles,
	initializeDatabase,
	saveArticle,
	saveEpubFile,
	savePdfFile,
	updateArticle,
} from "@/services/db";
import { isValidEpub } from "@/services/epub";
import { parseArticle } from "@/services/parser";
import { isValidPdf } from "@/services/pdf";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";

interface ArticleContextType {
	articles: Article[];
	isLoading: boolean;
	error: Error | null;
	currentView: "all" | "unread" | "favorites";
	setCurrentView: (view: "all" | "unread" | "favorites") => void;
	refreshArticles: () => Promise<Article[]>;
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

const ArticleContext = createContext<ArticleContextType | undefined>(undefined);

export const ArticleProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [articles, setArticles] = useState<Article[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<Error | null>(null);
	const [currentView, setCurrentView] = useState<
		"all" | "unread" | "favorites"
	>("all");
	const [isInitialized, setIsInitialized] = useState<boolean>(false);
	const { toast } = useToast();

	// Initialize database on component mount
	useEffect(() => {
		// Skip if already initialized
		if (isInitialized) return;

		const init = async () => {
			try {
				console.log("Initializing database...");
				const result = await initializeDatabase();
				console.log("Database initialization result:", result);
				setIsInitialized(true);

				if (!result) {
					// Database initialization had issues but didn't throw
					console.warn("Database initialized with warnings");
					toast({
						title: "Database Warning",
						description:
							"The database initialized with warnings. Some features may be limited.",
						variant: "destructive",
					});
				}
			} catch (err) {
				console.error("Failed to initialize database:", err);
				setError(
					err instanceof Error
						? err
						: new Error("Failed to initialize database"),
				);

				toast({
					title: "Database Error",
					description:
						"Failed to initialize database. Please refresh or try again later.",
					variant: "destructive",
				});
			} finally {
				// Force reset loading state
				setIsLoading(false);
			}
		};

		// Fallback timeout to prevent stuck initializing state
		const timeoutId = setTimeout(() => {
			if (!isInitialized) {
				console.warn("Database initialization timed out");
				setIsInitialized(true);
				setIsLoading(false);
				toast({
					title: "Database Timeout",
					description:
						"Database initialization timed out. Some features may not work correctly.",
					variant: "destructive",
				});
			}
		}, 5000); // 5 second timeout for initialization

		init();

		return () => clearTimeout(timeoutId);
	}, [isInitialized, toast]);

	// Load articles based on current view
	useEffect(() => {
		if (!isInitialized) return;

		let isMounted = true;
		setIsLoading(true);

		const loadArticles = async () => {
			try {
				const options: Parameters<typeof getAllArticles>[0] = {
					sortBy: "savedAt",
					sortDirection: "desc",
				};

				if (currentView === "unread") {
					options.isRead = false;
				} else if (currentView === "favorites") {
					options.favorite = true;
				}

				console.log("Fetching articles with options:", options);
				const fetchedArticles = await getAllArticles(options);
				console.log("Fetched articles:", fetchedArticles.length);

				if (isMounted) {
					setArticles(fetchedArticles);
					setError(null);
					setIsLoading(false);
				}
			} catch (err) {
				console.error("Failed to load articles:", err);

				if (isMounted) {
					setError(
						err instanceof Error ? err : new Error("Failed to load articles"),
					);
					// Return empty array to prevent stuck loading state
					setArticles([]);
					setIsLoading(false);

					toast({
						title: "Loading Error",
						description: "Failed to load articles. Please try again.",
						variant: "destructive",
					});
				}
			}
		};

		// Add timeout to prevent indefinite loading state
		const timeoutId = setTimeout(() => {
			if (isMounted) {
				console.warn("Loading articles timed out");
				setIsLoading(false);
			}
		}, 10000); // 10 second timeout

		loadArticles();

		return () => {
			isMounted = false;
			clearTimeout(timeoutId);
		};
	}, [currentView, isInitialized, toast]);

	// Refresh articles function
	const refreshArticles = useCallback(async () => {
		if (!isInitialized) return [];

		try {
			setIsLoading(true);
			const options: Parameters<typeof getAllArticles>[0] = {
				sortBy: "savedAt",
				sortDirection: "desc",
			};

			if (currentView === "unread") {
				options.isRead = false;
			} else if (currentView === "favorites") {
				options.favorite = true;
			}

			console.log("Refreshing articles with options:", options);
			const fetchedArticles = await getAllArticles(options);
			console.log("Refreshed articles:", fetchedArticles.length);

			// Only update articles if we successfully retrieved them
			if (fetchedArticles && fetchedArticles.length >= 0) {
				setArticles(fetchedArticles);
				setError(null);
			} else {
				console.warn("Received empty or invalid article list during refresh");
				// Don't update state to avoid clearing existing articles
			}

			return fetchedArticles;
		} catch (err) {
			console.error("Failed to refresh articles:", err);
			const errorObj =
				err instanceof Error ? err : new Error("Failed to refresh articles");
			setError(errorObj);

			// Don't clear articles on refresh error - keep the existing ones
			// to prevent flickering/disappearing content
			return articles; // Return current articles instead of null
		} finally {
			setIsLoading(false);
		}
	}, [currentView, isInitialized, articles]);

	// Add article by URL
	const addArticleByUrl = useCallback(
		async (url: string): Promise<Article | null> => {
			setIsLoading(true);
			try {
				const parsedArticle = await parseArticle(url);
				const savedArticle = await saveArticle(parsedArticle);

				// Update articles list to include new article
				setArticles((prevArticles) => [savedArticle, ...prevArticles]);

				toast({
					title: "Article saved",
					description: `"${parsedArticle.title}" has been saved to your library.`,
				});

				return savedArticle;
			} catch (err) {
				console.error("Failed to add article:", err);
				setError(
					err instanceof Error ? err : new Error("Failed to add article"),
				);

				toast({
					title: "Failed to save article",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while saving the article.",
					variant: "destructive",
				});

				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[toast],
	);

	// Add article by file (EPUB or PDF)
	const addArticleByFile = useCallback(
		async (file: File): Promise<Article | null> => {
			setIsLoading(true);
			try {
				// Check file type and validate
				if (isValidEpub(file)) {
					// Save EPUB file
					const savedArticle = await saveEpubFile(file);

					// Update articles list to include new article
					setArticles((prevArticles) => [savedArticle, ...prevArticles]);

					toast({
						title: "EPUB saved",
						description: `"${file.name}" has been saved to your library.`,
					});

					return savedArticle;
				}
				
				if (isValidPdf(file)) {
					// Save PDF file
					const savedArticle = await savePdfFile(file);

					// Update articles list to include new article
					setArticles((prevArticles) => [savedArticle, ...prevArticles]);

					toast({
						title: "PDF saved",
						description: `"${file.name}" has been saved to your library.`,
					});

					return savedArticle;
				}
				
				throw new Error(
					"Invalid file type. Only EPUB and PDF formats are supported.",
				);
			} catch (err) {
				console.error("Failed to add file:", err);
				setError(err instanceof Error ? err : new Error("Failed to add file"));

				toast({
					title: "Failed to save file",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while saving the file.",
					variant: "destructive",
				});

				return null;
			} finally {
				setIsLoading(false);
			}
		},
		[toast],
	);

	// Update article read status and favorite status
	const updateArticleStatus = useCallback(
		async (id: string, isRead: boolean, favorite?: boolean) => {
			try {
				const article = articles.find((a) => a._id === id);
				if (!article || !article._rev) {
					throw new Error("Article not found");
				}

				const updates: Partial<Article> & { _id: string; _rev: string } = {
					_id: id,
					_rev: article._rev,
					isRead,
				};

				if (favorite !== undefined) {
					updates.favorite = favorite;
				}

				// If marking as read and readAt is not set, set it
				if (isRead && !article.readAt) {
					updates.readAt = Date.now();
				}

				const updatedArticle = await updateArticle(updates);

				// Update articles in state
				setArticles((prevArticles) =>
					prevArticles.map((a) => (a._id === id ? updatedArticle : a)),
				);
			} catch (err) {
				console.error("Failed to update article status:", err);
				setError(
					err instanceof Error
						? err
						: new Error("Failed to update article status"),
				);

				toast({
					title: "Failed to update article",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while updating the article.",
					variant: "destructive",
				});
			}
		},
		[articles, toast],
	);

	// Update reading progress
	const updateReadingProgress = useCallback(
		async (id: string, progress: number) => {
			try {
				const article = articles.find((a) => a._id === id);
				if (!article || !article._rev) {
					throw new Error("Article not found");
				}

				const updates: Partial<Article> & { _id: string; _rev: string } = {
					_id: id,
					_rev: article._rev,
					readingProgress: progress,
				};

				// If reached end (90%+), mark as read
				if (progress >= 90 && !article.isRead) {
					updates.isRead = true;
					updates.readAt = Date.now();
				}

				const updatedArticle = await updateArticle(updates);

				// Update articles in state
				setArticles((prevArticles) =>
					prevArticles.map((a) => (a._id === id ? updatedArticle : a)),
				);
			} catch (err) {
				console.error("Failed to update reading progress:", err);
				// Not showing toast for progress updates as they happen frequently
			}
		},
		[articles],
	);

	// Remove article
	const removeArticle = useCallback(
		async (id: string, rev: string) => {
			try {
				await deleteArticle(id, rev);

				// Update articles in state
				setArticles((prevArticles) => prevArticles.filter((a) => a._id !== id));

				toast({
					title: "Article removed",
					description: "The article has been removed from your library.",
				});
			} catch (err) {
				console.error("Failed to remove article:", err);
				setError(
					err instanceof Error ? err : new Error("Failed to remove article"),
				);

				toast({
					title: "Failed to remove article",
					description:
						err instanceof Error
							? err.message
							: "An error occurred while removing the article.",
					variant: "destructive",
				});
			}
		},
		[toast],
	);

	// Create context value
	const contextValue = useMemo(
		() => ({
			articles,
			isLoading,
			error,
			currentView,
			setCurrentView,
			refreshArticles,
			addArticleByUrl,
			addArticleByFile,
			updateArticleStatus,
			removeArticle,
			updateReadingProgress,
		}),
		[
			articles,
			isLoading,
			error,
			currentView,
			refreshArticles,
			addArticleByUrl,
			addArticleByFile,
			updateArticleStatus,
			removeArticle,
			updateReadingProgress,
		],
	);

	return (
		<ArticleContext.Provider value={contextValue}>
			{children}
		</ArticleContext.Provider>
	);
};

export const useArticles = () => {
	const context = useContext(ArticleContext);
	if (context === undefined) {
		throw new Error("useArticles must be used within an ArticleProvider");
	}
	return context;
};
