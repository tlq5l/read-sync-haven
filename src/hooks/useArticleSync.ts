import { useToast } from "@/hooks/use-toast";
// Import necessary functions and types
import {
	// CloudSyncStatus, // Removed unused import
	deleteItemFromCloud,
	fetchCloudItems,
	saveItemToCloud,
} from "@/services/cloudSync";
import {
	type Article,
	type QueuedOperation, // Added
	articlesDb, // Need direct access for hard delete
	bulkSaveArticles,
	getAllArticles,
	deleteArticle as localSoftDeleteArticle, // Renamed for clarity
	operationsQueueDb, // Added
} from "@/services/db";
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
	// Removed unused parameters setIsLoading, setIsRefreshing
): Promise<boolean> {
	if (!isSignedIn || !userId) return false;

	try {
		console.log(
			`Sync Hook: Attempting to load articles from cache for user ${userId}...`,
		);
		// Default getAllArticles fetches non-deleted items, which is correct for initial load
		const cachedArticles = await getAllArticles({ userIds: [userId] });

		if (isMounted && cachedArticles && cachedArticles.length > 0) {
			console.log(
				`Sync Hook: Loaded ${cachedArticles.length} articles from cache.`,
			);
			const dedupedArticles = deduplicateArticlesById(cachedArticles);
			if (dedupedArticles.length < cachedArticles.length) {
				console.log(
					`Sync Hook: Removed ${cachedArticles.length - dedupedArticles.length} duplicate articles from cache.`,
				);
			}
			const sortedArticles = [...dedupedArticles].sort(
				(a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0),
			);
			setArticles(sortedArticles);
			return true; // Loaded from cache
		}
		// Note: Removed setting isLoading/isRefreshing from this function
		if (isMounted) {
			console.log(
				"Sync Hook: No articles found in cache or component unmounted.",
			);
			setArticles([]); // Clear articles if cache is empty
		}
	} catch (cacheErr) {
		console.error("Sync Hook: Error loading articles from cache:", cacheErr);
		// Note: Removed setting isLoading/isRefreshing from this function
		if (isMounted) {
			setArticles([]); // Clear articles on cache error
		}
	}
	return false; // Not loaded from cache or error occurred
}

