import { useToast } from "@/hooks/use-toast";
import {
	deleteItemFromCloud,
	fetchCloudItems,
	saveItemToCloud,
} from "@/services/cloudSync";
import {
	type Article,
	type QueuedOperation,
	articlesDb,
	bulkSaveArticles,
	getAllArticles,
	deleteArticle as localSoftDeleteArticle,
	operationsQueueDb,
} from "@/services/db";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// --- Helper Functions (unchanged) ---

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

async function _loadArticlesFromCache(
	isMounted: boolean,
	isSignedIn: boolean | null | undefined,
	userId: string | null | undefined,
	setArticles: React.Dispatch<React.SetStateAction<Article[]>>,
): Promise<boolean> {
	if (!isSignedIn || !userId) return false;
	try {
		console.log(`Cache Load: User ${userId}`);
		const cachedArticles = await getAllArticles({ userIds: [userId] });
		if (isMounted && cachedArticles?.length > 0) {
			console.log(`Cache Load: Found ${cachedArticles.length} articles.`);
			const dedupedArticles = deduplicateArticlesById(cachedArticles);
			const sortedArticles = [...dedupedArticles].sort(
				(a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0),
			);
			setArticles(sortedArticles);
			return true;
		}
		if (isMounted) setArticles([]);
	} catch (cacheErr) {
		console.error("Cache Load Error:", cacheErr);
		if (isMounted) setArticles([]);
	}
	return false;
}

async function _processOfflineQueue(token: string): Promise<{
	processedDeletes: Set<string>;
	processedUpdates: Set<string>;
	failedOps: number;
}> {
	console.log("Queue Processing: Starting...");
	let failedOps = 0;
	const processedDeletes = new Set<string>();
	const processedUpdates = new Set<string>();

	try {
		const queueResult = await operationsQueueDb.allDocs<QueuedOperation>({
			include_docs: true,
			limit: 50,
		});

		if (queueResult.rows.length === 0) {
			console.log("Queue Processing: Empty.");
			return { processedDeletes, processedUpdates, failedOps };
		}
		console.log(`Queue Processing: Found ${queueResult.rows.length} items.`);

		const opsToRemove: QueuedOperation[] = [];
		const opsToUpdate: QueuedOperation[] = [];

		for (const row of queueResult.rows) {
			if (!row.doc) continue;
			const op = row.doc;
			let success = false;
			try {
				if (op.type === "delete") {
					const deleteStatus = await deleteItemFromCloud(op.docId, token);
					if (deleteStatus === "success" || deleteStatus === "not_found") {
						success = true;
						processedDeletes.add(op.docId);
					} else {
						console.warn(
							`Queue Delete Failed: ${op.docId}, Status: ${deleteStatus}`,
						);
					}
				} else if (op.type === "update" && op.data) {
					const latestLocal = await articlesDb.get(op.docId).catch(() => null);
					if (latestLocal && !latestLocal.deletedAt) {
						const updateStatus = await saveItemToCloud(latestLocal, token);
						if (updateStatus === "success") {
							success = true;
							processedUpdates.add(op.docId);
						} else {
							console.warn(
								`Queue Update Failed: ${op.docId}, Status: ${updateStatus}`,
							);
						}
					} else {
						success = true; /* Skip update, remove op */
					}
				}

				if (success) {
					opsToRemove.push(op);
				} else {
					op.retryCount = (op.retryCount || 0) + 1;
					if (op.retryCount <= 5) opsToUpdate.push(op);
					else {
						opsToRemove.push(op);
						failedOps++;
						console.error(`Queue Max Retries: ${op.type} ${op.docId}`);
					}
				}
			} catch (opError) {
				console.error(`Queue Item Error ${op._id}:`, opError);
				failedOps++;
				op.retryCount = (op.retryCount || 0) + 1;
				if (op.retryCount <= 5) opsToUpdate.push(op);
				else {
					opsToRemove.push(op);
					console.error(`Queue Max Retries (Error): ${op.type} ${op.docId}`);
				}
			}
		}
		if (opsToRemove.length > 0)
			await operationsQueueDb.bulkDocs(
				opsToRemove.map((op) => ({ ...op, _deleted: true })),
			);
		if (opsToUpdate.length > 0) await operationsQueueDb.bulkDocs(opsToUpdate);
	} catch (queueError) {
		console.error("Queue Access Error:", queueError);
		failedOps = -1;
	}
	console.log(
		`Queue Processing Finished. Failed ops: ${failedOps >= 0 ? failedOps : "N/A"}.`,
	);
	return { processedDeletes, processedUpdates, failedOps };
}

