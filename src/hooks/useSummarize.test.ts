import { useAuth } from "@clerk/clerk-react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	MOCK_CLERK_TOKEN, // Import constant
	MOCK_SUMMARY, // Import constant
	WORKER_BASE_URL, // Import constant
} from "../mocks/constants"; // Import from new constants file
import { server } from "../mocks/server";
import {
	QueryClientWrapper,
	getTestQueryClient,
} from "../test-utils/QueryClientWrapper";
// Removed unused imports
import { useSummarize } from "./useSummarize";

// Mock the useAuth hook from Clerk with a default implementation
vi.mock("@clerk/clerk-react", () => ({
	useAuth: vi.fn().mockReturnValue({
		// Provide a default return value
		getToken: async () => "default-mock-token", // Default getToken
		userId: "default-test-user",
		isLoaded: true,
		isSignedIn: true,
	}),
}));

// Mock console.log/error - Removed as they are unused
// const mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
// const mockConsoleError = vi
// 	.spyOn(console, "error")
// 	.mockImplementation(() => {});

// Constants - Use imported constants
// const MOCK_CLERK_TOKEN = "mock-clerk-jwt-token"; // Replaced
const WORKER_SUMMARIZE_URL = `${WORKER_BASE_URL}/api/summarize`; // Use imported base URL
// const MOCK_SUMMARY = "This is a mock summary."; // Replaced

// Get the test query client instance
const queryClient = getTestQueryClient();

describe("useSummarize Hook", () => {
	const wrapper = QueryClientWrapper; // Use the imported wrapper component
	let mockGetToken: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
		queryClient.clear();
		mockGetToken = vi.fn().mockResolvedValue(MOCK_CLERK_TOKEN); // Default mock getToken behavior here
		// Ensure the mock structure for useAuth is consistent and includes getToken
		(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
			getToken: mockGetToken, // Assign the mocked getToken function
			userId: "test-user-id",
			isLoaded: true,
			isSignedIn: true,
		});
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
				// Directly return the 401 error
				console.log("[MSW Override] Returning 401 for /api/summarize");
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
				// Directly return the 500 error
				console.log("[MSW Override] Returning 500 for /api/summarize");
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
				// Directly return invalid JSON
				console.log("[MSW Override] Returning invalid JSON for /api/summarize");
				return new HttpResponse("<html><body>Invalid JSON</body></html>", {
					status: 200,
					headers: { "Content-Type": "text/html" },
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
				// Directly return response missing 'summary' field
				console.log(
					"[MSW Override] Returning missing summary field for /api/summarize",
				);
				return HttpResponse.json({ status: "success", wrongField: "data" });
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
