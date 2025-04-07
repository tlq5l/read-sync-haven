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

// Loads articles from the local cache (PouchDB)
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
			// Return early if queue is empty - still inside try
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
				console.log(
					`>>> _processOfflineQueue: CAUGHT opError for ${op._id}`,
					opError,
				); // Added Log
				console.error(`Queue Item Error ${op._id}:`, opError);
				failedOps++;
				op.retryCount = (op.retryCount || 0) + 1;
				if (op.retryCount <= 5) opsToUpdate.push(op);
				else {
					opsToRemove.push(op);
					console.error(`Queue Max Retries (Error): ${op.type} ${op.docId}`);
				}
			} // End inner try-catch
		} // End for...of loop

		// Perform bulk updates/removals after the loop, still inside the main try block
		if (opsToRemove.length > 0)
			await operationsQueueDb.bulkDocs(
				opsToRemove.map((op) => ({ ...op, _deleted: true })),
			);
		if (opsToUpdate.length > 0) await operationsQueueDb.bulkDocs(opsToUpdate);
	} catch (queueError) {
		// Catch block for the main try
		console.log(
			">>> _processOfflineQueue: CAUGHT outer queueError",
			queueError,
		); // Added Log
		console.error("Queue Access Error:", queueError);
		failedOps = -1; // Indicate failure
		// Re-throw the error so it's caught by _performCloudSync's handler
		throw queueError;
	}

	// Final log and return statement should be here, after try/catch
	console.log(
		`Queue Processing Finished. Failed ops: ${failedOps >= 0 ? failedOps : "N/A"}.`,
	);
	return { processedDeletes, processedUpdates, failedOps };
} // End _processOfflineQueue function

