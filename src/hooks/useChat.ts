import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage as HistoryChatMessage } from "./useChatHistory"; // Use type import

// Type for messages managed *within* this hook (active chat display)
export type ActiveChatMessage = {
	sender: "user" | "ai";
	text: string;
	timestamp?: number; // Optional timestamp for consistency
};

// Type definition for the props we expect from useChatHistory via ArticleReader
interface ChatHistoryProps {
	articleId: string | null;
	selectedSessionId: string | null;
	setSelectedSessionId: (sessionId: string | null) => void; // Function to update the selected session in the parent
	selectedSessionMessages: HistoryChatMessage[]; // Messages loaded from history
	createNewSession: (
		initialMessage: Omit<HistoryChatMessage, "timestamp">,
	) => Promise<string>; // Returns new session ID
	addMessageToSession: (
		sessionId: string,
		newMessage: Omit<HistoryChatMessage, "timestamp">,
	) => Promise<void>;
}

/**
 * Custom hook to manage chat interactions related to article content.
 * Integrates with useChatHistory for persistence.
 */
export function useChat(
	fullTextContent: string | null,
	historyProps: ChatHistoryProps, // Pass history functions and state
	onChatSettled?: () => void,
) {
	const { getToken } = useAuth();
	// This state now represents the messages displayed in the *active* chat UI
	const [chatHistory, setChatHistory] = useState<ActiveChatMessage[]>([]);
	const [chatInput, setChatInput] = useState("");
	const [isChatting, setIsChatting] = useState(false);
	const [chatError, setChatError] = useState<Error | null>(null);
	const chatScrollAreaRef = useRef<HTMLDivElement>(null);

	const {
		articleId,
		selectedSessionId,
		setSelectedSessionId,
		selectedSessionMessages,
		createNewSession,
		addMessageToSession,
	} = historyProps;

	// Effect to load historical messages into the active chat view when a session is selected
	useEffect(() => {
		if (selectedSessionId && selectedSessionMessages.length > 0) {
			// Map HistoryChatMessage to ActiveChatMessage if structures differ significantly
			// Assuming they are compatible enough for now (sender, content/text, timestamp)
			const activeMessages = selectedSessionMessages.map((msg) => ({
				sender: msg.sender,
				text: msg.content, // Map content to text
				timestamp: msg.timestamp,
			}));
			setChatHistory(activeMessages);
			console.log(
				`[useChat] Loaded ${activeMessages.length} messages from session ${selectedSessionId}`,
			);
			scrollToBottom();
		} else if (!selectedSessionId) {
			// Clear active chat if no session is selected (or user starts a new one implicitly)
			setChatHistory([]);
			console.log(
				"[useChat] Cleared active chat history (no session selected).",
			);
		}
		// Dependency: selectedSessionMessages signals that new messages are loaded for the selected ID
	}, [selectedSessionMessages, selectedSessionId]); // Add selectedSessionId dependency

	const chatMutation = useMutation({
		mutationFn: async ({
			userMessage,
			currentSessionId,
		}: { userMessage: string; currentSessionId: string | null }) => {
			if (!fullTextContent) throw new Error("Article content not available.");
			if (!userMessage.trim()) throw new Error("Empty message.");
			if (!articleId) throw new Error("Article ID missing."); // Needed for history

			let sessionIdForThisInteraction = currentSessionId;
			let isNewSession = false;

			// --- Save User Message to Persistent History ---
			try {
				const userHistoryMessage: Omit<HistoryChatMessage, "timestamp"> = {
					sender: "user",
					content: userMessage,
					// articleId is part of the session, not the message itself in new structure
				};
				if (sessionIdForThisInteraction) {
					await addMessageToSession(
						sessionIdForThisInteraction,
						userHistoryMessage,
					);
					console.log(
						`[useChat] User message added to existing session: ${sessionIdForThisInteraction}`,
					);
				} else {
					// Create a new session if none is selected
					const newSessionId = await createNewSession(userHistoryMessage);
					sessionIdForThisInteraction = newSessionId; // Use the new ID for the AI response
					setSelectedSessionId(newSessionId); // Update parent state to select the new session
					isNewSession = true;
					console.log(
						`[useChat] User message created new session: ${newSessionId}`,
					);
				}
			} catch (historyError) {
				console.error(
					"[useChat] Failed to save user message to history:",
					historyError,
				);
				throw new Error(
					`Failed to save message history: ${historyError instanceof Error ? historyError.message : String(historyError)}`,
				); // Propagate error
			}

			// --- Update Local UI Optimistically (User Message) ---
			// If it's a new session, the useEffect watching selectedSessionMessages might reload,
			// but an immediate update feels better. If not a new session, just append.
			if (!isNewSession) {
				setChatHistory((prev) => [
					...prev,
					{ sender: "user", text: userMessage, timestamp: Date.now() },
				]);
			}
			// Note: If it *is* a new session, the state update happens via useEffect watching selectedSessionMessages
			// triggered by setSelectedSessionId above. Add user message manually might cause duplication.
			// Let's refine this: setChatHistory directly after createNewSession succeeds.
			if (isNewSession) {
				setChatHistory([
					{ sender: "user", text: userMessage, timestamp: Date.now() },
				]);
			}

			// --- Call Backend API ---
			const customApiKey = localStorage.getItem("customApiKey");
			const customApiEndpoint = localStorage.getItem("customApiEndpoint");
			let response: Response;
			let requestBody: string;
			let apiUrl: string;
			let headers: HeadersInit;
			const streamRequested = customApiKey && customApiEndpoint;

			if (customApiKey && customApiEndpoint) {
				// Use custom OpenAI-compatible endpoint (Streaming ON)
				console.log("[useChat] Using custom API endpoint (streaming)...");
				const baseUrl = new URL(customApiEndpoint);
				apiUrl = new URL("./v1/chat/completions", baseUrl).toString();
				headers = {
					"Content-Type": "application/json",
					Authorization: `Bearer ${customApiKey}`,
				};
				const customApiPayload = {
					model:
						localStorage.getItem("customApiModel") || "openai/gpt-3.5-turbo",
					messages: [
						{
							role: "system",
							content: `You are a helpful assistant discussing:\n\n${fullTextContent.slice(0, 12000)}...`,
						},
						// Use messages from the *currently displayed* chat history for context
						...chatHistory.slice(-6).map((msg) => ({
							role: msg.sender === "user" ? "user" : "assistant",
							content: msg.text,
						})),
						{ role: "user", content: userMessage },
					],
					stream: true,
				};
				requestBody = JSON.stringify(customApiPayload);
				response = await fetch(apiUrl, {
					method: "POST",
					headers,
					body: requestBody,
				});
			} else {
				// Fallback to Cloudflare Worker proxy (Non-streaming)
				console.log("[useChat] Using Cloudflare Worker proxy...");
				const clerkToken = await getToken();
				if (!clerkToken) throw new Error("Authentication token missing.");
				apiUrl = "https://thinkara-sync-api.vikione.workers.dev/api/chat";
				headers = {
					"Content-Type": "application/json",
					Authorization: `Bearer ${clerkToken}`,
				};
				requestBody = JSON.stringify({
					content: fullTextContent,
					message: userMessage,
				});
				response = await fetch(apiUrl, {
					method: "POST",
					headers,
					body: requestBody,
				});
			}

			// --- Handle Response (Common Logic for OK/Error) ---
			if (!response.ok) {
				// ... existing error handling ...
				const errorSource = streamRequested
					? "custom API endpoint"
					: "chat service";
				let errorDetails = `Request failed with status ${response.status}`;
				try {
					const errorData = await response.json();
					errorDetails =
						errorData?.error?.message ||
						errorData?.message ||
						JSON.stringify(errorData);
				} catch (e) {
					try {
						const textError = await response.text();
						errorDetails += `\nResponse Body: ${textError.substring(0, 200)}`;
					} catch (textE) {
						/*ignore*/
					}
				}
				throw new Error(`Error from ${errorSource}: ${errorDetails}`);
			}

			// --- Handle SUCCESSFUL Response (Streaming or Non-Streaming) ---
			let finalAiContent = "";
			let currentAiResponseText = ""; // For incremental UI updates

			// Add placeholder for AI response in UI immediately
			setChatHistory((prev) => [...prev, { sender: "ai", text: "" }]);
			scrollToBottom();

			if (streamRequested && response.body) {
				console.log("[useChat] Handling STREAMING response...");
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				// eslint-disable-next-line no-constant-condition
				while (true) {
					try {
						const { done, value } = await reader.read();
						if (done) break;
						buffer += decoder.decode(value, { stream: true });
						const lines = buffer.split("\n");
						buffer = lines.pop() || "";

						for (const line of lines) {
							if (line.startsWith("data: ")) {
								const dataContent = line.substring(6).trim();
								if (dataContent === "[DONE]") continue;
								if (dataContent) {
									try {
										const chunk = JSON.parse(dataContent);
										const deltaContent = chunk.choices?.[0]?.delta?.content;
										if (typeof deltaContent === "string") {
											currentAiResponseText += deltaContent;
											// Update UI incrementally
											setChatHistory((prev) => {
												const lastMsgIndex = prev.length - 1;
												if (
													lastMsgIndex >= 0 &&
													prev[lastMsgIndex].sender === "ai"
												) {
													const updated = [...prev];
													updated[lastMsgIndex] = {
														...updated[lastMsgIndex],
														text: currentAiResponseText,
													};
													return updated;
												}
												return prev; // Should not happen if placeholder was added
											});
											scrollToBottom();
										}
									} catch (parseError) {
										console.warn("[useChat] Stream parse error:", parseError);
									}
								}
							}
						}
					} catch (readError) {
						console.error("[useChat] Stream read error:", readError);
						// Save whatever was received so far?
						finalAiContent = currentAiResponseText; // Capture partial content before throwing
						throw new Error(
							`Stream read failed: ${readError instanceof Error ? readError.message : String(readError)}`,
						);
					}
				}
				finalAiContent = currentAiResponseText; // Full content after stream ends
				console.log("[useChat] Stream finished.");
			} else {
				// Non-streaming path
				console.log("[useChat] Handling NON-STREAMING response...");
				const responseData = await response.json();
				if (streamRequested) {
					// Custom API (non-streaming mode - shouldn't happen with current logic)
					finalAiContent = responseData?.choices?.[0]?.message?.content;
				} else {
					// GCF Worker
					// Assuming GCF returns { choices: [{ message: { content: "..." } }] } based on previous debugging
					finalAiContent = responseData?.choices?.[0]?.message?.content;
				}

				if (!finalAiContent || typeof finalAiContent !== "string") {
					throw new Error(
						`Invalid response from ${streamRequested ? "custom API" : "chat service"} (missing content).`,
					);
				}
				// Update UI with final content
				setChatHistory((prev) => {
					const lastMsgIndex = prev.length - 1;
					if (lastMsgIndex >= 0 && prev[lastMsgIndex].sender === "ai") {
						const updated = [...prev];
						updated[lastMsgIndex] = {
							...updated[lastMsgIndex],
							text: finalAiContent,
						};
						return updated;
					}
					return [...prev, { sender: "ai", text: finalAiContent }]; // Fallback
				});
				scrollToBottom();
			}

			// --- Save AI Message to Persistent History ---
			if (finalAiContent && sessionIdForThisInteraction) {
				try {
					const aiHistoryMessage: Omit<HistoryChatMessage, "timestamp"> = {
						sender: "ai",
						content: finalAiContent,
					};
					await addMessageToSession(
						sessionIdForThisInteraction,
						aiHistoryMessage,
					);
					console.log(
						`[useChat] AI response saved to session: ${sessionIdForThisInteraction}`,
					);
				} catch (historyError) {
					console.error(
						"[useChat] Failed to save AI message to history:",
						historyError,
					);
					// Don't throw here, the chat succeeded, just log the history save failure
					setChatError(
						new Error(
							`Chat successful, but failed to save AI response to history: ${historyError instanceof Error ? historyError.message : String(historyError)}`,
						),
					);
				}
			} else if (!sessionIdForThisInteraction) {
				console.error(
					"[useChat] Cannot save AI response, session ID is missing!",
				);
				setChatError(
					new Error(
						"Chat successful, but could not save AI response (session ID missing).",
					),
				);
			}

			return finalAiContent; // Return final AI response
		},
		onMutate: () => {
			// userMessage is accessed within mutationFn, not needed directly here
			setIsChatting(true);
			setChatError(null);
			// Optimistic UI update for user message happens inside mutationFn *after* history save attempt
			// Clear input field
			setChatInput("");
			// Placeholder for AI message is added *after* backend call starts in mutationFn
			// scrollToBottom(); // Scroll handled after user message added in mutationFn
		},
		onError: (error: Error) => {
			setChatError(error);
			// Add error message to *active* chat UI
			// Check if the last message is already the error placeholder from mutationFn
			setChatHistory((prev) => {
				const lastMsg = prev[prev.length - 1];
				if (lastMsg?.sender === "ai" && lastMsg.text.startsWith("Error:")) {
					// If error happened during API call *after* placeholder was added, update it
					return prev.map((msg, index) =>
						index === prev.length - 1
							? { ...msg, text: `Error: ${error.message}` }
							: msg,
					);
				}
				// If error happened before placeholder (e.g., saving user msg), add new error msg
				return [...prev, { sender: "ai", text: `Error: ${error.message}` }];
			});
		},
		onSettled: () => {
			setIsChatting(false);
			scrollToBottom();
			onChatSettled?.();
		},
	});

	const scrollToBottom = useCallback(() => {
		setTimeout(() => {
			chatScrollAreaRef.current?.scrollTo({
				top: chatScrollAreaRef.current.scrollHeight,
				behavior: "smooth",
			});
		}, 100);
	}, []);

	useEffect(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	// Modified handleChatSubmit to pass necessary context
	const handleChatSubmit = useCallback(
		(e?: React.FormEvent<HTMLFormElement>) => {
			e?.preventDefault();
			if (chatInput.trim() && !isChatting && fullTextContent && articleId) {
				chatMutation.mutate({
					userMessage: chatInput.trim(),
					currentSessionId: selectedSessionId,
				});
			} else if (!fullTextContent) {
				setChatError(new Error("Article content not available."));
			} else if (!articleId) {
				setChatError(new Error("Article context is missing."));
			}
		},
		[
			chatInput,
			isChatting,
			fullTextContent,
			articleId,
			selectedSessionId,
			chatMutation,
		], // Added dependencies
	);

	return {
		chatHistory, // Active chat messages for UI display
		chatInput,
		setChatInput,
		isChatting,
		chatError,
		handleChatSubmit,
		chatScrollAreaRef,
	};
}
