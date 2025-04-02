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
			const requestBody = JSON.stringify({ content: fullTextContent });

			// Check if running in development environment
			// Note: This relies on Vite's import.meta.env feature.
			// Ensure your vite-env.d.ts includes `/// <reference types="vite/client" />`
			// --- Always call Cloudflare Worker Proxy (for both Dev and Prod) ---
			console.log("Calling Cloudflare Worker proxy for summarize...");
			// 1. Get Clerk token
			const clerkToken = await getToken();
			if (!clerkToken) {
				throw new Error("User not authenticated (Clerk token missing).");
			}

			// 2. Call the worker endpoint
			const response = await fetch(
				"https://bondwise-sync-api.vikione.workers.dev/api/summarize", // Use production worker URL always
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${clerkToken}`, // Use Clerk token
					},
					body: requestBody,
				},
			);

			// --- Handle Response (Common for Dev/Prod) ---
			const data = await response.json();

			if (!response.ok) {
				throw new Error(
					data?.message ||
						data?.error ||
						`Request failed with status ${response.status}`,
				);
			}

			if (!data.summary) {
				throw new Error(
					"Invalid response from summarization service (missing summary).",
				);
			}

			return data.summary;
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
			setSummaryError(error.message);
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
