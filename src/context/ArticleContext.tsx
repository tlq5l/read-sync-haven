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
import { useAuth } from "@clerk/clerk-react";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
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
	retryLoading: () => Promise<void>;
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
	// Add fetch lock to prevent concurrent fetches
	const fetchLockRef = useRef<boolean>(false);
	const { toast } = useToast();
	const { userId, isSignedIn, isLoaded } = useAuth();

	// Initialize database on component mount
	useEffect(() => {
		// Skip if already initialized or auth not loaded
		if (isInitialized || !isLoaded) return;

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
	}, [isInitialized, toast, isLoaded]);

	// Load articles based on current view and user ID
	useEffect(() => {
		if (!isInitialized || !isLoaded) return;

		// Use fetch lock to prevent concurrent fetches
		if (fetchLockRef.current) {
			console.log("Fetch operation already in progress, skipping");
			return;
		}

		let isMounted = true;
		let isLoadingInProgress = true; // Track loading state for timeout

		// Set fetch lock and loading state
		fetchLockRef.current = true;
		setIsLoading(true);

		const loadArticles = async () => {
			try {
				const options: Parameters<typeof getAllArticles>[0] = {
					sortBy: "savedAt",
					sortDirection: "desc",
					userId: isSignedIn ? userId : undefined, // Filter by user ID when signed in
				};

				if (currentView === "unread") {
					options.isRead = false;
				} else if (currentView === "favorites") {
					options.favorite = true;
				}

				console.log(
					`Fetching articles with options for view: ${currentView}`,
					options,
				);
				const fetchedArticles = await getAllArticles(options);
				console.log(
					`Fetched ${fetchedArticles.length} articles for ${currentView} view`,
				);

				if (isMounted) {
					setArticles(fetchedArticles);
					setError(null);
					isLoadingInProgress = false; // Mark loading as complete
				}
			} catch (err) {
				console.error(`Failed to load articles for ${currentView} view:`, err);

				if (isMounted) {
					const errorMessage =
						err instanceof Error ? err.message : "Failed to load articles";

					setError(
						err instanceof Error
							? err
							: new Error(`Failed to load articles for ${currentView} view`),
					);
					// Return empty array to prevent stuck loading state
					setArticles([]);

					toast({
						title: `${currentView.charAt(0).toUpperCase() + currentView.slice(1)} Loading Error`,
						description: `${errorMessage}. Tap the retry button to try again.`,
						variant: "destructive",
					});
				}
			} finally {
				// Always clean up, even if there's an error
				if (isMounted) {
					setIsLoading(false);
					isLoadingInProgress = false;
				}
				// Reset fetch lock when done
				fetchLockRef.current = false;
			}
		};

		// Add timeout to prevent indefinite loading state
		const timeoutId = setTimeout(() => {
			if (isMounted && isLoadingInProgress) {
				console.warn(`Loading articles for ${currentView} view timed out`);
				setIsLoading(false);
				fetchLockRef.current = false; // Reset fetch lock on timeout
				setError(
					new Error(
						`Loading ${currentView} articles timed out. Please try again.`,
					),
				);

				toast({
					title: "Loading Timeout",
					description: `Loading ${currentView} articles timed out. Please try again.`,
					variant: "destructive",
				});
			}
		}, 10000); // 10 second timeout

		loadArticles();

		return () => {
			isMounted = false;
			clearTimeout(timeoutId);
			// Reset fetch lock on cleanup to prevent deadlocks
			fetchLockRef.current = false;
		};
	}, [currentView, isInitialized, toast, userId, isSignedIn, isLoaded]); // Added userId, isSignedIn, isLoaded

	// Refresh articles function
	const refreshArticles = useCallback(async () => {
		if (!isInitialized || !isLoaded) return [];

		// Use fetch lock to prevent concurrent fetches
		if (fetchLockRef.current) {
			console.log("Refresh operation already in progress, skipping");
			return articles; // Return current articles
		}

		try {
			// Set fetch lock and loading state
			fetchLockRef.current = true;
			setIsLoading(true);

			const options: Parameters<typeof getAllArticles>[0] = {
				sortBy: "savedAt",
				sortDirection: "desc",
				userId: isSignedIn ? userId : undefined, // Filter by user ID when signed in
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
			// Reset fetch lock when done
			fetchLockRef.current = false;
		}
	}, [currentView, isInitialized, articles, userId, isSignedIn, isLoaded]); // Added userId, isSignedIn, isLoaded

	// Add article by URL
	const addArticleByUrl = useCallback(
		async (url: string): Promise<Article | null> => {
			if (!isSignedIn) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to save articles.",
					variant: "destructive",
				});
				return null;
			}

			setIsLoading(true);
			try {
				const parsedArticle = await parseArticle(url);

				// Add user ID to the article
				const articleWithUser = {
					...parsedArticle,
					userId,
				};

				const savedArticle = await saveArticle(articleWithUser);

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
		[toast, userId, isSignedIn],
	);

	// Add article by file (EPUB or PDF)
	const addArticleByFile = useCallback(
		async (file: File): Promise<Article | null> => {
			if (!isSignedIn) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to save files.",
					variant: "destructive",
				});
				return null;
			}

			setIsLoading(true);
			try {
				// Check file type and validate
				if (isValidEpub(file)) {
					// Save EPUB file with user ID
					const savedArticle = await saveEpubFile(file, userId);

					// Update articles list to include new article
					setArticles((prevArticles) => [savedArticle, ...prevArticles]);

					toast({
						title: "EPUB saved",
						description: `"${file.name}" has been saved to your library.`,
					});

					return savedArticle;
				}

				if (isValidPdf(file)) {
					// Save PDF file with user ID
					const savedArticle = await savePdfFile(file, userId);

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
		[toast, userId, isSignedIn],
	);

	// Update article read status and favorite status
	const updateArticleStatus = useCallback(
		async (id: string, isRead: boolean, favorite?: boolean) => {
			if (!isSignedIn) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to update articles.",
					variant: "destructive",
				});
				return;
			}

			try {
				const article = articles.find((a) => a._id === id);
				if (!article || !article._rev) {
					throw new Error("Article not found");
				}

				// Check if article belongs to current user
				if (article.userId && article.userId !== userId) {
					throw new Error("You don't have permission to update this article");
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
		[articles, toast, userId, isSignedIn],
	);

	// Update reading progress
	const updateReadingProgress = useCallback(
		async (id: string, progress: number) => {
			if (!isSignedIn) return;

			try {
				const article = articles.find((a) => a._id === id);
				if (!article || !article._rev) {
					throw new Error("Article not found");
				}

				// Check if article belongs to current user
				if (article.userId && article.userId !== userId) {
					throw new Error("You don't have permission to update this article");
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
		[articles, userId, isSignedIn],
	);

	// Remove article
	const removeArticle = useCallback(
		async (id: string, rev: string) => {
			if (!isSignedIn) {
				toast({
					title: "Authentication Required",
					description: "Please sign in to remove articles.",
					variant: "destructive",
				});
				return;
			}

			try {
				// Check if article belongs to current user
				const article = articles.find((a) => a._id === id);
				if (article?.userId && article.userId !== userId) {
					throw new Error("You don't have permission to remove this article");
				}

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
		[toast, articles, userId, isSignedIn],
	);

	// Add retry function
	const retryLoading = useCallback(async () => {
		// Only proceed if not already loading
		if (fetchLockRef.current) {
			console.log("Retry operation already in progress, skipping");
			return;
		}

		setIsLoading(true);
		setError(null);

		toast({
			title: "Retrying",
			description: `Retrying to load ${currentView} articles...`,
		});

		// Force refetch by calling refreshArticles
		await refreshArticles();
	}, [currentView, toast, refreshArticles]);

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
			retryLoading,
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
			retryLoading,
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
