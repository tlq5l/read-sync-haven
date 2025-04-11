import { authClient } from "@/lib/authClient"; // Import the actual client to mock its methods
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	QueryClientWrapper,
	getTestQueryClient,
} from "../test-utils/QueryClientWrapper";
import { useSummarize } from "./useSummarize";

// Mock the authClient
vi.mock("@/lib/authClient", () => ({
	authClient: {
		useSession: vi.fn(),
		$fetch: vi.fn(), // Mock the fetch method used internally
	},
}));

// Type assertion for mocked methods
const mockUseSession = authClient.useSession as ReturnType<typeof vi.fn>;
const mockFetch = authClient.$fetch as ReturnType<typeof vi.fn>;

// Constants
const MOCK_SUMMARY = "This is a mock summary.";
const MOCK_USER_ID = "test-user-id";
const MOCK_SESSION = {
	user: { id: MOCK_USER_ID /* other fields if needed */ },
};

// Get the test query client instance
const queryClient = getTestQueryClient();

describe("useSummarize Hook", () => {
	const wrapper = QueryClientWrapper;

	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
		queryClient.clear();

		// Default mock implementations
		// Mock authenticated state by default
		mockUseSession.mockReturnValue({
			data: MOCK_SESSION,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
		// Mock successful API call by default
		mockFetch.mockResolvedValue({ summary: MOCK_SUMMARY });
	});

	afterEach(() => {
		vi.restoreAllMocks();
		// No need to reset MSW handlers as we mock $fetch directly
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
			// Check the exact error message from the hook's validation
			expect(result.current.summaryError?.message).toBe(
				// Accessing .message should work now
				"Article content not available for summarization.",
			);
			expect(result.current.summary).toBeNull();
		});
		expect(mockFetch).not.toHaveBeenCalled(); // Should not call fetch if content is null
	});

	it("should return error if user is not authenticated", async () => {
		// Mock unauthenticated state
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
		const { result } = renderHook(() => useSummarize(), { wrapper });

		act(() => {
			result.current.summarize("Some article content");
		});

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			// Check the exact error message from the hook's auth check
			expect(result.current.summaryError?.message).toBe(
				// Accessing .message should work now
				"User not authenticated for summarization.",
			);
			expect(result.current.summary).toBeNull();
		});
		expect(mockFetch).not.toHaveBeenCalled(); // Should not call fetch if not authenticated
	});

	it("should successfully summarize content and update state", async () => {
		const { result } = renderHook(() => useSummarize(), { wrapper });
		const testContent = "This is the content to summarize.";

		act(() => {
			result.current.summarize(testContent);
		});

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summary).toBe(MOCK_SUMMARY);
			expect(result.current.summaryError).toBeNull();
		});

		// Verify fetch was called correctly
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledWith(
			"/api/summarize", // Assuming relative URL based on hook implementation
			expect.objectContaining({
				method: "POST",
				body: { content: testContent },
			}),
		);
	});

	it("should handle API error from $fetch", async () => {
		const mockError = new Error("Mock API Error");
		mockFetch.mockRejectedValue(mockError); // Simulate fetch failure

		const { result } = renderHook(() => useSummarize(), { wrapper });
		const testContent = "Content causing API error.";

		act(() => {
			result.current.summarize(testContent);
		});

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summary).toBeNull();
			expect(result.current.summaryError).toBe(mockError); // Check for the exact error object
		});
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("should handle response missing summary field", async () => {
		// Mock fetch to return object without summary
		mockFetch.mockResolvedValue({ status: "success", wrongField: "data" });

		const { result } = renderHook(() => useSummarize(), { wrapper });
		const testContent = "Content resulting in missing summary field.";

		act(() => {
			result.current.summarize(testContent);
		});

		await waitFor(() => {
			expect(result.current.isSummarizing).toBe(false);
			expect(result.current.summary).toBeNull();
			expect(result.current.summaryError?.message).toBe(
				// Accessing .message should work now
				"Invalid response from summarization service (missing summary).",
			);
		});
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});