// _performCloudSync now only manages isRefreshing state
async function _performCloudSync(
	authResult: ReturnType<typeof useAuth>,
	userResult: ReturnType<typeof useUser>,
	isMountedRef: React.MutableRefObject<boolean>,
	toast: (props: any) => void,
	setArticles: React.Dispatch<React.SetStateAction<Article[]>>,
	isRefreshing: boolean, // Pass the current state value
	setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>,
	setError: React.Dispatch<React.SetStateAction<Error | null>>,
	setSyncStatus: React.Dispatch<
		React.SetStateAction<"idle" | "syncing" | "success" | "offline">
	>,
	fetchLockRef: React.MutableRefObject<boolean>,
	hidingArticleIds: Set<string>,
) {
	const userId = authResult.userId;
	// Declare loadedFromCache here

	if (!authResult.isSignedIn || !userId) {
		console.log("Sync: Skipping - Not signed in.");
		if (isMountedRef.current) setIsRefreshing(false); // Ensure refreshing is false if skipped
		fetchLockRef.current = false; // Also release lock if skipping early
		return;
	}

	if (fetchLockRef.current) {
		console.log("Sync: Already in progress, skipping.");
		return;
	}
	fetchLockRef.current = true;

	console.log(">>> _performCloudSync: START"); // Added Log
	console.log("Sync: Starting...");
	if (isMountedRef.current) {
		setIsRefreshing(true); // Keep refreshing state
		setSyncStatus("syncing"); // Set sync status to syncing
		console.log(
			">>> _performCloudSync: Set isRefreshing=true, syncStatus=syncing",
		);
		setError(null);
	}

	const syncTimeoutId: NodeJS.Timeout | null = null;
	// Directly use try/catch/finally around the async logic
	try {
		console.log(">>> _performCloudSync: Starting async logic"); // Added Log
		// Start of the async logic (previously IIAFE)
		await _loadArticlesFromCache(
			// Result not used, but function call needed
			isMountedRef.current,
			authResult.isSignedIn,
			userId,
			() => {}, // Dummy setter, state updated later
		);

		console.log(">>> _performCloudSync: Getting token..."); // Added Log
		const token = await authResult.getToken();
		console.log(">>> _performCloudSync: Got token:", token ? "Exists" : "NULL"); // Added Log
		const userEmail = userResult.user?.primaryEmailAddress?.emailAddress;

		if (!token) {
			const authError = new Error("Authentication token missing, cannot sync.");
			// Set error state immediately for the test to catch it more reliably
			// setError(authError); // Moved setting error to the main catch block
			throw authError;
		}

		// Process Queue
		console.log(">>> _performCloudSync: Processing offline queue..."); // Added Log
		const { processedDeletes, processedUpdates, failedOps } =
			await _processOfflineQueue(token);
		console.log(">>> _performCloudSync: Offline queue processed."); // Added Log
		if (failedOps < 0)
			toast({
				title: "Sync Warning",
				description: "Error processing offline changes.",
			});

		// Fetch States
		console.log("Sync: Fetching local & cloud articles...");
		console.log(
			">>> _performCloudSync: Fetching local/cloud data (Promise.all)...",
		); // Added Log
		const [allLocalDocs, cloudArticlesRaw] = await Promise.all([
			getAllArticles({ userIds: [userId], includeDeleted: true }),
			fetchCloudItems(token, userEmail),
		]);
		// --- Proposed Log ---
		console.log(
			">>> _performCloudSync: Raw Cloud Data Received:",
			JSON.stringify(cloudArticlesRaw, null, 2),
		);
		// --- End Proposed Log ---
		console.log(">>> _performCloudSync: Local/cloud data fetched."); // Added Log
		const localArticlesMap = new Map(allLocalDocs.map((doc) => [doc._id, doc]));
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
			if (!article?._id || !article.title || !article.url || !article.content) {
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
							console.log(`Sync: Re-attempting cloud delete for ${cloudId}`);
							const delStatus = await deleteItemFromCloud(cloudId, token).catch(
								(e) => {
									console.error(e);
									return "error";
								},
							);
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
				console.log(`Sync: Cloud deleted ${localId}. Soft deleting locally.`);
				toSoftDeleteLocally.push(localId);
			}
		}

		// Apply Changes
		console.log(
			`Sync: Applying changes - Create: ${toCreateLocally.length}, Update: ${toUpdateLocally.length}, SoftDel: ${toSoftDeleteLocally.length}, HardDel: ${cloudDeletesToHardDeleteLocally.length}, QueueCloud: ${toUpdateCloudQueue.length}`,
		);
		console.log(
			">>> _performCloudSync: Applying local changes (Promise.all)...",
		); // Added Log
		const saveOps = [...toCreateLocally, ...toUpdateLocally];
		const hardDeleteOps = cloudDeletesToHardDeleteLocally.map((doc) => ({
			_id: doc._id,
			_rev: doc._rev,
			_deleted: true,
		}));
		const localOpsPromises: Promise<any>[] = []; // Explicitly type
		let bulkSaveResult: (PouchDB.Core.Response | PouchDB.Core.Error)[] | null =
			null; // Variable to hold the result

		if (saveOps.length > 0) {
			const bulkSavePromise = bulkSaveArticles(saveOps)
				.then((res) => {
					bulkSaveResult = res; // Store result on success
					return res; // Pass through for Promise.all
				})
				.catch((err) => {
					console.error("Local Save Error:", err);
					// Decide how to handle error, maybe return empty array or rethrow?
					// For now, let Promise.all catch it if needed, but log here.
					return []; // Return empty array on error to fulfill promise type for Promise.all
				});
			localOpsPromises.push(bulkSavePromise);
		}
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

		// Await all local operations *including* the save operation
		await Promise.all(localOpsPromises);

		// Note: bulkSaveResult is now populated if saveOps ran and succeeded

		console.log(">>> _performCloudSync: Local changes applied."); // Added Log

		// Update UI State only if mounted
		if (isMountedRef.current) {
			console.log("Sync: Refetching final state for UI...");
			console.log(">>> _performCloudSync: Refetching final UI state..."); // Added Log
			const finalLocalArticles = await getAllArticles({
				userIds: [userId],
			});

			// Create a map of recently saved/updated articles from bulkSaveResult
			const savedArticlesMap = new Map<string, Article>();
			if (bulkSaveResult) {
				// Type guard should narrow from '...[] | null' to '...[]'
				// Explicitly cast and use a proper type guard function
				const results = bulkSaveResult as (
					| PouchDB.Core.Response
					| PouchDB.Core.Error
				)[];
				// Refined type guard to explicitly check for properties distinguishing Response from Error
				const isSuccessResponse = (
					r: PouchDB.Core.Response | PouchDB.Core.Error,
				): r is PouchDB.Core.Response =>
					r !== null &&
					typeof r === "object" &&
					"ok" in r &&
					r.ok === true &&
					"id" in r &&
					typeof r.id === "string" &&
					"rev" in r &&
					typeof r.rev === "string";
				const successfulIds = new Set(
					results
						.filter(isSuccessResponse)
						.map((r) => r.id), // Map already uses the narrowed type
				);
				const originalSuccessfulDocs = saveOps.filter(
					(doc) => doc._id && successfulIds.has(doc._id),
				); // Ensure doc._id exists

				// Map the original docs with their latest rev from the result
				for (const result of results) {
					// Use the type guard again for clarity and safety within the loop
					if (isSuccessResponse(result)) {
						// Now 'result' is narrowed to PouchDB.Core.Response
						const originalDoc = originalSuccessfulDocs.find(
							(doc) => doc._id === result.id,
						);
						if (originalDoc) {
							// Reconstruct the Article object with the latest rev (result.id is now guaranteed string)
							savedArticlesMap.set(result.id, {
								...originalDoc,
								_id: result.id,
								_rev: result.rev,
								// Ensure other potentially missing fields from Omit<...> have defaults
								savedAt: originalDoc.savedAt || Date.now(),
								isRead: originalDoc.isRead ?? false,
								favorite: originalDoc.favorite ?? false,
								tags: originalDoc.tags || [],
								type: originalDoc.type || "article",
								version: originalDoc.version || 1, // Assume version 1 if missing
								category: originalDoc.category || "other", // Provide default
								content: originalDoc.content || "", // Provide default
								url: originalDoc.url || "", // Provide default
								title: originalDoc.title || "", // Provide default
							} as Article); // Assert as Article type
						}
					}
				}
			}

			// Merge results: Prioritize freshly saved/updated articles from bulkSaveResult
			const mergedArticles = finalLocalArticles.map((article) => {
				return savedArticlesMap.get(article._id) || article; // Use saved version if available
			});

			// Apply hiding filter to the merged list
			const articlesToSet = mergedArticles.filter(
				(doc) => !hidingArticleIds.has(doc._id),
			);
			setArticles(articlesToSet);
			setError(null); // Clear error on success
			setSyncStatus("success"); // Set status to success
			// Set refreshing false here after successful UI update
			setIsRefreshing(false);
			console.log(
				">>> _performCloudSync: Set syncStatus=success, isRefreshing=false",
			);
		}
		console.log(">>> _performCloudSync: Refetched final UI state."); // Added Log
		console.log("Sync: Reconciliation complete.");
		// Resolve is no longer needed as we are not using explicit Promise constructor
	} catch (syncErr) {
		// This catch block now directly catches errors from the async logic
		console.log(
			">>> _performCloudSync: CAUGHT ERROR in outer catch block",
			syncErr,
		); // Added Log
		console.error("Sync: Top-level error caught:", syncErr);
		const error =
			syncErr instanceof Error ? syncErr : new Error("Failed to sync articles");
		setError(error); // Set error state
		setIsRefreshing(false); // Ensure refreshing is off
		setSyncStatus("offline"); // Set status to offline
		console.log(
			">>> _performCloudSync: CAUGHT ERROR - Set syncStatus=offline, isRefreshing=false",
		);

		// Attempt to load local data explicitly on sync failure
		try {
			console.log(
				">>> _performCloudSync: Attempting local data load after sync fail...",
			);
			const localArticles = await getAllArticles({ userIds: [userId] }); // Fetch non-deleted local articles
			if (isMountedRef.current) {
				const articlesToSet = localArticles.filter(
					(doc) => !hidingArticleIds.has(doc._id),
				);
				setArticles(articlesToSet); // Update UI with local data
				console.log(
					`>>> _performCloudSync: Loaded ${articlesToSet.length} local articles after sync fail.`,
				);
			}
		} catch (localLoadError) {
			console.error(
				">>> _performCloudSync: Failed to load local articles after sync error:",
				localLoadError,
			);
			// Potentially set a more specific error or leave the main sync error
		}

		// Only toast if mounted
		if (isMountedRef.current) {
			toast({
				title: "Cloud Sync Failed",
				description: `${error.message}. Displaying local data.`, // Updated message slightly
				variant: "destructive",
			});
		}
		// Don't re-throw here, let finally handle cleanup
	} finally {
		// Final cleanup
		console.log(">>> _performCloudSync: Entering FINALLY block"); // Added Log
		console.log(
			`>>> _performCloudSync: FINALLY - isMounted: ${isMountedRef.current}, fetchLock: ${fetchLockRef.current}`,
		); // Added Log
		if (syncTimeoutId) clearTimeout(syncTimeoutId);
		// Ensure refreshing is false in finally if it was true, using the passed state value
		if (isMountedRef.current && isRefreshing) {
			// Check the passed 'isRefreshing' value from params
			console.log(
				">>> _performCloudSync: FINALLY - Setting isRefreshing = false (was true)",
			);
			setIsRefreshing(false); // Use the setter
		}
		fetchLockRef.current = false; // Ensure lock is released
		console.log(">>> _performCloudSync: FINALLY - Lock released"); // Added Log
		console.log("Sync: Process finished.");
		console.log(">>> _performCloudSync: END"); // Added Log
	}

	// Timeout handling needs to be managed differently without the Promise wrapper
	// We'll rely on the finally block for cleanup for now.
	// If timeouts are critical, a different approach like AbortController might be needed.
	// Removed timeout logic for simplicity in this refactor.
	// syncTimeoutId = setTimeout(() => { ... }, 30000);
}

