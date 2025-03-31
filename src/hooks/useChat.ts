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
	const [chatError, setChatError] = useState<string | null>(null);
	const chatScrollAreaRef = useRef<HTMLDivElement>(null); // Ref for scrolling

	const chatMutation = useMutation({
		mutationFn: async (userMessage: string) => {
			if (!fullTextContent) {
				throw new Error("Article content not available for chat.");
			}
			if (!userMessage.trim()) {
				throw new Error("Cannot send an empty message.");
			}

			let response: Response;
			const requestBody = JSON.stringify({
				content: fullTextContent,
				message: userMessage,
			});

			// Always call the worker proxy
			console.log("Calling Cloudflare Worker proxy for chat...");
			const clerkToken = await getToken();
			if (!clerkToken) {
				throw new Error("User not authenticated (Clerk token missing).");
			}

			// Use VITE_GCF_CHAT_URL in dev if available, otherwise worker URL
			const chatApiUrl =
				import.meta.env.DEV && import.meta.env.VITE_GCF_CHAT_URL
					? import.meta.env.VITE_GCF_CHAT_URL // TODO: Add proxy logic if needed for dev GCF
					: "https://bondwise-sync-api.vikione.workers.dev/api/chat";

			response = await fetch(chatApiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${clerkToken}`,
				},
				body: requestBody,
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(
					data?.message ||
						data?.error ||
						`Chat request failed with status ${response.status}`,
				);
			}

			if (!data.response) {
				throw new Error(
					"Invalid response from chat service (missing response).",
				);
			}

			return data.response; // Return the AI response text
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
			setChatError(error.message);
			// Add error message to chat history
			setChatHistory((prev) => [
				...prev,
				{ sender: "ai", text: `Error: ${error.message}` },
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
				setChatError("Article content not yet extracted or available.");
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
	};
}
