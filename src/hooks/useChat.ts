import { authClient } from "@/lib/authClient"; // Import authClient
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
	const { data: session } = authClient.useSession(); // Get session state
	const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
	const [chatInput, setChatInput] = useState("");
	const [isChatting, setIsChatting] = useState(false);
	const [chatError, setChatError] = useState<Error | null>(null);
	const chatScrollAreaRef = useRef<HTMLDivElement>(null);

	const chatMutation = useMutation({
		mutationFn: async (userMessage: string) => {
			if (!session) {
				// Check authentication first
				throw new Error("User not authenticated for chat.");
			}
			if (!fullTextContent) {
				throw new Error("Article content not available for chat.");
			}
			if (!userMessage.trim()) {
				throw new Error("Cannot send an empty message.");
			}

			console.log("Calling Cloudflare Worker proxy for chat...");

			// Always use the production worker URL relative to baseURL
			const chatApiUrl = "/api/chat"; // Assuming baseURL is set in authClient

			// Use authClient.$fetch for the API call
			const response = await authClient.$fetch(chatApiUrl, {
				method: "POST",
				body: {
					content: fullTextContent,
					message: userMessage,
				},
				// $fetch handles auth headers
			});

			// Process response (assuming $fetch might return parsed data or Response)
			let data: { response?: string; message?: string; error?: string };
			if (response instanceof Response) {
				data = await response.json();
				if (!response.ok) {
					throw new Error(
						data?.message ||
							data?.error ||
							`Chat request failed with status ${response.status}`,
					);
				}
			} else {
				data = response as any;
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
			setChatHistory((prev) => [
				...prev,
				{ sender: "user", text: userMessage },
			]);
			setChatInput("");
		},
		onSuccess: (aiResponse: string) => {
			setChatHistory((prev) => [...prev, { sender: "ai", text: aiResponse }]);
		},
		onError: (error: Error) => {
			setChatError(error);
			setChatHistory((prev) => [
				...prev,
				{ sender: "ai", text: `Error: ${error.message}` },
			]);
		},
		onSettled: () => {
			setIsChatting(false);
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
		}, 100);
	}, []);

	useEffect(() => {
		scrollToBottom();
	}, [scrollToBottom]);

	const handleChatSubmit = useCallback(
		(e?: React.FormEvent<HTMLFormElement>) => {
			e?.preventDefault();
			if (chatInput.trim() && !isChatting && fullTextContent) {
				chatMutation.mutate(chatInput.trim());
			} else if (!fullTextContent) {
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
		chatScrollAreaRef,
		chatMutation,
	};
}