// _performCloudSync now only manages isRefreshing state
async function _performCloudSync(
	authResult: ReturnType<typeof useAuth>,
	userResult: ReturnType<typeof useUser>,
	isMountedRef: React.MutableRefObject<boolean>,
	toast: (props: any) => void,
	setArticles: React.Dispatch<React.SetStateAction<Article[]>>,
	setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>, // Changed: No setIsLoading
	setError: React.Dispatch<React.SetStateAction<Error | null>>,
	fetchLockRef: React.MutableRefObject<boolean>,
	hidingArticleIds: Set<string>,
) {
	const userId = authResult.userId;
	// Declare loadedFromCache here
	let loadedFromCache = false;

	if (!authResult.isSignedIn || !userId) {
		console.log("Sync: Skipping - Not signed in.");
		if (isMountedRef.current) setIsRefreshing(false); // Ensure refreshing is false if skipped
		return;
	}

	if (fetchLockRef.current) {
		console.log("Sync: Already in progress, skipping.");
		return;
	}
	fetchLockRef.current = true;

	console.log("Sync: Starting...");
	if (isMountedRef.current) {
		setIsRefreshing(true); // Set refreshing true at the start
		setError(null);
	}

	let syncTimeoutId: NodeJS.Timeout | null = null;
	const syncPromise = new Promise<void>((resolve, reject) => {
		// Wrap async logic in an IIAFE
		(async () => {
			// Determine loadedFromCache status first inside the main try block
			loadedFromCache = await _loadArticlesFromCache(
				isMountedRef.current,
				authResult.isSignedIn,
				userId,
				() => {},
			); // Dummy setter

			try {
				const token = await authResult.getToken();
				const userEmail = userResult.user?.primaryEmailAddress?.emailAddress;

				if (!token) {
					throw new Error("Authentication token missing, cannot sync.");
				}

				// Process Queue
				const { processedDeletes, processedUpdates, failedOps } =
					await _processOfflineQueue(token);
				if (failedOps < 0)
					toast({
						title: "Sync Warning",
						description: "Error processing offline changes.",
					});

				// Fetch States
				console.log("Sync: Fetching local & cloud articles...");
				const [allLocalDocs, cloudArticlesRaw] = await Promise.all([
					getAllArticles({ userIds: [userId], includeDeleted: true }),
					fetchCloudItems(token, userEmail),
				]);
				const localArticlesMap = new Map(
					allLocalDocs.map((doc) => [doc._id, doc]),
				);
				const cloudArticles = cloudArticlesRaw.map((a) => ({
					...a,
					userId: a.userId ?? userId,
					version: a.version || 1,
				}));
				const cloudArticlesMap = new Map(
					cloudArticles.map((doc) => [doc._id, doc]),
				);
				console.log(
					`Sync: Fetched ${localArticlesMap.size} local, ${cloudArticlesMap.size} cloud.`,
				);

				// Reconcile
				console.log("Sync: Reconciling...");
				const toCreateLocally: Article[] = [];
				const toUpdateLocally: Article[] = [];
				const toSoftDeleteLocally: string[] = [];
				const cloudDeletesToHardDeleteLocally: Article[] = [];
				const toUpdateCloudQueue: QueuedOperation[] = [];

				const isValidCloudArticle = (
					article: Article | null | undefined,
				): article is Article => {
					if (
						!article?._id ||
						!article.title ||
						!article.url ||
						!article.content
					) {
						console.warn(
							`Sync: Invalid cloud data for ID: ${article?._id || "UNKNOWN"}`,
							article,
						);
						return false;
					}
					return true;
				};

				for (const [cloudId, cloudArticle] of cloudArticlesMap.entries()) {
					const localArticle = localArticlesMap.get(cloudId);
					if (!localArticle) {
						// Cloud Create
						if (isValidCloudArticle(cloudArticle))
							toCreateLocally.push(cloudArticle);
					} else {
						// Exists locally
						const localV = localArticle.version || 0;
						const cloudV = cloudArticle.version || 0;
						if (localArticle.deletedAt) {
							// Locally deleted
							if (cloudV > localV) {
								// Cloud Undelete/Update
								if (isValidCloudArticle(cloudArticle))
									toUpdateLocally.push({
										...cloudArticle,
										_rev: localArticle._rev,
									});
							} else {
								// Local delete wins, ensure cloud delete (if not queued)
								if (!processedDeletes.has(cloudId)) {
									console.log(
										`Sync: Re-attempting cloud delete for ${cloudId}`,
									);
									const delStatus = await deleteItemFromCloud(
										cloudId,
										token,
									).catch((e) => {
										console.error(e);
										return "error";
									});
									if (delStatus === "success" || delStatus === "not_found")
										cloudDeletesToHardDeleteLocally.push(localArticle);
								} else {
									cloudDeletesToHardDeleteLocally.push(localArticle);
								} // Mark for hard delete
							}
						} else {
							// Exists locally, not deleted
							if (cloudV > localV) {
								// Cloud Update
								if (isValidCloudArticle(cloudArticle))
									toUpdateLocally.push({
										...cloudArticle,
										_rev: localArticle._rev,
									});
							} else if (localV > cloudV && !processedUpdates.has(cloudId)) {
								// Local Update
								console.log(`Sync: Queuing local update for ${cloudId}`); // Use cloudId
								toUpdateCloudQueue.push({
									_id: `queue_update_${cloudId}_${Date.now()}`,
									type: "update",
									docId: cloudId,
									timestamp: Date.now(),
									retryCount: 0,
									data: localArticle,
								}); // Use cloudId
							} // Else versions match, do nothing
						}
					}
					localArticlesMap.delete(cloudId); // Remove processed entry
				}

				for (const [localId, localArticle] of localArticlesMap.entries()) {
					// Remaining local docs
					if (localArticle.deletedAt) {
						// Previously soft-deleted
						if (processedDeletes.has(localId))
							cloudDeletesToHardDeleteLocally.push(localArticle); // Ensure hard delete
					} else {
						// Cloud deleted this item
						console.log(
							`Sync: Cloud deleted ${localId}. Soft deleting locally.`,
						);
						toSoftDeleteLocally.push(localId);
					}
				}

				// Apply Changes
				console.log(
					`Sync: Applying changes - Create: ${toCreateLocally.length}, Update: ${toUpdateLocally.length}, SoftDel: ${toSoftDeleteLocally.length}, HardDel: ${cloudDeletesToHardDeleteLocally.length}, QueueCloud: ${toUpdateCloudQueue.length}`,
				);
				const saveOps = [...toCreateLocally, ...toUpdateLocally];
				const hardDeleteOps = cloudDeletesToHardDeleteLocally.map((doc) => ({
					_id: doc._id,
					_rev: doc._rev,
					_deleted: true,
				}));
				const localOpsPromises = [];
				if (saveOps.length > 0)
					localOpsPromises.push(
						bulkSaveArticles(saveOps).catch((err) =>
							console.error("Local Save Error:", err),
						),
					);
				if (hardDeleteOps.length > 0)
					localOpsPromises.push(
						articlesDb
							.bulkDocs(hardDeleteOps as any[])
							.catch((err) => console.error("Local Hard Delete Error:", err)),
					);
				if (toSoftDeleteLocally.length > 0)
					localOpsPromises.push(
						...toSoftDeleteLocally.map((id) =>
							localSoftDeleteArticle(id).catch((err) =>
								console.error(`Local Soft Delete Error ${id}:`, err),
							),
						),
					);
				if (toUpdateCloudQueue.length > 0)
					localOpsPromises.push(
						operationsQueueDb
							.bulkDocs(toUpdateCloudQueue)
							.catch((err) => console.error("Queue Update Error:", err)),
					);

				await Promise.all(localOpsPromises);

				// Update UI State only if mounted
				if (isMountedRef.current) {
					console.log("Sync: Refetching final state for UI...");
					const finalLocalArticles = await getAllArticles({
						userIds: [userId],
					});
					const articlesToSet = finalLocalArticles.filter(
						(doc) => !hidingArticleIds.has(doc._id),
					);
					setArticles(articlesToSet);
					setError(null); // Clear error on success
				}
				console.log("Sync: Reconciliation complete.");
				resolve();
			} catch (syncErr) {
				console.error("Sync: Top-level error:", syncErr);
				if (isMountedRef.current) {
					const error =
						syncErr instanceof Error
							? syncErr
							: new Error("Failed to sync articles");
					// Don't modify articles state here on error, keep potentially cached data
					setError(error); // Set error state
					toast({
						title: "Cloud Sync Failed",
						description: `${error.message}. Displaying local data if available.`,
						variant: "destructive",
					});
				}
				reject(syncErr);
			}
		})().catch(reject); // Catch potential errors from the IIAFE itself and reject the promise
	});

	// Timeout handling
	syncTimeoutId = setTimeout(() => {
		if (isMountedRef.current && fetchLockRef.current) {
			// Check lock too
			console.warn("Sync: Timed out.");
			fetchLockRef.current = false; // Release lock on timeout
			const timeoutError = new Error("Syncing articles timed out.");
			if (!loadedFromCache)
				setError(timeoutError); // Only set error if initial load timed out
			else
				toast({
					title: "Sync Timeout",
					description: timeoutError.message,
					variant: "default",
				});
			// Ensure loading/refreshing are false on timeout
			setIsRefreshing(false); // Only manage refreshing state
		}
	}, 30000);

	// Final cleanup
	try {
		await syncPromise;
	} catch (e) {
		// Error already handled
	} finally {
		if (syncTimeoutId) clearTimeout(syncTimeoutId);
		if (isMountedRef.current) {
			setIsRefreshing(false); // Ensure refreshing is false
		}
		fetchLockRef.current = false; // Ensure lock is released
		console.log("Sync: Process finished.");
	}
}