// --- Processes the offline operations queue ---
async function _processOfflineQueue(token: string): Promise<{
	// Add token parameter
	processedDeletes: Set<string>;
	processedUpdates: Set<string>;
	failedOps: number;
}> {
	console.log("Sync Hook: Processing offline queue...");
	let failedOps = 0;
	const processedDeletes = new Set<string>();
	const processedUpdates = new Set<string>(); // Track IDs of articles updated via queue

	try {
		const queueResult = await operationsQueueDb.allDocs<QueuedOperation>({
			include_docs: true,
			limit: 50, // Process in batches to avoid overwhelming resources
		});

		if (queueResult.rows.length === 0) {
			console.log("Sync Hook: Offline queue is empty.");
			return { processedDeletes, processedUpdates, failedOps };
		}

		console.log(
			`Sync Hook: Found ${queueResult.rows.length} items in offline queue.`,
		);

		const opsToRemove: QueuedOperation[] = [];
		const opsToUpdate: QueuedOperation[] = []; // For retry count update

		for (const row of queueResult.rows) {
			if (!row.doc) continue;
			const op = row.doc;

			try {
				let success = false;
				if (op.type === "delete") {
					console.log(`Sync Hook: Processing queued delete for ${op.docId}`);
					const deleteStatus = await deleteItemFromCloud(op.docId, token); // Pass token
					// Consider 404 (not_found) as success for deletes, as the item is gone
					if (deleteStatus === "success" || deleteStatus === "not_found") {
						success = true;
						processedDeletes.add(op.docId);
						console.log(`Sync Hook: Queued delete successful for ${op.docId}`);
					} else {
						console.warn(
							`Sync Hook: Queued delete failed for ${op.docId}, status: ${deleteStatus}`,
						);
					}
				} else if (op.type === "update" && op.data) {
					// Fetch the full latest LOCAL version to send to cloud, ensure it hasn't been deleted since queuing
					const latestLocal = await articlesDb.get(op.docId).catch(() => null);
					if (latestLocal && !latestLocal.deletedAt) {
						console.log(`Sync Hook: Processing queued update for ${op.docId}`);
						// Send the LATEST local state, not potentially stale op.data
						const updateStatus = await saveItemToCloud(latestLocal, token); // Pass token
						if (updateStatus === "success") {
							success = true;
							processedUpdates.add(op.docId);
							console.log(
								`Sync Hook: Queued update successful for ${op.docId}`,
							);
						} else {
							console.warn(
								`Sync Hook: Queued update failed for ${op.docId}, status: ${updateStatus}`,
							);
						}
					} else {
						console.log(
							`Sync Hook: Skipping queued update for ${op.docId} as it no longer exists locally or is deleted.`,
						);
						// Treat as success to remove from queue, as the update is irrelevant now
						success = true;
					}
				}

				if (success) {
					opsToRemove.push(op);
				} else {
					// Handle failure - increment retry count
					op.retryCount = (op.retryCount || 0) + 1;
					if (op.retryCount <= 5) {
						// Max 5 retries
						opsToUpdate.push(op);
					} else {
						console.error(
							`Sync Hook: Max retries reached for operation ${op._id} (${op.type} ${op.docId}). Removing from queue.`,
						);
						opsToRemove.push(op); // Remove after max retries
						failedOps++;
					}
				}
			} catch (opError) {
				console.error(
					`Sync Hook: Error processing queue item ${op._id}:`,
					opError,
				);
				failedOps++;
				// Increment retry count on error too
				op.retryCount = (op.retryCount || 0) + 1;
				if (op.retryCount <= 5) {
					opsToUpdate.push(op);
				} else {
					console.error(
						`Sync Hook: Max retries reached for operation ${op._id} due to error. Removing from queue.`,
					);
					opsToRemove.push(op);
				}
			}
		}

		// Bulk remove successfully processed/failed-max-retry ops
		if (opsToRemove.length > 0) {
			const removeDocs = opsToRemove.map((op) => ({ ...op, _deleted: true }));
			await operationsQueueDb.bulkDocs(removeDocs);
			console.log(
				`Sync Hook: Removed ${opsToRemove.length} operations from queue.`,
			);
		}

		// Bulk update retry counts for failed ops still within retry limit
		if (opsToUpdate.length > 0) {
			await operationsQueueDb.bulkDocs(opsToUpdate);
			console.log(
				`Sync Hook: Updated retry count for ${opsToUpdate.length} operations.`,
			);
		}
	} catch (queueError) {
		console.error(
			"Sync Hook: Error accessing or processing offline queue:",
			queueError,
		);
		// Decide how to handle - maybe proceed with sync but flag queue error?
		// For now, log and continue, but offline changes might be stuck.
		failedOps = -1; // Indicate a general queue processing failure
	}
	console.log(
		`Sync Hook: Offline queue processing finished. Failed ops: ${failedOps > 0 ? failedOps : "0"}.`,
	);
	return { processedDeletes, processedUpdates, failedOps };
}

