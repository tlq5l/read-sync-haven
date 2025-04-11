import { authClient } from "@/lib/authClient"; // Import the actual client
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	QueryClientWrapper,
	getTestQueryClient,
} from "../test-utils/QueryClientWrapper";
import { useChat } from "./useChat";

// Mock the authClient
vi.mock("@/lib/authClient", () => ({
	authClient: {
		useSession: vi.fn(),
		$fetch: vi.fn(), // Mock the fetch method
	},
}));

// Type assertion for mocked methods
const mockUseSession = authClient.useSession as ReturnType<typeof vi.fn>;
const mockFetch = authClient.$fetch as ReturnType<typeof vi.fn>;

// Constants
const MOCK_CHAT_RESPONSE = "This is a mock AI chat response.";
const MOCK_ARTICLE_CONTENT = "This is the article content for chat.";
const MOCK_USER_ID = "test-user-id";
const MOCK_SESSION = { user: { id: MOCK_USER_ID } }; // Simplified mock session

// Get the test query client instance
const queryClient = getTestQueryClient();

describe("useChat Hook", () => {
	const wrapper = QueryClientWrapper;

	beforeEach(() => {
		vi.clearAllMocks();
		queryClient.clear();
		// Default mocks: authenticated, successful fetch
		mockUseSession.mockReturnValue({
			data: MOCK_SESSION,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
		mockFetch.mockResolvedValue({ response: MOCK_CHAT_RESPONSE });
		window.HTMLElement.prototype.scrollTo = vi.fn(); // Mock scrollTo
	});

	afterEach(() => {
		vi.restoreAllMocks();
		// No MSW reset needed
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
		expect(mockFetch).not.toHaveBeenCalled();
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
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("should return error if user is not authenticated", async () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		}); // Unauthenticated
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		const userMessage = "Test message";
		const expectedError = "User not authenticated for chat.";

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
				(m) => m.sender === "ai" && m.text.includes(expectedError),
			),
		).toBe(true);
		expect(mockFetch).not.toHaveBeenCalled();
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

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeNull();
		expect(result.current.chatHistory).toEqual([
			{ sender: "user", text: userMessage },
			{ sender: "ai", text: MOCK_CHAT_RESPONSE },
		]);
		expect(result.current.chatInput).toBe("");
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(mockFetch).toHaveBeenCalledWith(
			"/api/chat", // Assuming relative URL
			expect.objectContaining({
				method: "POST",
				body: { content: MOCK_ARTICLE_CONTENT, message: userMessage },
			}),
		);
	});

	it("should handle API error from $fetch", async () => {
		const mockError = new Error("Mock API Chat Error");
		mockFetch.mockRejectedValue(mockError);
		const { result } = renderHook(() => useChat(MOCK_ARTICLE_CONTENT), {
			wrapper,
		});
		const userMessage = "Test API error";

		await act(async () => {
			result.current.setChatInput(userMessage);
			await expect(
				result.current.chatMutation.mutateAsync(userMessage),
			).rejects.toThrow(mockError);
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBe(mockError);
		expect(
			result.current.chatHistory.some(
				(m) => m.sender === "ai" && m.text.includes(mockError.message),
			),
		).toBe(true);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it("should handle response missing response field", async () => {
		mockFetch.mockResolvedValue({ status: "success", otherData: "abc" }); // Missing 'response'
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
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});