// --- Main Hook ---
export function useArticleSync(
	isInitialized: boolean,
	hidingArticleIds: Set<string>,
) {
	const [articles, setArticles] = useState<Article[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true); // Manages initial load state
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false); // Manages sync/refresh state
	const [error, setError] = useState<Error | null>(null);
	const fetchLockRef = useRef<boolean>(false);
	const isMountedRef = useRef<boolean>(false);
	const { toast } = useToast();
	const auth = useAuth();
	const userResult = useUser();

	// Track mount status
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	// --- Initial Load Effect ---
	useEffect(() => {
		let didUnmount = false;
		const loadInitialData = async () => {
			if (!isInitialized || !auth.isLoaded) {
				// If not ready, ensure loading state is true and reset others
				if (!didUnmount) {
					setIsLoading(true);
					setArticles([]);
					setIsRefreshing(false);
					setError(null);
				}
				return;
			}

			// Only proceed if currently in the loading state to avoid re-triggering
			if (!isLoading) {
				console.log(
					"Initial Load Effect: Skipping cache load, not in initial loading state.",
				);
				return;
			}

			console.log("Initial Load Effect: Triggering cache load...");
			await _loadArticlesFromCache(
				!didUnmount, // Pass !didUnmount instead of isMountedRef.current
				auth.isSignedIn,
				auth.userId,
				setArticles,
			);

			// Set loading false *after* cache load attempt completes
			if (!didUnmount) {
				console.log(
					"Initial Load Effect: Cache load attempt finished. Setting loading state: false.",
				);
				setIsLoading(false);
			}
		};

		loadInitialData();

		return () => {
			didUnmount = true; // Cleanup flag
		};
	}, [isInitialized, auth.isLoaded, auth.isSignedIn, auth.userId, isLoading]); // Rerun if init/auth status changes, added isLoading

	// --- Sync Effect (Triggered by auth change AFTER initial load) ---
	const [syncTrigger, setSyncTrigger] = useState(0);
	useEffect(() => {
		// Trigger sync only if initialized, auth loaded, and *not* in initial loading state
		if (isInitialized && auth.isLoaded && !isLoading) {
			console.log(
				"Sync Trigger Effect: Auth state changed after load, triggering sync.",
			);
			setSyncTrigger((prev) => prev + 1);
		}
	}, [isInitialized, auth.isLoaded, isLoading]); // Re-run when these change *after* isLoading is false

	// Actual Syncing Logic Effect
	useEffect(() => {
		// Run only when triggered and component is mounted
		if (syncTrigger > 0 && isMountedRef.current) {
			console.log(`Sync Effect: Performing sync (Trigger: ${syncTrigger})`);
			_performCloudSync(
				auth,
				userResult,
				isMountedRef,
				toast,
				setArticles,
				// Removed setIsLoading (now managed by Initial Load Effect)
				setIsRefreshing,
				setError,
				fetchLockRef,
				hidingArticleIds,
			);
		}
	}, [syncTrigger, auth, userResult, toast, hidingArticleIds]); // Dependencies are auth results + props/stable functions

	// --- Refresh Function ---
	const refreshArticles = useCallback(async () => {
		console.log("Refresh Triggered");
		if (!isInitialized || !auth.isLoaded || !auth.isSignedIn || !auth.userId) {
			console.log("Refresh Skipped: Not ready");
			return articles;
		}
		// Directly call the sync logic
		await _performCloudSync(
			auth,
			userResult,
			isMountedRef,
			toast,
			setArticles,
			// Removed setIsLoading (now managed by Initial Load Effect)
			setIsRefreshing,
			setError,
			fetchLockRef,
			hidingArticleIds,
		);
		return articles; // Return current state, UI updates via setters
	}, [isInitialized, auth, userResult, toast, articles, hidingArticleIds]); // Removed setIsLoading from deps

	// --- Retry Function ---
	const retryLoading = useCallback(() => {
		console.log("Retry Triggered");
		if (fetchLockRef.current) return; // Don't retry if already syncing/refreshing
		setError(null);
		// Reset loading state and trigger initial load/sync sequence
		setIsLoading(true); // Set loading true to re-trigger initial load effect
	}, []); // Removed setIsLoading dependency

	// Memoize the returned object
	const returnedValue = useMemo(
		() => ({
			articles,
			isLoading,
			isRefreshing,
			error,
			refreshArticles,
			retryLoading,
		}),
		[articles, isLoading, isRefreshing, error, refreshArticles, retryLoading],
	);

	return returnedValue;
}
