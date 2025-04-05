import { useAuth } from "@clerk/clerk-react";
import { act, renderHook } from "@testing-library/react"; // Removed waitFor
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	MOCK_CHAT_RESPONSE, // Import constant
	MOCK_CLERK_TOKEN, // Import constant
	WORKER_BASE_URL, // Import constant
} from "../mocks/constants"; // Import from new constants file
import { server } from "../mocks/server";
import {
	QueryClientWrapper,
	getTestQueryClient,
} from "../test-utils/QueryClientWrapper";
import { useChat } from "./useChat";

// Mock the useAuth hook from Clerk
vi.mock("@clerk/clerk-react", () => ({
	useAuth: vi.fn(),
}));

// Mock console.log/error - Removed as they are unused
// const mockConsoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
// const mockConsoleError = vi.spyOn(console, "error").mockImplementation(() => {});

// Constants - Use imported constants
// const MOCK_CLERK_TOKEN = "mock-clerk-jwt-token"; // Replaced
const WORKER_CHAT_URL = `${WORKER_BASE_URL}/api/chat`; // Use imported base URL
// const MOCK_CHAT_RESPONSE = "This is a mock AI chat response."; // Replaced
const MOCK_ARTICLE_CONTENT = "This is the article content for chat.";

// Get the test query client instance
const queryClient = getTestQueryClient();

describe("useChat Hook", () => {
	const wrapper = QueryClientWrapper; // Use the imported wrapper component
	let mockGetToken: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		queryClient.clear(); // Clear query cache
		mockGetToken = vi.fn();
		(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
			getToken: mockGetToken,
			userId: "test-user-id",
			// Remove isLoaded and isSignedIn as they might not be strictly needed
			// for these mutation tests and could potentially interfere.
		});
		mockGetToken.mockResolvedValue(MOCK_CLERK_TOKEN);
		window.HTMLElement.prototype.scrollTo = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		server.resetHandlers();
	});

	it("should initialize with correct default states", () => {
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatHistory).toEqual([]);
		expect(result.current.chatInput).toBe("");
		expect(result.current.chatError).toBeNull();
	});

	it("should set error if content is null when handleChatSubmit is called", () => {
		const { result } = renderHook(() => useChat(null), { wrapper });

		act(() => {
			result.current.setChatInput("Test message");
			result.current.handleChatSubmit();
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toBe(
			"Article content not yet extracted or available.",
		);
		expect(mockGetToken).not.toHaveBeenCalled();
	});

	it("should not trigger mutation if message is empty when handleChatSubmit is called", () => {
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});

		act(() => {
			result.current.setChatInput("   ");
			result.current.handleChatSubmit();
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeNull();
		expect(mockGetToken).not.toHaveBeenCalled();
	});

	it("should return error if getToken fails", async () => {
		mockGetToken.mockResolvedValue(null);
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		const userMessage = "Test message";

		// Use mutateAsync and catch the expected error
		await act(async () => {
			result.current.setChatInput(userMessage);
			await expect(
				result.current.chatMutation.mutateAsync(userMessage),
			).rejects.toThrow("User not authenticated (Clerk token missing).");
		});

		// Check final state after rejection
		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toBe(
			"User not authenticated (Clerk token missing).",
		);
		// Check history includes the AI error message added by onError
		expect(
			result.current.chatHistory.some(
				(m) => m.sender === "ai" && m.text.includes("User not authenticated"),
			),
		).toBe(true);
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should successfully send message, get response, and update state", async () => {
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		const userMessage = "What is this article about?";

		await act(async () => {
			result.current.setChatInput(userMessage);
			await result.current.chatMutation.mutateAsync(userMessage);
		});

		// Check final state after success
		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeNull();
		expect(result.current.chatHistory).toEqual([
			{ sender: "user", text: userMessage },
			{ sender: "ai", text: MOCK_CHAT_RESPONSE },
		]);
		expect(result.current.chatInput).toBe(""); // Input cleared by onMutate
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle unauthorized (401) error from worker", async () => {
		server.use(
			http.post(WORKER_CHAT_URL, () => {
				// Directly return the 401 error without checking auth here
				console.log("[MSW Override] Returning 401 for /api/chat");
				return new HttpResponse(
					JSON.stringify({ error: "Mock Chat Unauthorized" }), // Keep the intended error message
					{ status: 401 },
				);
			}),
		);
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		const userMessage = "Test 401 message";
		const expectedError =
			/Mock Chat Unauthorized|Chat request failed with status 401/;

		await act(async () => {
			result.current.setChatInput(userMessage);
			await expect(
				result.current.chatMutation.mutateAsync(userMessage),
			).rejects.toThrow(expectedError);
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toMatch(expectedError);
		expect(
			result.current.chatHistory.some(
				(m) => m.sender === "ai" && m.text?.match(expectedError),
			),
		).toBe(true);
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle server error (500) from worker", async () => {
		server.use(
			http.post(WORKER_CHAT_URL, () => {
				// Directly return the 500 error
				console.log("[MSW Override] Returning 500 for /api/chat");
				return new HttpResponse(
					JSON.stringify({ error: "Mock Server Error" }),
					{ status: 500 },
				);
			}),
		);
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		const userMessage = "Test 500 message";
		const expectedError =
			/Mock Server Error|Chat request failed with status 500/;

		await act(async () => {
			result.current.setChatInput(userMessage);
			await expect(
				result.current.chatMutation.mutateAsync(userMessage),
			).rejects.toThrow(expectedError);
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toMatch(expectedError);
		expect(
			result.current.chatHistory.some(
				(m) => m.sender === "ai" && m.text?.match(expectedError),
			),
		).toBe(true);
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle invalid JSON response from worker", async () => {
		server.use(
			http.post(WORKER_CHAT_URL, () => {
				// Directly return invalid JSON
				console.log("[MSW Override] Returning invalid JSON for /api/chat");
				return new HttpResponse("<html>Invalid JSON</html>", { status: 200 });
			}),
		);
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		const userMessage = "Test invalid JSON";
		const expectedError = /Unexpected token '<'/;

		await act(async () => {
			result.current.setChatInput(userMessage);
			// The error happens during JSON parsing after fetch resolves
			await expect(
				result.current.chatMutation.mutateAsync(userMessage),
			).rejects.toThrow(expectedError);
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toMatch(expectedError);
		expect(
			result.current.chatHistory.some(
				(m) => m.sender === "ai" && m.text?.match(expectedError),
			),
		).toBe(true);
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle response missing response field", async () => {
		server.use(
			http.post(WORKER_CHAT_URL, () => {
				// Directly return response missing 'response' field
				console.log(
					"[MSW Override] Returning missing response field for /api/chat",
				);
				return HttpResponse.json({ status: "success", otherData: "abc" });
			}),
		);
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		const userMessage = "Test missing response field";
		const expectedError =
			"Invalid response from chat service (missing response).";

		await act(async () => {
			result.current.setChatInput(userMessage);
			await expect(
				result.current.chatMutation.mutateAsync(userMessage),
			).rejects.toThrow(expectedError);
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toBe(expectedError);
		expect(
			result.current.chatHistory.some(
				(msg) => msg.sender === "ai" && msg.text === `Error: ${expectedError}`,
			),
		).toBe(true);
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});
});
