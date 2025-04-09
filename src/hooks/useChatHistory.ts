import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

const DB_NAME = "readSyncHavenDB";
const DB_VERSION = 2; // <<< Increment DB version for schema change
const SESSION_STORE_NAME = "chatSessions";
const ARTICLE_ID_INDEX = "articleIdIndex";
// const SESSION_ID_INDEX = "sessionIdIndex"; // Optional index, not currently used

// Keep ChatMessage simple, context provided by session
export interface ChatMessage {
	sender: "user" | "ai";
	content: string;
	timestamp: number; // Unix timestamp (ms)
	// messageId is no longer needed here as primary key
}

// New interface for a chat session stored in DB
export interface ChatSession {
	sessionId: string; // Primary Key (e.g., UUID or initial timestamp)
	articleId: string; // Indexed
	createdAt: number; // Timestamp of session creation
	messages: ChatMessage[]; // Array of messages within this session
	// Optional: Store first message snippet for display?
	firstMessageSnippet?: string;
}

// Metadata for displaying session list without loading all messages
export interface ChatSessionMetadata {
	sessionId: string;
	articleId: string;
	createdAt: number;
	firstMessageSnippet?: string;
	messageCount: number; // Add message count
}

export function useChatHistory(articleId: string | null) {
	const [db, setDb] = useState<IDBDatabase | null>(null);
	// State for session list (metadata only)
	const [sessions, setSessions] = useState<ChatSessionMetadata[]>([]);
	// State for messages of the currently selected session
	const [selectedSessionMessages, setSelectedSessionMessages] = useState<
		ChatMessage[]
	>([]);
	const [selectedSessionId, setSelectedSessionIdState] = useState<
		string | null
	>(null);
	const [isLoadingSessions, setIsLoadingSessions] = useState<boolean>(true);
	const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false); // Separate loading for messages
	const [error, setError] = useState<string | null>(null);

	// --- IndexedDB Initialization ---
	useEffect(() => {
		if (!window.indexedDB) {
			console.error("Your browser doesn't support IndexedDB.");
			setError("IndexedDB is not supported in this browser.");
			setIsLoadingSessions(false);
			return;
		}

		const request: IDBOpenDBRequest = indexedDB.open(DB_NAME, DB_VERSION); // Initialize directly
		let dbInstance: IDBDatabase | null = null;
		setIsLoadingSessions(true);
		setError(null);
		// request = indexedDB.open(DB_NAME, DB_VERSION); // Removed as it's initialized above

		request.onupgradeneeded = (event) => {
			dbInstance = (event.target as IDBOpenDBRequest).result;
			console.log(`Upgrading DB to version ${DB_VERSION}`);

			// Create new store if it doesn't exist
			if (!dbInstance.objectStoreNames.contains(SESSION_STORE_NAME)) {
				const store = dbInstance.createObjectStore(SESSION_STORE_NAME, {
					keyPath: "sessionId",
				});
				store.createIndex(ARTICLE_ID_INDEX, "articleId", { unique: false });
				// Optional: Index for direct session lookup if needed frequently outside article context
				// store.createIndex(SESSION_ID_INDEX, "sessionId", { unique: true });
				console.log(
					`Object store '${SESSION_STORE_NAME}' created with index '${ARTICLE_ID_INDEX}'.`,
				);
			} else {
				// If store exists, ensure indexes are present (for upgrades from v1 if needed, though unlikely with keyPath change)
				const transaction = (event.target as IDBOpenDBRequest).transaction;
				if (transaction) {
					const store = transaction.objectStore(SESSION_STORE_NAME);
					if (!store.indexNames.contains(ARTICLE_ID_INDEX)) {
						store.createIndex(ARTICLE_ID_INDEX, "articleId", { unique: false });
						console.log(
							`Index '${ARTICLE_ID_INDEX}' created on existing store '${SESSION_STORE_NAME}'.`,
						);
					}
				}
			}

			// **Important:** Handle removal/migration of the old 'chatMessages' store if necessary.
			// For simplicity, we'll assume starting fresh. If migration needed, add logic here.
			if (dbInstance.objectStoreNames.contains("chatMessages")) {
				// Example: dbInstance.deleteObjectStore("chatMessages");
				console.log(
					"Old 'chatMessages' store detected (optional: remove/migrate).",
				);
			}
		};

		request.onsuccess = (event) => {
			dbInstance = (event.target as IDBOpenDBRequest).result;
			setDb(dbInstance);
			console.log(`IndexedDB '${DB_NAME}' v${DB_VERSION} opened successfully.`);
			// Fetch sessions automatically when DB is ready (handled by fetchSessions effect)
		};

		request.onerror = (event) => {
			console.error(
				"IndexedDB error:",
				(event.target as IDBOpenDBRequest).error,
			);
			setError(
				`Failed to open IndexedDB: ${(event.target as IDBOpenDBRequest).error?.message}`,
			);
			setIsLoadingSessions(false);
		};

		// Cleanup
		return () => {
			if (dbInstance) {
				dbInstance.close();
				console.log(`IndexedDB '${DB_NAME}' connection closed.`);
				setDb(null);
			}
		};
	}, []); // Run only once on mount

	// --- Fetch Session Metadata ---
	const fetchSessions = useCallback(() => {
		if (!db || !articleId) {
			setSessions([]);
			setIsLoadingSessions(db === null); // Still loading if DB is null
			setSelectedSessionIdState(null); // Reset selection if article changes
			setSelectedSessionMessages([]);
			return;
		}

		setIsLoadingSessions(true);
		setError(null);
		console.log(`Fetching session metadata for articleId: ${articleId}`);

		try {
			const transaction = db.transaction(SESSION_STORE_NAME, "readonly");
			const store = transaction.objectStore(SESSION_STORE_NAME);
			const index = store.index(ARTICLE_ID_INDEX);
			const request = index.openCursor(articleId); // Use cursor to get metadata efficiently
			const results: ChatSessionMetadata[] = [];

			request.onsuccess = (event) => {
				const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
				if (cursor) {
					// Extract only metadata, not the large 'messages' array
					const {
						sessionId,
						articleId: artId,
						createdAt,
						firstMessageSnippet,
						messages,
					} = cursor.value as ChatSession;
					results.push({
						sessionId,
						articleId: artId,
						createdAt,
						firstMessageSnippet,
						messageCount: messages?.length ?? 0,
					});
					cursor.continue();
				} else {
					// Sort sessions by creation time, newest first
					results.sort((a, b) => b.createdAt - a.createdAt);
					console.log(`Fetched ${results.length} session metadata items.`);
					setSessions(results);
					setIsLoadingSessions(false);
					// Automatically select the latest session if none is selected? Or require user click?
					// Let's require user click for now.
					// if (!selectedSessionId && results.length > 0) {
					//     setSelectedSessionIdState(results[0].sessionId);
					// }
				}
			};

			request.onerror = (event) => {
				console.error(
					"Error fetching session metadata:",
					(event.target as IDBRequest).error,
				);
				setError(
					`Failed to fetch session metadata: ${(event.target as IDBRequest).error?.message}`,
				);
				setIsLoadingSessions(false);
			};

			transaction.onerror = (event) => {
				console.error(
					"Session fetch transaction error:",
					(event.target as IDBTransaction).error,
				);
				setError(
					`Session fetch transaction failed: ${(event.target as IDBTransaction).error?.message}`,
				);
				setIsLoadingSessions(false);
			};
		} catch (err) {
			console.error("Error initiating session fetch transaction:", err);
			setError(
				err instanceof Error ? err.message : "Unknown error fetching sessions",
			);
			setIsLoadingSessions(false);
		}
	}, [db, articleId]); // Re-fetch if db or articleId changes

	// Effect to fetch sessions when DB/articleId changes
	useEffect(() => {
		fetchSessions();
	}, [fetchSessions]);

	// --- Fetch Messages for Selected Session ---
	const fetchSessionMessages = useCallback(
		(sessionId: string | null) => {
			if (!db || !sessionId) {
				setSelectedSessionMessages([]);
				setIsLoadingMessages(false);
				return;
			}

			setIsLoadingMessages(true);
			setError(null);
			console.log(`Fetching messages for sessionId: ${sessionId}`);

			try {
				const transaction = db.transaction(SESSION_STORE_NAME, "readonly");
				const store = transaction.objectStore(SESSION_STORE_NAME);
				const request = store.get(sessionId);

				request.onsuccess = (event) => {
					const result = (event.target as IDBRequest<ChatSession>).result;
					if (result?.messages) {
						// Use optional chaining
						// Sort messages just in case they weren't stored sorted (should be though)
						result.messages.sort((a, b) => a.timestamp - b.timestamp);
						console.log(
							`Fetched ${result.messages.length} messages for session ${sessionId}.`,
						);
						setSelectedSessionMessages(result.messages);
					} else {
						console.warn(`Session ${sessionId} not found or has no messages.`);
						setSelectedSessionMessages([]);
						// Optionally clear selectedSessionId if session not found?
						// setSelectedSessionIdState(null);
					}
					setIsLoadingMessages(false);
				};

				request.onerror = (event) => {
					console.error(
						"Error fetching session messages:",
						(event.target as IDBRequest).error,
					);
					setError(
						`Failed to fetch session messages: ${(event.target as IDBRequest).error?.message}`,
					);
					setIsLoadingMessages(false);
				};

				transaction.onerror = (event) => {
					console.error(
						"Message fetch transaction error:",
						(event.target as IDBTransaction).error,
					);
					setError(
						`Message fetch transaction failed: ${(event.target as IDBTransaction).error?.message}`,
					);
					setIsLoadingMessages(false);
				};
			} catch (err) {
				console.error("Error initiating message fetch transaction:", err);
				setError(
					err instanceof Error
						? err.message
						: "Unknown error fetching messages",
				);
				setIsLoadingMessages(false);
			}
		},
		[db],
	);

	// Effect to fetch messages when selectedSessionId changes
	useEffect(() => {
		fetchSessionMessages(selectedSessionId);
	}, [selectedSessionId, fetchSessionMessages]);

	// --- Set Selected Session ID ---
	// Renamed state setter to avoid conflict with function name
	const setSelectedSessionId = useCallback((sessionId: string | null) => {
		console.log("Setting selected session ID:", sessionId);
		setSelectedSessionIdState(sessionId);
		if (!sessionId) {
			setSelectedSessionMessages([]); // Clear messages if deselecting
		}
		// Fetching messages is handled by the useEffect watching selectedSessionId
	}, []);

	// --- Create New Session ---
	const createNewSession = useCallback(
		(initialMessage: Omit<ChatMessage, "timestamp">): Promise<string> => {
			return new Promise((resolve, reject) => {
				if (!db || !articleId) {
					return reject(new Error("Database not initialized or no Article ID"));
				}

				const now = Date.now();
				const newSessionId = uuidv4(); // Use UUID for robustness
				const messageWithTimestamp: ChatMessage = {
					...initialMessage,
					timestamp: now,
				};
				const newSession: ChatSession = {
					sessionId: newSessionId,
					articleId: articleId,
					createdAt: now,
					messages: [messageWithTimestamp],
					firstMessageSnippet: messageWithTimestamp.content.substring(0, 50), // Store snippet
				};

				try {
					const transaction = db.transaction(SESSION_STORE_NAME, "readwrite");
					const store = transaction.objectStore(SESSION_STORE_NAME);
					const request = store.add(newSession);

					request.onsuccess = () => {
						console.log("New session created successfully:", newSessionId);
						fetchSessions(); // Re-fetch session list
						setSelectedSessionIdState(newSessionId); // Automatically select the new session
						// setSelectedSessionMessages(newSession.messages); // Update messages directly
						resolve(newSessionId);
					};

					request.onerror = (event) => {
						console.error(
							"Error creating new session:",
							(event.target as IDBRequest).error,
						);
						reject(
							new Error(
								`Failed to create session: ${(event.target as IDBRequest).error?.message}`,
							),
						);
					};

					transaction.onerror = (event) => {
						console.error(
							"Create session transaction error:",
							(event.target as IDBTransaction).error,
						);
						reject(
							new Error(
								`Create session transaction failed: ${(event.target as IDBTransaction).error?.message}`,
							),
						);
					};
				} catch (err) {
					console.error("Error initiating create session transaction:", err);
					reject(
						err instanceof Error
							? err
							: new Error("Unknown error creating session"),
					);
				}
			});
		},
		[db, articleId, fetchSessions],
	);

	// --- Add Message to Existing Session ---
	const addMessageToSession = useCallback(
		(
			sessionId: string,
			newMessage: Omit<ChatMessage, "timestamp">,
		): Promise<void> => {
			return new Promise((resolve, reject) => {
				if (!db) {
					return reject(new Error("Database not initialized"));
				}

				const messageWithTimestamp: ChatMessage = {
					...newMessage,
					timestamp: Date.now(),
				};

				try {
					const transaction = db.transaction(SESSION_STORE_NAME, "readwrite");
					const store = transaction.objectStore(SESSION_STORE_NAME);
					const request = store.get(sessionId); // Get the existing session

					request.onsuccess = (event) => {
						const currentSession = (event.target as IDBRequest<ChatSession>)
							.result;
						if (currentSession) {
							// Add new message and sort
							const updatedMessages = [
								...currentSession.messages,
								messageWithTimestamp,
							];
							updatedMessages.sort((a, b) => a.timestamp - b.timestamp);

							const updatedSession: ChatSession = {
								...currentSession,
								messages: updatedMessages,
							};

							const updateRequest = store.put(updatedSession); // Put the updated session back

							updateRequest.onsuccess = () => {
								console.log(`Message added to session ${sessionId}`);
								// If this is the currently selected session, update its messages in state
								if (selectedSessionId === sessionId) {
									setSelectedSessionMessages(updatedSession.messages);
								}
								// Update message count in metadata (requires re-fetching sessions or updating in place)
								fetchSessions(); // Simple approach: re-fetch session list
								resolve();
							};

							updateRequest.onerror = (event) => {
								console.error(
									"Error updating session:",
									(event.target as IDBRequest).error,
								);
								reject(
									new Error(
										`Failed to update session: ${(event.target as IDBRequest).error?.message}`,
									),
								);
							};
						} else {
							console.error(`Session ${sessionId} not found to add message.`);
							reject(new Error(`Session ${sessionId} not found.`));
						}
					};

					request.onerror = (event) => {
						console.error(
							"Error getting session to add message:",
							(event.target as IDBRequest).error,
						);
						reject(
							new Error(
								`Failed to get session: ${(event.target as IDBRequest).error?.message}`,
							),
						);
					};

					transaction.onerror = (event) => {
						console.error(
							"Add message transaction error:",
							(event.target as IDBTransaction).error,
						);
						reject(
							new Error(
								`Add message transaction failed: ${(event.target as IDBTransaction).error?.message}`,
							),
						);
					};
				} catch (err) {
					console.error("Error initiating add message transaction:", err);
					reject(
						err instanceof Error
							? err
							: new Error("Unknown error adding message"),
					);
				}
			});
		},
		[db, selectedSessionId, fetchSessions], // Include selectedSessionId and fetchSessions
	);

	// --- Delete Session --- Optional but good practice
	const deleteSession = useCallback(
		(sessionIdToDelete: string): Promise<void> => {
			return new Promise((resolve, reject) => {
				if (!db) {
					return reject(new Error("Database not initialized"));
				}

				try {
					const transaction = db.transaction(SESSION_STORE_NAME, "readwrite");
					const store = transaction.objectStore(SESSION_STORE_NAME);
					const request = store.delete(sessionIdToDelete);

					request.onsuccess = () => {
						console.log(`Session ${sessionIdToDelete} deleted successfully.`);
						// If the deleted session was selected, clear selection
						if (selectedSessionId === sessionIdToDelete) {
							setSelectedSessionIdState(null);
							setSelectedSessionMessages([]);
						}
						fetchSessions(); // Re-fetch the session list
						resolve();
					};

					request.onerror = (event) => {
						console.error(
							"Error deleting session:",
							(event.target as IDBRequest).error,
						);
						reject(
							new Error(
								`Failed to delete session: ${(event.target as IDBRequest).error?.message}`,
							),
						);
					};

					transaction.onerror = (event) => {
						console.error(
							"Delete session transaction error:",
							(event.target as IDBTransaction).error,
						);
						reject(
							new Error(
								`Delete session transaction failed: ${(event.target as IDBTransaction).error?.message}`,
							),
						);
					};
				} catch (err) {
					console.error("Error initiating delete session transaction:", err);
					reject(
						err instanceof Error
							? err
							: new Error("Unknown error deleting session"),
					);
				}
			});
		},
		[db, fetchSessions, selectedSessionId],
	);

	return {
		sessions, // List of session metadata
		selectedSessionId, // ID of the selected session
		selectedSessionMessages, // Messages of the selected session
		setSelectedSessionId, // Function to change selected session
		createNewSession,
		addMessageToSession,
		deleteSession, // Expose delete function
		isLoadingSessions,
		isLoadingMessages,
		error,
	};
}
