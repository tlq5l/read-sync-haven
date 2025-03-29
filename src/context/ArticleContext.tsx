import { useToast } from "@/hooks/use-toast";
import { fetchCloudItems } from "@/services/cloudSync"; // Import the cloud fetch function
import {
	type Article,
	deleteArticle,
	getAllArticles, // Re-add getAllArticles for cache-first loading
	getArticle, // Add getArticle import
	initializeDatabase,
	saveArticle,
	saveEpubFile,
	savePdfFile,
	updateArticle,
} from "@/services/db";
import { isValidEpub } from "@/services/epub";
import { parseArticle } from "@/services/parser";
import { isValidPdf } from "@/services/pdf";
import { useAuth, useUser } from "@clerk/clerk-react"; // Import useUser
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
	isLoading: boolean; // True when initially loading OR loading without cache
	isRefreshing: boolean; // True when syncing with cloud in the background
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
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false); // Add isRefreshing state
	const [error, setError] = useState<Error | null>(null);
	const [currentView, setCurrentView] = useState<
		"all" | "unread" | "favorites"
	>("all");
	const [isInitialized, setIsInitialized] = useState<boolean>(false);
	// Add fetch lock to prevent concurrent fetches
	const fetchLockRef = useRef<boolean>(false);
	const { toast } = useToast();
	// Destructure getToken here
	const { userId, isSignedIn, isLoaded, getToken } = useAuth();
	const { user } = useUser(); // Add this to get the user's email

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

		// Use fetch lock to prevent concurrent fetches/syncs
		if (fetchLockRef.current) {
			console.log("Load/Sync operation already in progress, skipping");
			return;
		}

		let isMounted = true;
		let syncTimeoutId: NodeJS.Timeout | null = null;

		const loadAndSyncArticles = async () => {
			// Set fetch lock
			fetchLockRef.current = true;

			let loadedFromCache = false;

			// --- 1. Attempt to load from local cache first ---
			if (isSignedIn && userId) {
				try {
					console.log(
						`Attempting to load articles from cache for user ${userId}...`,
					);
					const cachedArticles = await getAllArticles({ userId: userId });

					if (isMounted && cachedArticles && cachedArticles.length > 0) {
						console.log(`Loaded ${cachedArticles.length} articles from cache.`);
						// Apply view filtering to cached data
						let filteredCached = cachedArticles;
						if (currentView === "unread") {
							filteredCached = cachedArticles.filter((a) => !a.isRead);
						} else if (currentView === "favorites") {
							filteredCached = cachedArticles.filter((a) => a.favorite);
						}
						// Sort cached data
						filteredCached.sort((a, b) => b.savedAt - a.savedAt);

						setArticles(filteredCached);
						setIsLoading(false); // Stop initial loading indicator
						setIsRefreshing(true); // Start background refresh indicator
						setError(null);
						loadedFromCache = true;
					} else if (isMounted) {
						console.log("No articles found in cache or component unmounted.");
						// If cache is empty, ensure loading state is true before cloud fetch
						setIsLoading(true);
						setIsRefreshing(false); // Not refreshing if loading from scratch
					}
				} catch (cacheErr) {
					console.error("Error loading articles from cache:", cacheErr);
					if (isMounted) {
						// Don't set global error yet, try cloud sync
						// Ensure loading state is true if cache fails
						setIsLoading(true);
						setIsRefreshing(false);
					}
				}
			} else {
				// Not signed in or no userId, set initial state
				if (isMounted) {
					setArticles([]);
					setIsLoading(false);
					setIsRefreshing(false);
					setError(null);
				}
				// Don't proceed to cloud sync if not signed in
				fetchLockRef.current = false; // Release lock
				return;
			}

			// --- 2. Sync with Cloud (always runs if signed in) ---
			if (!isSignedIn || !userId) {
				// Should have returned earlier, but double-check
				fetchLockRef.current = false;
				return;
			}

			// If we didn't load from cache, ensure loading state is true
			if (!loadedFromCache && isMounted) {
				setIsLoading(true);
				setIsRefreshing(false);
			}

			// Start timeout for cloud sync
			let syncInProgress = true;
			syncTimeoutId = setTimeout(() => {
				if (isMounted && syncInProgress) {
					console.warn(`Cloud sync for ${currentView} view timed out`);
					if (isMounted) {
						setIsRefreshing(false); // Stop refreshing indicator on timeout
						// Keep isLoading as is (might be false if cache loaded)
						fetchLockRef.current = false; // Reset fetch lock on timeout
						setError(
							new Error(
								`Syncing ${currentView} articles timed out. Displaying cached data.`,
							),
						);
						toast({
							title: "Sync Timeout",
							description: `Syncing ${currentView} articles timed out. Displaying cached data.`,
							variant: "default", // Less severe than destructive
						});
					}
				}
			}, 15000); // 15 second timeout for sync

			try {
				console.log("Starting background sync with cloud...");
				const token = await getToken();
				const userEmail = user?.primaryEmailAddress?.emailAddress;

				if (!token) {
					throw new Error("Could not retrieve authentication token for sync.");
				}

				const fetchedArticles = await fetchCloudItems(token, userEmail);
				syncInProgress = false; // Mark sync as complete before processing
				if (syncTimeoutId) clearTimeout(syncTimeoutId); // Clear timeout on success

				console.log(
					`Synced ${fetchedArticles.length} articles from cloud for user ${userId} / ${userEmail}`,
				);

				// --- Save/Update fetched articles in local PouchDB ---
				if (fetchedArticles.length > 0) {
					console.log(
						`Attempting to save/update ${fetchedArticles.length} synced articles locally...`,
					);
					for (const article of fetchedArticles) {
						try {
							const articleToSave = { ...article, userId: userId };
							await saveArticle(articleToSave);
						} catch (saveErr) {
							console.warn(
								`Failed to save/update synced article ${article._id} locally:`,
								saveErr,
							);
						}
					}
					console.log("Finished saving/updating synced articles locally.");
				}
				// ----------------------------------------------------

				// --- Re-fetch from local DB AFTER saving cloud data ---
				console.log("Re-fetching articles from local DB after sync...");
				const localArticlesAfterSync = await getAllArticles({
					userId: userId ?? undefined,
				}); // Handle null userId
				console.log(
					`Fetched ${localArticlesAfterSync.length} articles locally after sync.`,
				);
				// ------------------------------------------------------

				// Apply client-side filtering based on currentView to the LOCAL data
				let filteredArticles = localArticlesAfterSync; // Use local data now
				if (currentView === "unread") {
					filteredArticles = localArticlesAfterSync.filter((a) => !a.isRead);
				} else if (currentView === "favorites") {
					filteredArticles = localArticlesAfterSync.filter((a) => a.favorite);
				}

				// Sort local articles
				filteredArticles.sort((a, b) => b.savedAt - a.savedAt);

				if (isMounted) {
					// Update state with the local, filtered & sorted list
					setArticles(filteredArticles);
					setError(null); // Clear any previous error on successful sync
				}
			} catch (syncErr) {
				syncInProgress = false; // Mark sync as complete on error
				if (syncTimeoutId) clearTimeout(syncTimeoutId); // Clear timeout on error
				console.error(
					`Failed to sync articles for ${currentView} view:`,
					syncErr,
				);

				if (isMounted) {
					const errorMessage =
						syncErr instanceof Error
							? syncErr.message
							: "Failed to sync articles";

					// Only set global error if we didn't load from cache initially
					if (!loadedFromCache) {
						setError(
							syncErr instanceof Error
								? syncErr
								: new Error(`Failed to sync articles for ${currentView} view`),
						);
						// Clear articles if sync fails AND cache didn't load
						setArticles([]);
					}

					// Show a toast indicating sync failure, but keep cached data if present
					toast({
						title: "Cloud Sync Failed",
						description: `${errorMessage}. Displaying local data.`,
						variant: "destructive", // Keep destructive for sync failure
					});
				}
			} finally {
				// Always clean up, even if there's an error or timeout
				if (isMounted) {
					setIsLoading(false); // Ensure loading is false
					setIsRefreshing(false); // Ensure refreshing is false
				}
				// Reset fetch lock when done
				fetchLockRef.current = false;
			}
		};

		loadAndSyncArticles();

		return () => {
			isMounted = false;
			if (syncTimeoutId) clearTimeout(syncTimeoutId);
			// Reset fetch lock on cleanup to prevent deadlocks if unmounted mid-operation
			// fetchLockRef.current = false; // Be cautious resetting here, might allow concurrent starts
		};
	}, [
		currentView,
		isInitialized,
		toast,
		isSignedIn,
		isLoaded,
		getToken,
		user,
		userId,
	]); // Dependencies remain the same

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

			let fetchedArticles: Article[] = [];

			if (isSignedIn) {
				console.log("User is signed in, refreshing from cloud...");
				const token = await getToken(); // Get Clerk token
				// Get user's primary email
				const userEmail = user?.primaryEmailAddress?.emailAddress;

				if (token) {
					// Pass both token and email to fetchCloudItems
					fetchedArticles = await fetchCloudItems(token, userEmail);
					console.log(
						`Refreshed ${fetchedArticles.length} articles from cloud for user ${userId} / ${userEmail}`,
					);
				} else {
					console.warn("User is signed in but no token available for refresh.");
					fetchedArticles = []; // Show empty on token failure during refresh
					throw new Error(
						"Could not retrieve authentication token for refresh.",
					);
				}
			} else {
				console.log("User is not signed in, showing empty list on refresh.");
				fetchedArticles = [];
			}

			// Apply client-side filtering based on currentView
			let filteredArticles = fetchedArticles;
			if (currentView === "unread") {
				filteredArticles = fetchedArticles.filter((a) => !a.isRead);
			} else if (currentView === "favorites") {
				filteredArticles = fetchedArticles.filter((a) => a.favorite);
			}

			// Sort articles before saving/setting state
			filteredArticles.sort((a, b) => b.savedAt - a.savedAt);

			// --- Save/Update fetched articles in local PouchDB ---
			if (isSignedIn && fetchedArticles.length > 0) {
				console.log(
					`Attempting to save/update ${fetchedArticles.length} refreshed articles locally...`,
				);
				for (const article of fetchedArticles) {
					try {
						// Ensure the article has the correct Clerk user ID before saving locally
						const articleToSave = { ...article, userId: userId }; // Use Clerk userId
						await saveArticle(articleToSave); // saveArticle should handle upserts
					} catch (saveErr) {
						console.warn(
							`Failed to save/update refreshed article ${article._id} locally:`,
							saveErr,
						);
						// Decide if we should continue or stop? For now, continue.
					}
				}
				console.log("Finished saving/updating refreshed articles locally.");
			}
			// ------------------------------------------------

			// --- Re-fetch from local DB AFTER saving cloud data ---
			console.log("Re-fetching articles from local DB after refresh...");
			const localArticlesAfterRefresh = await getAllArticles({
				userId: userId ?? undefined,
			}); // Handle null userId
			console.log(
				`Fetched ${localArticlesAfterRefresh.length} articles locally after refresh.`,
			);
			// ------------------------------------------------------

			// Apply client-side filtering based on currentView to the LOCAL data
			filteredArticles = localArticlesAfterRefresh; // Use local data now (Assign, don't re-declare)
			if (currentView === "unread") {
				filteredArticles = localArticlesAfterRefresh.filter((a) => !a.isRead);
			} else if (currentView === "favorites") {
				filteredArticles = localArticlesAfterRefresh.filter((a) => a.favorite);
			}

			// Sort local articles
			filteredArticles.sort((a, b) => b.savedAt - a.savedAt);

			// Update state with the local, filtered & sorted list
			setArticles(filteredArticles);
			setError(null); // Set error to null on successful fetch and filter

			return filteredArticles; // Return the filtered/sorted local articles
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
	}, [
		articles, // Keep articles as dep because we return it on error
		isSignedIn,
		isLoaded,
		getToken,
		currentView, // Add currentView back for filtering
		isInitialized, // Add isInitialized back for check
		user, // Add user
		userId, // Add userId
	]); // Final correct dependencies

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
				// Fetch the latest article data directly from DB
				const fetchedArticle = await getArticle(id);
				if (!fetchedArticle || !fetchedArticle._rev) {
					// Use a more specific error message
					throw new Error(
						"Could not retrieve article details for update. It might have been deleted.",
					);
				}

				// Check if article belongs to current user using fetched data
				if (fetchedArticle.userId && fetchedArticle.userId !== userId) {
					// Get user email for checking
					const userEmail = user?.primaryEmailAddress?.emailAddress;
					// Check if article belongs to user's email
					if (userEmail && fetchedArticle.userId !== userEmail) {
						throw new Error("You don't have permission to update this article");
					}
					// If no email match but userId mismatch, still throw permission error
					if (!userEmail) {
						throw new Error("You don't have permission to update this article");
					}
				}

				const updates: Partial<Article> & { _id: string; _rev: string } = {
					_id: id,
					_rev: fetchedArticle._rev, // Use _rev from fetched article
					isRead,
				};

				if (favorite !== undefined) {
					updates.favorite = favorite;
				}

				// If marking as read and readAt is not set, set it (use fetched data)
				if (isRead && !fetchedArticle.readAt) {
					updates.readAt = Date.now();
				}

				const updatedArticle = await updateArticle(updates);

				// Update articles in state (if it exists there)
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
		// Remove 'articles' from dependencies as we fetch directly now
		[toast, userId, isSignedIn, user],
	);

	// Update reading progress
	const updateReadingProgress = useCallback(
		async (id: string, progress: number) => {
			if (!isSignedIn) return;

			try {
				// Fetch the latest article data directly from DB
				const fetchedArticle = await getArticle(id);
				if (!fetchedArticle || !fetchedArticle._rev) {
					// Don't throw an error here, just log and exit silently
					// as progress updates are less critical than status changes
					console.warn(
						`Could not retrieve article ${id} for progress update. It might have been deleted.`,
					);
					return;
				}

				// Check if article belongs to current user using fetched data
				if (fetchedArticle.userId && fetchedArticle.userId !== userId) {
					const userEmail = user?.primaryEmailAddress?.emailAddress;
					if (userEmail && fetchedArticle.userId !== userEmail) {
						console.warn(
							`Permission denied: User ${userId}/${userEmail} cannot update progress for article ${id} owned by ${fetchedArticle.userId}`,
						);
						return; // Exit silently on permission error
					}
					if (!userEmail) {
						console.warn(
							`Permission denied: User ${userId} cannot update progress for article ${id} owned by ${fetchedArticle.userId}`,
						);
						return; // Exit silently on permission error
					}
				}

				const updates: Partial<Article> & { _id: string; _rev: string } = {
					_id: id,
					_rev: fetchedArticle._rev, // Use _rev from fetched article
					readingProgress: progress,
				};

				// If reached end (90%+) and not already marked read, mark as read
				if (progress >= 90 && !fetchedArticle.isRead) {
					updates.isRead = true;
					updates.readAt = Date.now();
				}

				const updatedArticle = await updateArticle(updates);

				// Update articles in state (if it exists there)
				setArticles((prevArticles) =>
					prevArticles.map((a) => (a._id === id ? updatedArticle : a)),
				);
			} catch (err) {
				console.error("Failed to update reading progress:", err);
				// Not showing toast for progress updates as they happen frequently
			}
		},
		// Remove 'articles' from dependencies
		[userId, isSignedIn, user],
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
					// Get user email for checking
					const userEmail = user?.primaryEmailAddress?.emailAddress;
					// Check if article belongs to user's email
					if (userEmail && article.userId !== userEmail) {
						throw new Error("You don't have permission to remove this article");
					}
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
		[toast, articles, userId, isSignedIn, user],
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
			isRefreshing, // Add isRefreshing here
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
			isRefreshing, // Add isRefreshing dependency
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
