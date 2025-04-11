import { authClient } from "@/lib/authClient"; // Import authClient
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Custom hook to handle article summarization via API calls.
 * Manages loading state, error handling, and the resulting summary.
 */
export function useSummarize() {
	const { data: session } = authClient.useSession(); // Use session to ensure user is logged in
	const [isSummarizing, setIsSummarizing] = useState(false);
	const [summary, setSummary] = useState<string | null>(null);
	const [summaryError, setSummaryError] = useState<Error | null>(null); // Store Error object

	const summarizeMutation = useMutation({
		mutationFn: async (fullTextContent: string | null) => {
			if (!session) {
				// Check if user is authenticated first
				throw new Error("User not authenticated for summarization.");
			}
			if (!fullTextContent) {
				throw new Error("Article content not available for summarization.");
			}

			console.log("Calling Cloudflare Worker proxy for summarize...");

			// Use authClient.$fetch - it should handle auth automatically
			const response = await authClient.$fetch(
				// URL should be relative to the baseURL configured in authClient
				// Assuming baseURL is "https://bondwise-sync-api.vikione.workers.dev"
				"/api/summarize",
				{
					method: "POST",
					body: { content: fullTextContent }, // Send content in body
					// $fetch handles headers like Content-Type and Authorization
				},
			);

			// $fetch likely throws on error, but check response just in case
			// Depending on $fetch config, 'response' might already be the parsed JSON data
			let data: { summary?: string; message?: string; error?: string };
			if (response instanceof Response) {
				// If $fetch returned the raw Response object
				data = await response.json();
				if (!response.ok) {
					throw new Error(
						data?.message ||
							data?.error ||
							`Request failed with status ${response.status}`,
					);
				}
			} else {
				// If $fetch returned parsed data directly
				data = response as any; // Assume structure matches
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
		},
		onError: (error: Error) => {
			setSummaryError(error); // Store the full Error object
		},
		onSettled: () => {
			setIsSummarizing(false);
		},
	});

	return {
		summarize: summarizeMutation.mutate,
		isSummarizing,
		summary,
		summaryError,
	};
}
