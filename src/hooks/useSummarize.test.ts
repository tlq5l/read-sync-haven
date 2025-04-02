import { useAuth } from "@clerk/clerk-react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../mocks/server"; // MSW server
import {
	QueryClientWrapper,
	getTestQueryClient,
} from "../test-utils/QueryClientWrapper"; // Import the wrapper
// Remove direct QueryClient imports
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import React from 'react';
import { useSummarize } from "./useSummarize";

// Mock the useAuth hook from Clerk
vi.mock("@clerk/clerk-react", () => ({
	useAuth: vi.fn(),
}));

// Mock console.log/error - Removed as they are unused
// const mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
// const mockConsoleError = vi
// 	.spyOn(console, "error")
// 	.mockImplementation(() => {});

// Constants
const MOCK_CLERK_TOKEN = "mock-clerk-jwt-token";
const WORKER_SUMMARIZE_URL =
	"https://bondwise-sync-api.vikione.workers.dev/api/summarize";
const MOCK_SUMMARY = "This is a mock summary.";

// Get the test query client instance
const queryClient = getTestQueryClient();

describe("useSummarize Hook", () => {
	const wrapper = QueryClientWrapper; // Use the imported wrapper component
	let mockGetToken: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks(); // Use clearAllMocks to reset spies too
		queryClient.clear(); // Clear query cache between tests
		mockGetToken = vi.fn();
		(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
			getToken: mockGetToken,
			userId: "test-user-id", // Add userId if needed by other parts
			isLoaded: true,
			isSignedIn: true,
		});
		// Default mock implementations
		mockGetToken.mockResolvedValue(MOCK_CLERK_TOKEN);
	});

	afterEach(() => {
		vi.restoreAllMocks(); // Restore console mocks etc.
		server.resetHandlers(); // Reset MSW handlers between tests
	});

	it("should initialize with correct default states", () => {
		const { result } = renderHook(() => useSummarize(), { wrapper });
		expect(result.current.isSummarizing).toBe(false);
		expect(result.current.summary).toBeNull();
		expect(result.current.summaryError).toBeNull();
	});

	it("should return error if content is null when summarize is called", async () => {
		const { result } = renderHook(() => useSummarize(), { wrapper });

		act(() => {
			result.current.summarize(null);
		});

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summaryError).toBe(
				"Article content not available for summarization.",
			);
			expect(result.current.summary).toBeNull();
		});
		expect(mockGetToken).not.toHaveBeenCalled();
	});

	it("should return error if getToken fails", async () => {
		mockGetToken.mockResolvedValue(null); // Simulate token failure
		const { result } = renderHook(() => useSummarize(), { wrapper });

		act(() => {
			result.current.summarize("Some article content");
		});

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summaryError).toBe(
				"User not authenticated (Clerk token missing).",
			);
			expect(result.current.summary).toBeNull();
		});
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should successfully summarize content and update state", async () => {
		const { result } = renderHook(() => useSummarize(), { wrapper });
		const testContent = "This is the content to summarize.";

		// MSW will intercept the fetch call defined in src/mocks/handlers.ts

		act(() => {
			result.current.summarize(testContent);
		});

		// // Check initial mutation state - This runs before onMutate sets state
		// expect(result.current.isSummarizing).toBe(true);
		// expect(result.current.summary).toBeNull();
		// expect(result.current.summaryError).toBeNull();

		// Wait for the mutation to complete (MSW will respond)
		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summary).toBe(MOCK_SUMMARY);
			expect(result.current.summaryError).toBeNull();
		});

		// Verify dependencies were called
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle unauthorized (401) error from worker", async () => {
		// Override MSW handler for this specific test
		server.use(
			http.post(WORKER_SUMMARIZE_URL, () => {
				return new HttpResponse(
					JSON.stringify({ error: "Mock Unauthorized" }),
					{
						status: 401,
						headers: { "Content-Type": "application/json" },
					},
				);
			}),
		);

		const { result } = renderHook(() => useSummarize(), { wrapper });
		const testContent = "Content causing auth error.";

		act(() => {
			result.current.summarize(testContent);
		});

		// expect(result.current.isSummarizing).toBe(true); // Runs before onMutate

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summary).toBeNull();
			// Check if the error message includes the status or the message from the body
			expect(result.current.summaryError).toMatch(
				/Mock Unauthorized|Request failed with status 401/,
			);
		});
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle server error (500) from worker", async () => {
		// Override MSW handler for this specific test
		server.use(
			http.post(WORKER_SUMMARIZE_URL, () => {
				return new HttpResponse(
					JSON.stringify({ error: "Internal Server Error" }),
					{
						status: 500,
						headers: { "Content-Type": "application/json" },
					},
				);
			}),
		);

		const { result } = renderHook(() => useSummarize(), { wrapper });
		const testContent = "Content causing server error.";

		act(() => {
			result.current.summarize(testContent);
		});

		// expect(result.current.isSummarizing).toBe(true); // Runs before onMutate

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summary).toBeNull();
			expect(result.current.summaryError).toMatch(
				/Internal Server Error|Request failed with status 500/,
			);
		});
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle invalid JSON response from worker", async () => {
		// Override MSW handler for this specific test
		server.use(
			http.post(WORKER_SUMMARIZE_URL, () => {
				// Return non-JSON response
				return new HttpResponse("<html><body>Invalid JSON</body></html>", {
					status: 200,
					headers: { "Content-Type": "text/html" }, // Incorrect content type
				});
			}),
		);

		const { result } = renderHook(() => useSummarize(), { wrapper });
		const testContent = "Content resulting in invalid JSON response.";

		act(() => {
			result.current.summarize(testContent);
		});

		// expect(result.current.isSummarizing).toBe(true); // Runs before onMutate

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summary).toBeNull();
			// Error comes from JSON.parse failing
			expect(result.current.summaryError).toMatch(/Unexpected token '<'/);
		});
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle response missing summary field", async () => {
		// Override MSW handler for this specific test
		server.use(
			http.post(WORKER_SUMMARIZE_URL, () => {
				return HttpResponse.json({ status: "success", wrongField: "data" }); // Missing 'summary'
			}),
		);

		const { result } = renderHook(() => useSummarize(), { wrapper });
		const testContent = "Content resulting in missing summary field.";

		act(() => {
			result.current.summarize(testContent);
		});

		// expect(result.current.isSummarizing).toBe(true); // Runs before onMutate

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summary).toBeNull();
			expect(result.current.summaryError).toBe(
				"Invalid response from summarization service (missing summary).",
			);
		});
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});
});
