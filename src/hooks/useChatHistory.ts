import { ApiError, apiClient } from "@/lib/apiClient"; // Import apiClient
import { useAuth } from "@clerk/clerk-react"; // Import useAuth
import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";

// Removed IndexedDB constants

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

// Define a type for the combined Article Data (including sessions)
// This structure depends on the backend API response for GET /api/user/articles
// Assuming it returns an object where keys are articleIds
// Removed unused UserArticleData interface

// Or, if the GET endpoint is specific to one articleId:
interface SingleArticleData {
	articleId: string;
	sessions: ChatSession[];
	// other data...
}

/**
 * React hook for managing chat sessions and messages for a specific article.
 *
 * Provides state and functions to fetch, create, update, and delete chat sessions and messages associated with the given {@link articleId}. Integrates with authentication and synchronizes changes with a backend API. Returns session metadata for display, messages for the selected session, and utility functions for session management.
 *
 * @param articleId - The ID of the article whose chat history is managed, or null to disable fetching.
 * @returns An object containing session metadata, selected session ID and messages, state flags, error message, and functions to manipulate sessions and messages.
 */
export function useChatHistory(articleId: string | null) {
	const { isSignedIn, getToken } = useAuth(); // Get auth status and getToken
	// Store all fetched sessions for the current article
	const [articleSessions, setArticleSessions] = useState<ChatSession[]>([]);
	// State for session list (metadata only) - derived from articleSessions
	const [sessionsMetadata, setSessionsMetadata] = useState<
		ChatSessionMetadata[]
	>([]);
	// State for messages of the currently selected session
	const [selectedSessionMessages, setSelectedSessionMessages] = useState<
		ChatMessage[]
	>([]);
	const [selectedSessionId, setSelectedSessionIdState] = useState<
		string | null
	>(null);
	// Combined loading state for fetching article data (which includes sessions)
	const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
	const [isUpdatingData, setIsUpdatingData] = useState<boolean>(false); // For POST operations
	const [error, setError] = useState<string | null>(null);

	// --- Fetch Article Data (including sessions) ---
	const fetchArticleData = useCallback(async () => {
		if (!isSignedIn || !articleId) {
			setArticleSessions([]);
			setIsLoadingData(false);
			setSelectedSessionIdState(null);
			setSelectedSessionMessages([]);
			setError(null);
			return;
		}

		setIsLoadingData(true);
		setError(null);
		console.log(`Fetching article data for articleId: ${articleId}`);

		try {
			// Adjust endpoint if needed, e.g., /api/user/articles/${articleId}
			// Assuming the endpoint returns data structured like SingleArticleData
			if (!getToken) {
				throw new Error("getToken function is not available from useAuth.");
			}
			// Pass getToken to apiClient
			const data = await apiClient<SingleArticleData>(
				`/api/user/articles?articleId=${encodeURIComponent(articleId)}`,
				getToken, // Pass getToken here
			); // Assuming query param filtering

			const fetchedSessions = data?.sessions || [];
			// Sort sessions by creation time, newest first
			fetchedSessions.sort((a, b) => b.createdAt - a.createdAt);

			console.log(`Fetched ${fetchedSessions.length} sessions.`);
			setArticleSessions(fetchedSessions);

			// Update selected session if it still exists
			if (
				selectedSessionId &&
				!fetchedSessions.some((s) => s.sessionId === selectedSessionId)
			) {
				setSelectedSessionIdState(null); // Deselect if it disappeared
				setSelectedSessionMessages([]);
			} else if (selectedSessionId) {
				// If selected session still exists, update its messages
				const currentSelected = fetchedSessions.find(
					(s) => s.sessionId === selectedSessionId,
				);
				setSelectedSessionMessages(currentSelected?.messages || []);
			}
		} catch (error) {
			console.error("Failed to fetch article data:", error);
			if (error instanceof ApiError && error.status === 404) {
				console.log("No data found for article (404), using empty list.");
				setArticleSessions([]);
			} else if (error instanceof ApiError) {
				setError(
					`Failed to load data: ${error.status} ${error.message}${error.body ? ` - ${JSON.stringify(error.body)}` : ""}`,
				);
			} else {
				setError("Failed to load data due to an unexpected error.");
			}
			setArticleSessions([]); // Clear data on error
			setSelectedSessionIdState(null);
			setSelectedSessionMessages([]);
		} finally {
			setIsLoadingData(false);
		}
	}, [isSignedIn, articleId, selectedSessionId, getToken]); // Add getToken dependency

	// Effect to fetch data when auth/articleId changes
	useEffect(() => {
		fetchArticleData();
	}, [fetchArticleData]);

	// Derive metadata whenever articleSessions change
	useEffect(() => {
		const metadata = articleSessions.map(
			({
				sessionId,
				articleId: artId,
				createdAt,
				firstMessageSnippet,
				messages,
			}) => ({
				sessionId,
				articleId: artId,
				createdAt,
				firstMessageSnippet,
				messageCount: messages?.length ?? 0,
			}),
		);
		setSessionsMetadata(metadata);
	}, [articleSessions]);

	// Removed fetchSessions (now integrated into fetchArticleData)

	// Removed useEffect for fetchSessions

	// --- Update Selected Session Messages (triggered by selectedSessionId change) ---
	useEffect(() => {
		if (!selectedSessionId) {
			setSelectedSessionMessages([]);
			return;
		}
		const selected = articleSessions.find(
			(s) => s.sessionId === selectedSessionId,
		);
		setSelectedSessionMessages(selected?.messages || []);
	}, [selectedSessionId, articleSessions]);

	// Removed useEffect for fetchSessionMessages

	// --- Set Selected Session ID ---
	// Renamed state setter to avoid conflict with function name
	const setSelectedSessionId = useCallback((sessionId: string | null) => {
		console.log("Setting selected session ID:", sessionId);
		setSelectedSessionIdState(sessionId);
		// Message update is handled by the useEffect watching selectedSessionId and articleSessions
	}, []);

	// --- Update Backend Data ---
	const updateBackendData = useCallback(
		async (updatedSessions: ChatSession[]) => {
			if (!isSignedIn || !articleId) {
				setError("Not signed in or no article selected.");
				return false; // Indicate failure
			}

			setIsUpdatingData(true);
			setError(null);
			console.log(`Updating backend for articleId: ${articleId}`);

			// Prepare payload - assuming POST expects the full session list for the article
			const payload = {
				articleId: articleId,
				sessions: updatedSessions,
				// Include other article data if managed by this endpoint
			};

			try {
				if (!getToken) {
					throw new Error("getToken function is not available from useAuth.");
				}
				// Assuming POST /api/user/articles updates the specific article's data
				// Pass getToken to apiClient
				await apiClient(
					"/api/user/articles", // Use double quotes instead of template literal
					getToken, // Pass getToken here
					{
						method: "POST",
						body: JSON.stringify(payload),
					},
				);
				console.log("Backend update successful.");
				// Update local state *after* successful backend update
				setArticleSessions(updatedSessions);
				// Re-derive metadata is handled by useEffect
				// Update selected messages if the selected session was modified
				if (selectedSessionId) {
					const currentSelected = updatedSessions.find(
						(s) => s.sessionId === selectedSessionId,
					);
					setSelectedSessionMessages(currentSelected?.messages || []);
				}
				setIsUpdatingData(false);
				return true; // Indicate success
			} catch (error) {
				console.error("Failed to update backend data:", error);
				if (error instanceof ApiError) {
					setError(
						`Failed to save data: ${error.status} ${error.message}${error.body ? ` - ${JSON.stringify(error.body)}` : ""}`,
					);
				} else {
					setError("Failed to save data due to an unexpected error.");
				}
				setIsUpdatingData(false);
				// Optionally: trigger a re-fetch to revert local state to last known good state?
				// fetchArticleData();
				return false; // Indicate failure
			}
		},
		[isSignedIn, articleId, selectedSessionId, getToken], // Remove apiClient dependency
	);

	// --- Create New Session ---
	const createNewSession = useCallback(
		async (
			initialMessage: Omit<ChatMessage, "timestamp">,
		): Promise<string | null> => {
			if (!articleId) {
				setError("No article selected.");
				return null;
			}

			const now = Date.now();
			const newSessionId = uuidv4();
			const messageWithTimestamp: ChatMessage = {
				...initialMessage,
				timestamp: now,
			};
			const newSession: ChatSession = {
				sessionId: newSessionId,
				articleId: articleId,
				createdAt: now,
				messages: [messageWithTimestamp],
				firstMessageSnippet: messageWithTimestamp.content.substring(0, 50),
			};

			const updatedSessions = [...articleSessions, newSession];
			updatedSessions.sort((a, b) => b.createdAt - a.createdAt); // Keep sorted

			const success = await updateBackendData(updatedSessions);

			if (success) {
				setSelectedSessionIdState(newSessionId); // Select the new session locally
				return newSessionId;
			}
			return null; // Indicate failure
		},
		[articleId, articleSessions, updateBackendData],
	);

	// --- Add Message to Existing Session ---
	const addMessageToSession = useCallback(
		async (
			sessionId: string,
			newMessage: Omit<ChatMessage, "timestamp">,
		): Promise<boolean> => {
			const sessionIndex = articleSessions.findIndex(
				(s) => s.sessionId === sessionId,
			);
			if (sessionIndex === -1) {
				setError(`Session ${sessionId} not found locally.`);
				return false;
			}

			const messageWithTimestamp: ChatMessage = {
				...newMessage,
				timestamp: Date.now(),
			};

			const updatedSession = {
				...articleSessions[sessionIndex],
				messages: [
					...articleSessions[sessionIndex].messages,
					messageWithTimestamp,
				].sort((a, b) => a.timestamp - b.timestamp), // Ensure sorted
			};

			const updatedSessions = [...articleSessions];
			updatedSessions[sessionIndex] = updatedSession;

			// No need to re-sort sessions array as only messages changed

			return await updateBackendData(updatedSessions);
		},
		[articleSessions, updateBackendData],
	);

	// --- Delete Session ---
	const deleteSession = useCallback(
		async (sessionIdToDelete: string): Promise<boolean> => {
			const updatedSessions = articleSessions.filter(
				(s) => s.sessionId !== sessionIdToDelete,
			);

			// No need to re-sort as filter maintains order

			const success = await updateBackendData(updatedSessions);

			if (success && selectedSessionId === sessionIdToDelete) {
				setSelectedSessionIdState(null); // Clear selection if deleted session was selected
			}
			return success;
		},
		[articleSessions, updateBackendData, selectedSessionId],
	);

	return {
		sessions: sessionsMetadata, // Use derived metadata state
		selectedSessionId,
		selectedSessionMessages,
		setSelectedSessionId,
		createNewSession,
		addMessageToSession,
		deleteSession,
		isLoading: isLoadingData, // Use combined loading state
		isUpdating: isUpdatingData, // Expose updating state
		error,
	};
}