// Performs synchronization with the cloud - *Rewritten Logic*
async function _performCloudSync(
	isMounted: boolean,
	loadedFromCache: boolean, // Keep this parameter, might be useful
	isSignedIn: boolean | null | undefined,
	userId: string | null | undefined,
	getToken: () => Promise<string | null>,
	user:
		| { primaryEmailAddress?: { emailAddress?: string | null } | null }
		| null
		| undefined,
	toast: (props: any) => void,
	setArticles: React.Dispatch<React.SetStateAction<Article[]>>,
	setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
	setIsRefreshing: React.Dispatch<React.SetStateAction<boolean>>,
	setError: React.Dispatch<React.SetStateAction<Error | null>>,
	fetchLockRef: React.MutableRefObject<boolean>, // Pass ref to manage lock
	hidingArticleIds: Set<string>, // Add hidingArticleIds parameter
) {
	if (!isSignedIn || !userId) return;

	// Initial loading state management (similar to before)
	if (!loadedFromCache && isMounted) {
		setIsLoading(true);
		setIsRefreshing(false);
	} else if (isMounted) {
		// If loaded from cache, start in refreshing state
		setIsLoading(false);
		setIsRefreshing(true);
	}

	// Timeout remains useful
	let syncTimeoutId: NodeJS.Timeout | null = null;
	let syncInProgress = true;
	syncTimeoutId = setTimeout(() => {
		if (isMounted && syncInProgress) {
			console.warn("Sync Hook: Cloud sync timed out");
			setIsRefreshing(false);
			fetchLockRef.current = false;
			const timeoutError = new Error(
				"Syncing articles timed out. Displaying cached data.",
			);
			setError(timeoutError);
			toast({
				title: "Sync Timeout",
				description: timeoutError.message,
				variant: "default",
			});
		}
	}, 30000); // Increased timeout to 30s for more complex sync

	try {
		console.log("Sync Hook: Starting enhanced sync with reconciliation...");
		const token = await getToken(); // Moved token fetch earlier
		const userEmail = user?.primaryEmailAddress?.emailAddress;

		// Initialize queue results defaults
		let processedDeletes = new Set<string>();
		let processedUpdates = new Set<string>();
		let failedOps = 0;

		// === 1. Process Offline Queue (Conditionally) ===
		if (!token) {
			console.error(
				"Sync Hook: Cannot process offline queue, authentication token is missing.",
			);
			// Skip queue processing if no token
			toast({
				title: "Sync Warning",
				description:
					"Could not process offline changes: Authentication missing.",
				variant: "default",
			});
			// Setting failedOps to indicate skip might be useful, but not strictly necessary
			// failedOps = -1; // Or some other indicator if needed downstream
		} else {
			console.log("Sync Hook: Processing offline queue with token...");
			// Call queue processor ONLY if token exists
			const queueResult = await _processOfflineQueue(token); // Pass token
			processedDeletes = queueResult.processedDeletes;
			processedUpdates = queueResult.processedUpdates;
			failedOps = queueResult.failedOps;
			if (failedOps < 0) {
				// General queue processing error from within _processOfflineQueue
				toast({
					title: "Sync Warning",
					description: "Error processing offline changes.", // Simplified message
					variant: "default",
				});
			}
		}
		// Continue sync logic regardless of queue processing success/skip,
		// unless no token is a fatal error for the whole sync.

		// Ensure token is still valid for subsequent operations
		if (!token) {
			console.error(
				"Sync Hook: Cannot proceed with cloud fetch, token missing.",
			);
			throw new Error("Authentication token missing, cannot sync."); // Make it fatal here
		}

		// === 2. Fetch Current States ===
		console.log("Sync Hook: Fetching local articles (including deleted)...");
		const allLocalDocs = await getAllArticles({
			userIds: [userId],
			includeDeleted: true,
		});
		const localArticlesMap = new Map(allLocalDocs.map((doc) => [doc._id, doc]));
		console.log(
			`Sync Hook: Fetched ${localArticlesMap.size} total local articles.`,
		);

		console.log("Sync Hook: Fetching cloud articles...");
		const cloudArticlesRaw = await fetchCloudItems(token, userEmail);
		// Ensure cloud articles have userId and initial version if missing
		const cloudArticles = cloudArticlesRaw.map((a) => ({
			...a,
			userId: a.userId ?? userId,
			version: a.version || 1,
		}));
		const cloudArticlesMap = new Map(
			cloudArticles.map((doc) => [doc._id, doc]),
		);
		console.log(`Sync Hook: Fetched ${cloudArticlesMap.size} cloud articles.`);

		// === 3. Reconcile States ===
		console.log("Sync Hook: Reconciling local and cloud states...");
		const toCreateLocally: Article[] = [];
		const toUpdateLocally: Article[] = [];
		const toSoftDeleteLocally: string[] = []; // Store IDs to soft delete
		const cloudDeletesToHardDeleteLocally: Article[] = []; // Store full doc for remove(id, rev)
		const toUpdateCloudQueue: QueuedOperation[] = []; // Queue updates for cloud

		// Helper to validate essential fields from cloud data
		const isValidCloudArticle = (
			article: Article | null | undefined,
		): article is Article => {
			if (!article?._id || !article.title || !article.url || !article.content) {
				console.warn(
					`Sync Hook: Invalid or incomplete article data received from cloud for ID: ${article?._id || "UNKNOWN"}. Skipping.`,
					article, // Log the problematic article data
				);
				return false;
			}
			return true;
		};

		// --- Iterate Cloud Articles (Check for Creates/Updates) ---
		for (const [cloudId, cloudArticle] of cloudArticlesMap.entries()) {
			const localArticle = localArticlesMap.get(cloudId);

			if (!localArticle) {
				// Cloud Create => Create Locally
				console.log(`Sync Hook: Cloud Create detected for ${cloudId}`);
				if (isValidCloudArticle(cloudArticle)) {
					toCreateLocally.push(cloudArticle);
				}
			} else {
				// Exists locally, check for updates / conflicts / undeletes
				const localVersion = localArticle.version || 0;
				const cloudVersion = cloudArticle.version || 0; // Should default to 1

				if (localArticle.deletedAt) {
					// Locally deleted, but exists in cloud.
					// If cloud version is newer, it's an undelete/update from another client.
					if (cloudVersion > localVersion) {
						console.log(
							`Sync Hook: Cloud Undelete/Update detected for ${cloudId} (CloudV: ${cloudVersion}, LocalV: ${localVersion})`,
						);
						// Treat as an update - will overwrite local soft delete marker
						// Revert: PouchDB generally NEEDS the _rev to update a specific document version,
						// even if overwriting a deletion marker.
						if (isValidCloudArticle(cloudArticle)) {
							toUpdateLocally.push({
								...cloudArticle,
								_rev: localArticle._rev,
							});
						}
					} else {
						// Local delete is newer or same version. Should have been deleted by queue processing.
						// If it wasn't (e.g., queue failed), try deleting from cloud again.
						if (!processedDeletes.has(cloudId)) {
							console.log(
								`Sync Hook: Re-attempting cloud delete for locally deleted ${cloudId}`,
							);
							try {
								const delStatus = await deleteItemFromCloud(cloudId, token); // Pass token
								if (delStatus === "success" || delStatus === "not_found") {
									cloudDeletesToHardDeleteLocally.push(localArticle); // Mark for local cleanup
								} else {
									console.warn(
										`Sync Hook: Re-attempted cloud delete failed for ${cloudId}`,
									);
								}
							} catch (delErr) {
								console.error(
									`Sync Hook: Error re-attempting cloud delete for ${cloudId}`,
									delErr,
								);
							}
						} else {
							// Already processed by queue, ensure local hard delete happens
							cloudDeletesToHardDeleteLocally.push(localArticle);
						}
					}
				} else {
					// Exists locally, not deleted. Check versions for updates.
					if (cloudVersion > localVersion) {
						// Cloud Update => Update Locally
						console.log(
							`Sync Hook: Cloud Update detected for ${cloudId} (CloudV: ${cloudVersion}, LocalV: ${localVersion})`,
						);
						if (isValidCloudArticle(cloudArticle)) {
							toUpdateLocally.push({
								...cloudArticle,
								_rev: localArticle._rev,
							}); // Need _rev
						}
					} else if (localVersion > cloudVersion) {
						// Local Update => Queue Cloud Update (if not already processed by queue)
						if (!processedUpdates.has(cloudId)) {
							console.log(
								`Sync Hook: Local Update detected for ${cloudId} (LocalV: ${localVersion}, CloudV: ${cloudVersion}). Queuing cloud update.`,
							);
							const queueOp: QueuedOperation = {
								_id: `queue_update_${localArticle._id}_${Date.now()}`,
								type: "update",
								docId: localArticle._id,
								timestamp: Date.now(),
								retryCount: 0,
								data: localArticle, // Send full local state
							};
							toUpdateCloudQueue.push(queueOp);
						} else {
							console.log(
								`Sync Hook: Local Update for ${cloudId} already processed by queue.`,
							);
						}
					}
					// If versions are equal, do nothing
				}
			}
			// Remove processed entry from local map to find remaining local-only items later
			localArticlesMap.delete(cloudId);
		}

		// --- Iterate Remaining Local Articles (Check for Cloud Deletes / Unsynced Local Creates) ---
		for (const [localId, localArticle] of localArticlesMap.entries()) {
			if (localArticle.deletedAt) {
				// This was soft-deleted locally, and didn't exist in cloud (or cloud delete won).
				// Ensure it gets hard deleted locally if queue processing succeeded.
				if (processedDeletes.has(localId)) {
					cloudDeletesToHardDeleteLocally.push(localArticle);
				} else {
					// Still soft-deleted locally, queue didn't process or failed. Leave it.
					console.log(
						`Sync Hook: Local soft-delete for ${localId} remains (queue unprocessed/failed).`,
					);
				}
			} else {
				// Exists locally (not deleted), but wasn't in cloud map.
				// This means it was deleted on another client/cloud. Soft delete locally.
				console.log(
					`Sync Hook: Cloud Delete detected for ${localId}. Soft deleting locally.`,
				);
				toSoftDeleteLocally.push(localId);
			}
		}

		// === 4. Apply Changes ===

		// Perform local creates/updates
		const articlesToSave = [...toCreateLocally, ...toUpdateLocally];
		if (articlesToSave.length > 0) {
			console.log(
				`Sync Hook: Saving ${toCreateLocally.length} creates and ${toUpdateLocally.length} updates locally...`,
			);
			try {
				const bulkResponse = await bulkSaveArticles(articlesToSave);
				const errors = bulkResponse.filter(
					(r): r is PouchDB.Core.Error => "error" in r,
				);
				if (errors.length > 0) {
					const errorDetails = errors.map((e) => ({
						id: e.id,
						message: e.message,
						name: e.name,
						status: e.status,
					}));
					console.warn(
						`Sync Hook: ${errors.length} errors during local bulk save:`,
						errorDetails, // Log specific error details including IDs
					);
				}
			} catch (bulkErr) {
				console.error(
					"Sync Hook: Critical error during local bulk save:",
					bulkErr,
				);
				// Decide how to proceed - maybe throw?
			}
		}

		// Perform local soft deletes for items deleted in cloud
		if (toSoftDeleteLocally.length > 0) {
			console.log(
				`Sync Hook: Soft deleting ${toSoftDeleteLocally.length} articles locally (deleted in cloud)...`,
			);
			for (const id of toSoftDeleteLocally) {
				try {
					// Use the localSoftDeleteArticle function which handles versioning etc.
					await localSoftDeleteArticle(id);
				} catch (softDelErr) {
					console.error(
						`Sync Hook: Failed to soft delete ${id} locally:`,
						softDelErr,
					);
				}
			}
		}

		// Perform local hard deletes for items successfully deleted from cloud via queue or sync
		if (cloudDeletesToHardDeleteLocally.length > 0) {
			console.log(
				`Sync Hook: Hard deleting ${cloudDeletesToHardDeleteLocally.length} articles locally (deleted from cloud)...`,
			);

			const docsToRemove = cloudDeletesToHardDeleteLocally.map((doc) => ({
				_id: doc._id,
				_rev: doc._rev, // Need _rev for hard delete
				_deleted: true, // Use PouchDB hard delete mechanism
			}));
			try {
				// Cast to any[] to satisfy bulkDocs type for deletions
				await articlesDb.bulkDocs(docsToRemove as any[]);
			} catch (hardDelError) {
				console.error(
					"Sync Hook: Error during local hard delete:",
					hardDelError,
				);
			}
		}

		// Queue cloud updates for items updated locally
		if (toUpdateCloudQueue.length > 0) {
			console.log(
				`Sync Hook: Queuing ${toUpdateCloudQueue.length} updates for cloud...`,
			);
			try {
				await operationsQueueDb.bulkDocs(toUpdateCloudQueue);
			} catch (queueErr) {
				console.error("Sync Hook: Failed to queue cloud updates:", queueErr);
			}
		}

		// === 5. Update UI State ===
		// Only update UI if there were actual changes or this is the initial load
		if (
			toCreateLocally.length > 0 ||
			toUpdateLocally.length > 0 ||
			toSoftDeleteLocally.length > 0 ||
			cloudDeletesToHardDeleteLocally.length > 0 ||
			!loadedFromCache
		) {
			// Update state if changes occurred or initial load
			console.log(
				"Sync Hook: Refetching non-deleted articles for UI update...",
			);
			const finalLocalArticles = await getAllArticles({ userIds: [userId] }); // Default fetches non-deleted
			console.log(
				`Sync Hook: Fetched ${finalLocalArticles.length} final articles for UI.`,
			);

			// Filter out articles being optimistically hidden *before* setting state
			const articlesToSet = finalLocalArticles.filter(
				(doc) => !hidingArticleIds.has(doc._id),
			);
			if (articlesToSet.length < finalLocalArticles.length) {
				console.log(
					`Sync Hook: Filtered out ${finalLocalArticles.length - articlesToSet.length} articles currently hidden optimistically before setting state.`,
				);
			}

			if (isMounted) {
				setArticles(articlesToSet); // Set the filtered list
				setError(null); // Clear error on successful sync
			}
		}
	} catch (syncErr) {
		console.error("Sync Hook: Top-level error during sync:", syncErr);
		if (isMounted) {
			const error =
				syncErr instanceof Error
					? syncErr
					: new Error("Failed to sync articles");
			// Only set error if not already loaded from cache, otherwise show toast but keep cached data
			if (!loadedFromCache) {
				setError(error);
				setArticles([]); // Clear articles if initial load failed
			}
			toast({
				title: "Cloud Sync Failed",
				description: `${error.message}. Displaying local data if available.`,
				variant: "destructive",
			});
		}
	} finally {
		syncInProgress = false;
		if (syncTimeoutId) clearTimeout(syncTimeoutId);
		if (isMounted) {
			setIsLoading(false);
			setIsRefreshing(false);
		}
		console.log("Sync Hook: Sync process finished.");
	}
}

