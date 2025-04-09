import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

const DB_NAME = "readSyncHavenDB";
const DB_VERSION = 1;
const STORE_NAME = "chatMessages";
const ARTICLE_ID_INDEX = "articleIdIndex";

export interface ChatMessage {
	messageId: string; // Primary Key
	articleId: string; // Indexed
	sender: "user" | "ai";
	content: string;
	timestamp: number; // Unix timestamp (ms)
}

export function useChatHistory(articleId: string) {
	const [db, setDb] = useState<IDBDatabase | null>(null);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	// Effect for initializing IndexedDB
	useEffect(() => {
		let request: IDBOpenDBRequest;
		let dbInstance: IDBDatabase | null = null;

		const openDb = () => {
			setIsLoading(true);
			setError(null);
			request = indexedDB.open(DB_NAME, DB_VERSION);

			request.onupgradeneeded = (event) => {
				dbInstance = (event.target as IDBOpenDBRequest).result;
				if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
					const store = dbInstance.createObjectStore(STORE_NAME, {
						keyPath: "messageId",
					});
					store.createIndex(ARTICLE_ID_INDEX, "articleId", { unique: false });
					console.log(
						`Object store '${STORE_NAME}' created with index '${ARTICLE_ID_INDEX}'.`,
					);
				} else {
					// Handle potential future upgrades if needed
					const transaction = (event.target as IDBOpenDBRequest).transaction;
					if (transaction) {
						const store = transaction.objectStore(STORE_NAME);
						if (!store.indexNames.contains(ARTICLE_ID_INDEX)) {
							store.createIndex(ARTICLE_ID_INDEX, "articleId", {
								unique: false,
							});
							console.log(
								`Index '${ARTICLE_ID_INDEX}' created on existing store '${STORE_NAME}'.`,
							);
						}
					}
				}
			};

			request.onsuccess = (event) => {
				dbInstance = (event.target as IDBOpenDBRequest).result;
				setDb(dbInstance);
				console.log(`IndexedDB '${DB_NAME}' opened successfully.`);
				// Fetch messages once DB is ready (will be implemented later)
			};

			request.onerror = (event) => {
				console.error(
					"IndexedDB error:",
					(event.target as IDBOpenDBRequest).error,
				);
				setError(
					`Failed to open IndexedDB: ${(event.target as IDBOpenDBRequest).error?.message}`,
				);
				setIsLoading(false);
			};
		};

		if (!window.indexedDB) {
			console.error("Your browser doesn't support IndexedDB.");
			setError("IndexedDB is not supported in this browser.");
			setIsLoading(false);
			return;
		}

		openDb();

		// Cleanup function to close DB connection
		return () => {
			if (dbInstance) {
				dbInstance.close();
				console.log(`IndexedDB '${DB_NAME}' connection closed.`);
				setDb(null);
			}
		};
	}, []); // Run only once on mount

	// Function to fetch messages from DB
	const fetchMessages = useCallback(() => {
		if (!db || !articleId) {
			// DB not ready or no articleId provided yet
			setMessages([]); // Clear messages if dependencies aren't ready
			setIsLoading(db === null); // Still loading if DB is null
			return;
		}

		setIsLoading(true);
		setError(null);
		console.log(`Fetching messages for articleId: ${articleId}`);

		try {
			const transaction = db.transaction(STORE_NAME, "readonly");
			const store = transaction.objectStore(STORE_NAME);
			const index = store.index(ARTICLE_ID_INDEX);
			const request = index.getAll(articleId);

			request.onsuccess = (event) => {
				const result = (event.target as IDBRequest<ChatMessage[]>).result;
				if (result) {
					// Sort messages by timestamp ascending
					result.sort((a, b) => a.timestamp - b.timestamp);
					console.log(`Fetched ${result.length} messages.`);
					setMessages(result);
				} else {
					setMessages([]);
				}
				setIsLoading(false);
			};

			request.onerror = (event) => {
				console.error(
					"Error fetching messages:",
					(event.target as IDBRequest).error,
				);
				setError(
					`Failed to fetch messages: ${(event.target as IDBRequest).error?.message}`,
				);
				setIsLoading(false);
			};

			transaction.onerror = (event) => {
				console.error(
					"Read transaction error:",
					(event.target as IDBTransaction).error,
				);
				setError(
					`Read transaction failed: ${(event.target as IDBTransaction).error?.message}`,
				);
				setIsLoading(false); // Ensure loading is set to false on transaction error
			};

			transaction.oncomplete = () => {
				console.log("Read transaction completed.");
				// Loading state is set in request.onsuccess/onerror
			};
		} catch (err) {
			console.error("Error initiating fetch transaction:", err);
			setError(
				err instanceof Error ? err.message : "Unknown error fetching messages",
			);
			setIsLoading(false);
		}
	}, [db, articleId]);

	// Effect to fetch messages when DB is ready or articleId changes
	useEffect(() => {
		fetchMessages();
	}, [fetchMessages]); // Dependency array includes fetchMessages which depends on db and articleId

	// Function to add a message
	const addMessage = useCallback(
		(
			newMessage: Omit<ChatMessage, "messageId" | "timestamp">,
		): Promise<string> => {
			return new Promise((resolve, reject) => {
				if (!db) {
					console.error("DB not initialized yet for addMessage");
					return reject(new Error("Database not initialized"));
				}

				const messageToAdd: ChatMessage = {
					...newMessage,
					articleId: articleId, // Ensure correct articleId is associated
					messageId: uuidv4(),
					timestamp: Date.now(),
				};

				try {
					const transaction = db.transaction(STORE_NAME, "readwrite");
					const store = transaction.objectStore(STORE_NAME);
					const request = store.add(messageToAdd);

					request.onsuccess = () => {
						console.log("Message added successfully:", messageToAdd.messageId);
						// Re-fetch messages after adding to update the list
						fetchMessages();
						resolve(messageToAdd.messageId);
					};

					request.onerror = (event) => {
						console.error(
							"Error adding message:",
							(event.target as IDBRequest).error,
						);
						reject(
							new Error(
								`Failed to add message: ${(event.target as IDBRequest).error?.message}`,
							),
						);
					};

					transaction.onerror = (event) => {
						console.error(
							"Transaction error during add:",
							(event.target as IDBTransaction).error,
						);
						reject(
							new Error(
								`Transaction failed during add: ${(event.target as IDBTransaction).error?.message}`,
							),
						);
					};
				} catch (err) {
					console.error("Error initiating add transaction:", err);
					reject(
						err instanceof Error
							? err
							: new Error("Unknown error adding message"),
					);
				}
			});
		},
		[db, articleId, fetchMessages], // Add fetchMessages dependency
	);

	// Removed the placeholder useEffect as fetching is now handled by the fetchMessages effect

	return { messages, addMessage, isLoading, error };
}