// --- Main Hook ---
export function useArticleSync(
	isInitialized: boolean,
	hidingArticleIds: Set<string>,
) {
	const [articles, setArticles] = useState<Article[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true); // Manages initial load state
	const [isRefreshing, setIsRefreshing] = useState<boolean>(false); // Manages sync/refresh state
	const [syncStatus, setSyncStatus] = useState<
		"idle" | "syncing" | "success" | "offline"
	>("idle"); // Tracks sync status
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
				isRefreshing, // Pass current state value
				setIsRefreshing,
				setError,
				setSyncStatus,
				fetchLockRef,
				hidingArticleIds,
			);
		}
	}, [syncTrigger, auth, userResult, toast, hidingArticleIds, isRefreshing]); // Removed stable setters

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
			isRefreshing, // Pass current state value
			setIsRefreshing,
			setError,
			setSyncStatus,
			fetchLockRef,
			hidingArticleIds,
		);
		return articles; // Return current state, UI updates via setters
	}, [
		isInitialized,
		auth,
		userResult,
		toast,
		articles,
		hidingArticleIds,
		isRefreshing,
	]); // Removed stable setters

	// --- Retry Function ---
	const retryLoading = useCallback(() => {
		console.log("Retry Triggered");
		if (fetchLockRef.current) return; // Don't retry if already syncing/refreshing
		setError(null);
		// Reset loading state and sync status, then trigger initial load/sync sequence
		setSyncStatus("idle");
		setIsLoading(true); // Set loading true to re-trigger initial load effect
	}, []); // Ensure fetchLockRef is not needed as dependency

	// Memoize the returned object
	const returnedValue = useMemo(
		() => ({
			articles,
			isLoading,
			isRefreshing,
			syncStatus, // Add syncStatus here
			error,
			refreshArticles,
			retryLoading,
		}),
		[
			articles,
			isLoading,
			isRefreshing,
			syncStatus,
			error,
			refreshArticles,
			retryLoading,
		], // Add syncStatus to dependency array
	);

	return returnedValue;
}