// --- Main Hook ---
// Add hidingArticleIds as parameter

export function useArticleSync(
	isInitialized: boolean,
	hidingArticleIds: Set<string>, // Add parameter to the hook itself
) {
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
			// Call helper without passing unused setters
			return _loadArticlesFromCache(
				isMounted,
				isSignedIn,
				userId,
				setArticles,
				// Removed unused setIsLoading, setIsRefreshing
			);
		},
		[isSignedIn, userId],
	);

	// Unused suppression comment removed
	const performCloudSync = useCallback(
		async (isMounted: boolean, loadedFromCache: boolean) => {
			// Call the refactored _performCloudSync
			await _performCloudSync(
				isMounted,
				loadedFromCache,
				isSignedIn,
				userId,
				getToken,
				user, // Accessed via closure
				toast, // Accessed via closure
				setArticles, // Pass state setters from main hook scope
				setIsLoading,
				setIsRefreshing,
				setError,
				fetchLockRef, // Pass the ref
				hidingArticleIds, // Pass hidingArticleIds down
			);
		},
		[isSignedIn, userId, getToken, user, toast, hidingArticleIds], // Add hidingArticleIds dependency
	);

	// --- Main Load and Sync Effect ---
	// biome-ignore lint/correctness/useExhaustiveDependencies: hidingArticleIds is used indirectly by performCloudSync for filtering
	useEffect(() => {
		let isMounted = true;

		const loadData = async () => {
			if (!isInitialized || !isLoaded) {
				// Simplified initial state setting
				setIsLoading(true);
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
			setError(null); // Clear previous errors on new attempt

			try {
				// Try loading from cache first
				const loadedFromCache = await loadArticlesFromCache(isMounted);

				if (isSignedIn && userId) {
					// Always perform cloud sync after initial load attempt or on refresh trigger
					await performCloudSync(isMounted, loadedFromCache);
				} else if (isMounted) {
					// Not signed in
					setArticles([]);
					setIsLoading(false);
					setIsRefreshing(false);
				}
			} catch (err) {
				console.error("Sync Hook: Unexpected error during loadData:", err);
				if (isMounted) {
					setError(
						err instanceof Error
							? err
							: new Error("An unexpected error occurred"),
					);
					setIsLoading(false);
					setIsRefreshing(false);
					// Don't clear articles if cache loading worked before sync failed
				}
			} finally {
				// isLoading/isRefreshing are managed within performCloudSync now
				// Ensure lock is always released *HERE* (only place)
				fetchLockRef.current = false;
				if (!isMounted) {
					console.log(
						"Sync Hook: Component unmounted during loadData finally block.",
					);
				}
			}
		};

		loadData();

		return () => {
			isMounted = false;
			console.log("Sync Hook: Unmounting main effect.");
		};
	}, [
		isInitialized,
		isLoaded,
		isSignedIn,
		userId,
		loadArticlesFromCache, // Now depends on the stable useCallback reference
		performCloudSync, // Now depends on the stable useCallback reference
		isRefreshing,
		hidingArticleIds, // Add hidingArticleIds dependency to main useEffect
	]);

	// --- Refresh Function ---
	// Re-implement refresh to simply call performCloudSync directly
	const refreshArticles = useCallback(async () => {
		if (!isInitialized || !isLoaded || !isSignedIn || !userId) {
			return articles;
		}

		let isRefreshMounted = true;
		const cleanup = () => {
			isRefreshMounted = false;
		};

		try {
			// Call the standalone sync function directly
			await _performCloudSync(
				isRefreshMounted,
				true,
				isSignedIn,
				userId,
				getToken,
				user,
				toast,
				setArticles,
				setIsLoading,
				setIsRefreshing,
				setError,
				fetchLockRef,
				hidingArticleIds,
			);
			cleanup();
			return articles; // Return state before async call, UI updates via state setters
		} catch (err) {
			// Error handling is within performCloudSync, but catch here just in case
			console.error("Sync Hook: Error in refreshArticles:", err);
			if (isRefreshMounted) {
				setError(err as Error);
			}
			return articles;
		} finally {
			isRefreshMounted = false;
		}
	}, [
		isInitialized,
		isLoaded,
		isSignedIn,
		userId,
		getToken,
		user,
		toast,
		articles, // Added missing dependency
		// setArticles, // State setters are stable
		// setIsLoading, // State setters are stable
		// setIsRefreshing, // State setters are stable
		// setError, // State setters are stable
		// fetchLockRef, // Refs are stable
		hidingArticleIds,
		// No need to depend on performCloudSync useCallback wrapper here, call helper directly
	]);

	// --- Retry Function ---
	// Retry can now simply call refreshArticles
	const retryLoading = useCallback(() => {
		if (fetchLockRef.current) {
			console.log(
				"Sync Hook: Retry/Refresh operation already in progress, skipping",
			);
			return;
		}
		console.log("Sync Hook: Retry loading triggered.");
		// Don't need to set isLoading here, refreshArticles handles states
		setError(null);
		toast({ title: "Retrying", description: "Retrying to sync articles..." });
		refreshArticles(); // Call the refactored refresh function
	}, [refreshArticles, toast]); // Depends on refreshArticles

	return {
		articles,
		isLoading,
		isRefreshing,
		error,
		refreshArticles,
		retryLoading,
	};
}
