import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Custom hook to handle article summarization via API calls.
 * Manages loading state, error handling, and the resulting summary.
 */
export function useSummarize() {
	const { getToken } = useAuth();
	const [isSummarizing, setIsSummarizing] = useState(false);
	const [summary, setSummary] = useState<string | null>(null);
	const [summaryError, setSummaryError] = useState<string | null>(null);

	const summarizeMutation = useMutation({
		mutationFn: async (fullTextContent: string | null) => {
			if (!fullTextContent) {
				throw new Error("Article content not available for summarization.");
			}

			// Retrieve custom API settings from localStorage
			const customApiKey = localStorage.getItem("customApiKey");
			const customApiEndpoint = localStorage.getItem("customApiEndpoint");

			let response: Response;
			let requestBody: string;
			let apiUrl: string;
			let headers: HeadersInit;

			if (customApiKey && customApiEndpoint) {
				// Use custom OpenAI-compatible endpoint
				console.log("Using custom API endpoint for summarization...");
				// Assuming customApiEndpoint is the base URL, append a standard path
				// Using /v1/chat/completions as a placeholder - adjust if needed for summarization standard
				apiUrl = `${customApiEndpoint.replace(/\/$/, "")}/v1/chat/completions`; // Ensure no double slash
				headers = {
					"Content-Type": "application/json",
					Authorization: `Bearer ${customApiKey}`,
				};
				// Construct a basic OpenAI-compatible request body for summarization
				// This might need refinement based on the specific model/API capabilities
				requestBody = JSON.stringify({
					model: "gpt-3.5-turbo", // Or a model suitable for summarization
					messages: [
						{
							role: "system",
							content: "Summarize the following text:",
						},
						{ role: "user", content: fullTextContent },
					],
					// Add other parameters like max_tokens if needed
				});

				try {
					response = await fetch(apiUrl, {
						method: "POST",
						headers: headers,
						body: requestBody,
					});
				} catch (error) {
					console.error("Error calling custom API endpoint:", error);
					throw new Error(
						`Failed to connect to custom endpoint: ${apiUrl}. Please check the URL and network connection.`,
					);
				}
			} else {
				// Fallback to Cloudflare Worker proxy
				console.log("Using Cloudflare Worker proxy for summarize...");
				const clerkToken = await getToken();
				if (!clerkToken) {
					throw new Error("User not authenticated (Clerk token missing).");
				}
				apiUrl = "https://thinkara-sync-api.vikione.workers.dev/api/summarize";
				headers = {
					"Content-Type": "application/json",
					Authorization: `Bearer ${clerkToken}`,
				};
				requestBody = JSON.stringify({ content: fullTextContent }); // Original body for worker

				try {
					response = await fetch(apiUrl, {
						method: "POST",
						headers: headers,
						body: requestBody,
					});
				} catch (error) {
					console.error("Error calling Cloudflare Worker proxy:", error);
					throw new Error(
						"Failed to connect to the summarization service. Please check your network connection.",
					);
				}
			}

			// --- Handle Response (Common Logic) ---
			const data = await response.json();

			if (!response.ok) {
				const errorSource =
					customApiKey && customApiEndpoint
						? "custom API endpoint"
						: "summarization service";
				throw new Error(
					`Error from ${errorSource}: ${data?.error?.message || data?.message || data?.error || `Request failed with status ${response.status}`}`,
				);
			}

			// --- Extract Summary (Adapts based on source) ---
			let summaryText: string | null = null;
			if (customApiKey && customApiEndpoint) {
				// Extract from OpenAI-compatible response structure
				summaryText = data?.choices?.[0]?.message?.content ?? null;
				if (!summaryText) {
					throw new Error(
						"Invalid response from custom API endpoint (missing summary content).",
					);
				}
			} else {
				// Extract from original worker response structure
				summaryText = data?.summary ?? null;
				if (!summaryText) {
					throw new Error(
						"Invalid response from summarization service (missing summary).",
					);
				}
			}

			return summaryText;
		},
		onMutate: () => {
			setIsSummarizing(true);
			setSummary(null);
			setSummaryError(null);
		},
		onSuccess: (data) => {
			setSummary(data);
			// Note: Opening the sidebar is UI logic, should be handled in the component
		},
		onError: (error: Error) => {
			setSummaryError(
				error.message || "An unknown error occurred during summarization.",
			); // Provide default
		},
		onSettled: () => {
			setIsSummarizing(false);
		},
	});

	return {
		summarize: summarizeMutation.mutate, // Expose the mutate function
		isSummarizing,
		summary,
		summaryError,
	};
}
