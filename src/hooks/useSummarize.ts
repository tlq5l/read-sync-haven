import { useAuth } from "@clerk/clerk-react";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

/**
 * React hook for summarizing article content using either a streaming custom OpenAI-compatible API or a non-streaming Cloudflare Worker proxy.
 *
 * Manages loading state, summary result, and error messages. Automatically selects the streaming custom API if configured in localStorage, otherwise falls back to the worker proxy. Handles incremental summary updates for streaming responses and complete summaries for non-streaming responses.
 *
 * @returns An object containing:
 * - `summarize`: Function to trigger summarization with the article content.
 * - `isSummarizing`: Boolean indicating if summarization is in progress.
 * - `summary`: The current summary text, updated incrementally if streaming, or `null` if not started.
 * - `summaryError`: Error message if summarization fails, or `null` if no error.
 *
 * @remark
 * If no article content is provided, the hook sets an error and does not attempt summarization. Errors from the API or network are captured and exposed via `summaryError`.
 */
export function useSummarize() {
	const { getToken } = useAuth();
	const [isSummarizing, setIsSummarizing] = useState(false);
	// Initialize summary as null, it will be set to "" when streaming starts
	const [summary, setSummary] = useState<string | null>(null);
	const [summaryError, setSummaryError] = useState<string | null>(null);

	const summarizeMutation = useMutation({
		mutationFn: async (fullTextContent: string | null) => {
			if (!fullTextContent) {
				// No need to throw here, just return or handle appropriately
				// Let onMutate clear state, and do nothing further.
				console.warn("Summarization attempted with no content.");
				setSummaryError("Article content not available for summarization.");
				// Ensure loading state is reset if mutate was called directly without content check
				setIsSummarizing(false);
				return; // Exit early
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
				// --- Use Custom OpenAI-compatible endpoint (Streaming Enabled) ---
				console.log(
					"Using custom API endpoint for summarization (streaming)...",
				);
				try {
					const baseUrl = new URL(customApiEndpoint);
					apiUrl = new URL("./v1/chat/completions", baseUrl).toString();
					headers = {
						"Content-Type": "application/json",
						Authorization: `Bearer ${customApiKey}`,
					};
					requestBody = JSON.stringify({
						model: customApiModel || "gpt-3.5-turbo", // Use custom model or fallback
						messages: [
							{
								role: "system",
								content: "Summarize the following text:",
							},
							{ role: "user", content: fullTextContent },
						],
						stream: true, // <<< Enable streaming
						// Add other parameters like max_tokens if needed
					});

					response = await fetch(apiUrl, {
						method: "POST",
						headers: headers,
						body: requestBody,
					});

					if (!response.ok) {
						// Attempt to read error message from response body
						let errorBody = "";
						try {
							errorBody = await response.text(); // Read response body as text
							console.error(
								"Custom API Error Response Body:",
								errorBody.substring(0, 500),
							);
						} catch (e) {
							console.error("Could not read error response body:", e);
						}
						throw new Error(
							`Custom API Error: ${response.status} ${response.statusText}. ${errorBody.substring(0, 200)}`,
						);
					}

					// Handle streaming response
					if (!response.body) {
						throw new Error("Response body is null, cannot process stream.");
					}

					setSummary(""); // Initialize summary string for appending
					const reader = response.body.getReader();
					const decoder = new TextDecoder("utf-8");
					let buffer = ""; // Buffer to handle partial lines

					while (true) {
						const { done, value } = await reader.read();
						if (done) {
							console.log("Stream finished.");
							break; // Exit loop when stream is done
						}

						const chunk = decoder.decode(value, { stream: true });
						buffer += chunk;

						// Process lines separated by double newlines (SSE standard)
						let boundary = buffer.indexOf("\n\n");
						while (boundary !== -1) {
							const line = buffer.substring(0, boundary);
							buffer = buffer.substring(boundary + 2); // Move past the boundary

							if (line.startsWith("data: ")) {
								const dataContent = line.substring(6).trim(); // Remove "data: " prefix

								if (dataContent === "[DONE]") {
									console.log("Received [DONE] marker.");
									// The stream might end *before* [DONE] in some implementations,
									// but we handle 'done' from reader.read() as the ultimate signal.
									// We can break here as well if needed, but the outer loop handles 'done'.
								} else {
									try {
										const parsedData = JSON.parse(dataContent);
										const deltaContent =
											parsedData?.choices?.[0]?.delta?.content;
										if (deltaContent) {
											setSummary((prev) => prev + deltaContent);
										}
									} catch (parseError) {
										console.error(
											"Failed to parse JSON chunk:",
											dataContent,
											parseError,
										);
										// Decide how to handle parse errors - maybe log and continue?
										// For now, we'll log and continue accumulating text.
									}
								}
							}
							boundary = buffer.indexOf("\n\n"); // Find next boundary
						}
					}
					// Handle any remaining data in the buffer if the stream ends mid-line (less common with SSE)
					if (buffer.startsWith("data: ")) {
						const dataContent = buffer.substring(6).trim();
						if (dataContent !== "[DONE]") {
							try {
								const parsedData = JSON.parse(dataContent);
								const deltaContent = parsedData?.choices?.[0]?.delta?.content;
								if (deltaContent) {
									setSummary((prev) => prev + deltaContent);
								}
							} catch (parseError) {
								console.error(
									"Failed to parse final buffer chunk:",
									dataContent,
									parseError,
								);
							}
						}
					}

					setIsSummarizing(false); // Streaming complete
				} catch (error: any) {
					console.error(
						"Error during custom API streaming summarization:",
						error,
					);
					setSummaryError(
						error.message ||
							"An error occurred during custom API summarization.",
					);
					setIsSummarizing(false); // Ensure loading state is reset on error
				}
			} else {
				// --- Fallback to Cloudflare Worker proxy (Non-Streaming) ---
				console.log("Using Cloudflare Worker proxy for summarize...");
				try {
					const clerkToken = await getToken();
					if (!clerkToken) {
						throw new Error("User not authenticated (Clerk token missing).");
					}
					apiUrl =
						"https://thinkara-sync-api.vikione.workers.dev/api/summarize";
					headers = {
						"Content-Type": "application/json",
						Authorization: `Bearer ${clerkToken}`,
					};
					requestBody = JSON.stringify({ content: fullTextContent }); // Original body for worker

					response = await fetch(apiUrl, {
						method: "POST",
						headers: headers,
						body: requestBody,
					});

					// Handle Non-Streaming Response
					let data: any;
					try {
						const responseCloneForJson = response.clone(); // Clone before reading
						data = await responseCloneForJson.json();
					} catch (jsonError) {
						let rawResponseText = "[Could not read raw response]";
						try {
							const responseCloneForText = response.clone();
							rawResponseText = await responseCloneForText.text();
						} catch (textError) {
							console.error("Error reading raw response text:", textError);
						}
						console.error(
							"Failed to parse JSON response from worker. Raw response snippet:",
							rawResponseText.substring(0, 500),
						);
						// Re-throw the original JSON parsing error to match the test expectation
						throw jsonError; // FIX 1: Re-throw original error
					}

					if (!response.ok) {
						throw new Error(
							`Error from worker summarization service: ${data?.error?.message || data?.message || data?.error || `Request failed with status ${response.status}`}`,
						);
					}

					const summaryText: string | null = data?.summary ?? null;
					if (!summaryText) {
						// Match the exact error message expected by the test
						throw new Error(
							"Invalid response from summarization service (missing summary).", // FIX 2: Adjusted message
						);
					}

					setSummary(summaryText); // Set the full summary at once
					setIsSummarizing(false); // Non-streaming complete
				} catch (error: any) {
					console.error("Error calling Cloudflare Worker proxy:", error);
					setSummaryError(
						error.message || "An error occurred during worker summarization.",
					);
					setIsSummarizing(false); // Ensure loading state is reset on error
				}
			}
			// Note: onSuccess, onError, onSettled are effectively handled within the try/catch blocks above
		},
		onMutate: () => {
			setIsSummarizing(true);
			setSummary(null); // Reset summary state (will become "" if streaming starts)
			setSummaryError(null);
		},
		// onSuccess, onError, onSettled are removed as they are handled inline above
	});

	return {
		summarize: summarizeMutation.mutate, // Expose the mutate function
		isSummarizing,
		summary,
		summaryError,
	};
}
