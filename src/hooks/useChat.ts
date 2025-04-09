import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

export type ChatMessage = {
	sender: "user" | "ai";
	text: string;
};

/**
 * Custom hook to manage chat interactions related to article content.
 * Handles API calls, chat history, input state, and loading/error states.
 */
export function useChat(fullTextContent: string | null) {
	const { getToken } = useAuth();
	const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
	const [chatInput, setChatInput] = useState("");
	const [isChatting, setIsChatting] = useState(false);
	const [chatError, setChatError] = useState<Error | null>(null); // Use Error type
	const chatScrollAreaRef = useRef<HTMLDivElement>(null); // Ref for scrolling

	const chatMutation = useMutation({
		mutationFn: async (userMessage: string) => {
			if (!fullTextContent) {
				throw new Error("Article content not available for chat.");
			}
			if (!userMessage.trim()) {
				throw new Error("Cannot send an empty message.");
			}

			// Retrieve custom API settings from localStorage
			const customApiKey = localStorage.getItem("customApiKey");
			const customApiEndpoint = localStorage.getItem("customApiEndpoint");
			const customApiModel = localStorage.getItem("customApiModel"); // Retrieve custom model name
			let response: Response;
			let requestBody: string;
			let apiUrl: string;
			let headers: HeadersInit;

			if (customApiKey && customApiEndpoint) {
				// Use custom OpenAI-compatible endpoint
				console.log("Using custom API endpoint for chat...");
				// Construct the final URL robustly, handling potential trailing slashes and existing paths
				const baseUrl = new URL(customApiEndpoint);
				// Use a relative path to ensure correct joining with the base pathname
				apiUrl = new URL("./v1/chat/completions", baseUrl).toString();
				headers = {
					"Content-Type": "application/json",
					Authorization: `Bearer ${customApiKey}`,
				};
				// Construct OpenAI-compatible request body for chat
				const customApiPayload = {
					model: "openai/gpt-3.5-turbo", // TEMP: Hardcoded for debugging OpenRouter issue
					messages: [
						{
							role: "system",
							content: `You are a helpful assistant discussing the following document content (truncated):\n\n${fullTextContent.slice(0, 12000)} [...truncated content]`, // Truncate content
						},
						...chatHistory.slice(-6), // Limit history to last 6 messages
						{ role: "user", content: userMessage },
					],
					// Add other parameters like temperature if needed
				};
				requestBody = JSON.stringify(customApiPayload);

				console.log('Custom API Request Payload (Reduced):', customApiPayload); // <-- ADDED LOG

				try {
					response = await fetch(apiUrl, {
						method: "POST",
						headers: headers,
						body: requestBody,
					});
				} catch (error) {
					console.error('Custom API Error:', error); // Existing specific logging
					// Keep original error message for context
					console.error("Original error calling custom API endpoint:", error);
					throw new Error(
						`Failed to connect to custom endpoint: ${apiUrl}. Please check the URL and network connection.`,
					);
				}
			} else {
				// Fallback to Cloudflare Worker proxy
				console.log("Using Cloudflare Worker proxy for chat...");
				const clerkToken = await getToken();
				if (!clerkToken) {
					throw new Error("User not authenticated (Clerk token missing).");
				}
				apiUrl = "https://thinkara-sync-api.vikione.workers.dev/api/chat";
				headers = {
					"Content-Type": "application/json",
					Authorization: `Bearer ${clerkToken}`,
				};
				// Original body for worker (only needs current message and content)
				requestBody = JSON.stringify({
					content: fullTextContent,
					message: userMessage,
				});

				try {
					response = await fetch(apiUrl, {
						method: "POST",
						headers: headers,
						body: requestBody,
					});
				} catch (error) {
					console.error("Error calling Cloudflare Worker proxy:", error);
					throw new Error(
						"Failed to connect to the chat service. Please check your network connection.",
					);
				}
			}

			// --- Handle Response (Common Logic) ---
			const data = await response.json();
			console.log('Custom API Raw Response Data (Reduced Context):', data); // <-- ADDED LOG (Logs regardless of source, but relevant for custom API debugging)

			if (!response.ok) {
				const errorSource =
					customApiKey && customApiEndpoint
						? "custom API endpoint"
						: "chat service";
				throw new Error(
					`Error from ${errorSource}: ${data?.error?.message || data?.message || data?.error || `Request failed with status ${response.status}`}`,
				);
			}

			// --- Extract AI Response (Adapts based on source) ---
			let aiResponseText: string | null = null;
			if (customApiKey && customApiEndpoint) {
				// Extract from OpenAI-compatible response structure
				aiResponseText = data?.choices?.[0]?.message?.content ?? null;
				if (!aiResponseText) {
					console.error( // Log the problematic data structure too
						"Missing AI content. Custom API Raw Response Data:", // Note: This is slightly redundant with the log above, but keeps the specific error context
						data,
					);
					throw new Error(
						"Invalid response from custom API endpoint (missing AI response content).",
					);
				}
			} else {
				// Extract from original worker response structure
				aiResponseText = data?.response ?? null;
				if (!aiResponseText) {
					throw new Error(
						"Invalid response from chat service (missing response).",
					);
				}
			}

			return aiResponseText; // Return the AI response text
		},
		onMutate: (userMessage: string) => {
			setIsChatting(true);
			setChatError(null);
			// Add user message to history immediately
			setChatHistory((prev) => [
				...prev,
				{ sender: "user", text: userMessage },
			]);
			setChatInput(""); // Clear input field
		},
		onSuccess: (aiResponse: string) => {
			// Add AI response to history
			setChatHistory((prev) => [...prev, { sender: "ai", text: aiResponse }]);
		},
		onError: (error: Error) => {
			const errorMessage =
				error.message || "An unknown error occurred during chat.";
			setChatError(error instanceof Error ? error : new Error(errorMessage)); // Ensure it's an Error object
			// Add error message to chat history for user visibility
			setChatHistory((prev) => [
				...prev,
				{ sender: "ai", text: `Error: ${errorMessage}` },
			]);
		},
		onSettled: () => {
			setIsChatting(false);
			// Scroll to bottom after message exchange
			scrollToBottom();
		},
	});

	const scrollToBottom = useCallback(() => {
		setTimeout(() => {
			if (chatScrollAreaRef.current) {
				chatScrollAreaRef.current.scrollTo({
					top: chatScrollAreaRef.current.scrollHeight,
					behavior: "smooth",
				});
			}
		}, 100); // Small delay to allow DOM update
	}, []);

	// Scroll chat to bottom when the scroll function reference changes (effectively on mount)
	useEffect(() => {
		scrollToBottom();
	}, [scrollToBottom]); // Remove chatHistory dependency, scrolling is handled in onSettled and on mount

	const handleChatSubmit = useCallback(
		(e?: React.FormEvent<HTMLFormElement>) => {
			e?.preventDefault();
			if (chatInput.trim() && !isChatting && fullTextContent) {
				chatMutation.mutate(chatInput.trim());
			} else if (!fullTextContent) {
				// Keep setting string here for consistency, or create new Error()
				setChatError(
					new Error("Article content not yet extracted or available."),
				);
			}
		},
		[chatInput, isChatting, fullTextContent, chatMutation],
	);

	return {
		chatHistory,
		chatInput,
		setChatInput,
		isChatting,
		chatError,
		handleChatSubmit,
		chatScrollAreaRef, // Expose ref for the component to use
		// Expose mutation object for more control in tests if needed
		chatMutation,
	};
}
