import { useAuth } from "@clerk/clerk-react";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor, // Ensure waitFor is imported
	within,
} from "@testing-library/react";
import { act as actHook, renderHook } from "@testing-library/react-hooks"; // Use actHook for hook updates
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

	// Define mock history props required by useChat
	const mockHistoryProps = {
		articleId: "mock-article-id-123",
		selectedSessionId: null,
		setSelectedSessionId: vi.fn(),
		selectedSessionMessages: [],
		// Simplify mocks and ensure they return promises
		createNewSession: vi.fn(async () => "mock-session-id-new"),
		addMessageToSession: vi.fn(async () => {}),
	};

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
		const { result } = renderHook(
			() => useChat(MOCK_ARTICLE_CONTENT, mockHistoryProps),
			{
				wrapper,
			},
		);
		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatHistory).toEqual([]);
		expect(result.current.chatInput).toBe("");
		expect(result.current.chatError).toBeNull();
	});

	it("should set error if content is null when handleChatSubmit is called", () => {
		const { result } = renderHook(() => useChat(null, mockHistoryProps), {
			wrapper,
		});

		act(() => {
			result.current.setChatInput("Test message");
			result.current.handleChatSubmit();
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toBe(
			"Article content not available.", // Match actual error message
		);
		expect(mockGetToken).not.toHaveBeenCalled();
	});

	it("should not trigger mutation if message is empty when handleChatSubmit is called", () => {
		const { result } = renderHook(
			() => useChat(MOCK_ARTICLE_CONTENT, mockHistoryProps),
			{
				wrapper,
			},
		);

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
		const { result } = renderHook(
			() => useChat(MOCK_ARTICLE_CONTENT, mockHistoryProps),
			{
				wrapper,
			},
		);
		const userMessage = "Test message";

		// Use handleChatSubmit and wait for the error state
		actHook(() => {
			result.current.setChatInput(userMessage);
		});
		await act(async () => {
			// Need to wrap submit in act for React state updates
			result.current.handleChatSubmit();
		});

		await waitFor(() => {
			expect(result.current.chatError).toBeInstanceOf(Error);
			expect(result.current.chatError?.message).toBe(
				"Authentication token missing.", // Match actual error message
			);
		});

		// Check final state after rejection
		// Assert final state after error handling
		expect(result.current.isChatting).toBe(false);
		// Check history includes the AI error message added by onError
		await waitFor(() => {
			// Check history includes the AI error message added by onError, matching the actual error
			expect(
				result.current.chatHistory.some(
					(m) =>
						m.sender === "ai" &&
						m.text.includes("Error: Authentication token missing."),
				),
			).toBe(true);
		});
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should successfully send message, get response, and update state", async () => {
		const { result } = renderHook(
			() => useChat(MOCK_ARTICLE_CONTENT, mockHistoryProps),
			{
				wrapper,
			},
		);
		const userMessage = "What is this article about?";

		actHook(() => {
			result.current.setChatInput(userMessage);
		});
		await act(async () => {
			result.current.handleChatSubmit();
		});

		// Wait for the mutation to settle and state to update
		await waitFor(() => {
			expect(result.current.isChatting).toBe(false);
		});

		// Check final state after success
		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeNull(); // Error should be null now with session ID fix
		// Corrected assertion: Check chatHistory content
		expect(result.current.chatHistory).toEqual([
			{ sender: "user", text: userMessage, timestamp: expect.any(Number) }, // User message has timestamp
			{ sender: "ai", text: MOCK_CHAT_RESPONSE }, // AI message from mock
		]);
		expect(result.current.chatInput).toBe(""); // Input cleared by onMutate
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle unauthorized (401) error from worker", async () => {
		// Reset handlers first to ensure a clean slate, then apply test-specific handler
		server.resetHandlers();
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
		const { result } = renderHook(
			() => useChat(MOCK_ARTICLE_CONTENT, mockHistoryProps),
			{
				wrapper,
			},
		);
		const userMessage = "Test 401 message";
		// Define separate regex for error.message and history text
		const expectedErrorMessage =
			/^Error from chat service: Mock Chat Unauthorized$/;
		const expectedHistoryText =
			/^Error: Error from chat service: Mock Chat Unauthorized$/;

		result.current.setChatInput(userMessage);
		// Wrap submit in actHook to ensure state updates from onError are processed
		await actHook(async () => {
			result.current.handleChatSubmit();
		});

		// Wait for the error state to be set
		// Wait for the error message to appear in the chat history,
		// as this is updated within the onError callback.
		// Wait for the mutation to settle (isChatting becomes false)
		// Wait for both the error state and the history to reflect the error
		// Wait for the mutation to settle (isChatting becomes false)
		// Wait for the mutation to settle (isChatting becomes false)
		await waitFor(() => {
			expect(result.current.isChatting).toBe(false);
		});

		// Now assert the final state after settlement
		expect(result.current.chatError).toBeInstanceOf(Error); // Error object should be set
		expect(result.current.chatError?.message).toMatch(expectedErrorMessage); // Check error.message content
		expect(
			// Check history contains the text with "Error: " prefix
			result.current.chatHistory.some(
				(m) => m.sender === "ai" && m.text?.match(expectedHistoryText),
			),
		).toBe(true);
		// Expectation below is redundant with the waitFor, but kept for clarity
		expect(result.current.isChatting).toBe(false);
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});

	it("should handle server error (500) from worker", async () => {
		// Reset handlers first to ensure a clean slate, then apply test-specific handler
		server.resetHandlers();
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
		const { result } = renderHook(
			() => useChat(MOCK_ARTICLE_CONTENT, mockHistoryProps),
			{
				wrapper,
			},
		);
		const userMessage = "Test 500 message";
		// Define separate regex for error.message and history text
		const expectedErrorMessage = /^Error from chat service: Mock Server Error$/;
		const expectedHistoryText =
			/^Error: Error from chat service: Mock Server Error$/;

		result.current.setChatInput(userMessage);
		// Wrap submit in actHook to ensure state updates from onError are processed
		await actHook(async () => {
			result.current.handleChatSubmit();
		});

		// Wait for the error state
		// Wait for the mutation to finish (isChatting becomes false)
		// Wait for the error message to appear in the chat history.
		// Wait for the mutation to finish (isChatting becomes false)
		// Wait for both the error state and the history to reflect the error
		// Wait for the mutation to settle (isChatting becomes false)
		// Wait for the mutation to settle (isChatting becomes false)
		// Wait directly for the error state to be populated
		// Wait for the mutation to settle (isChatting becomes false)
		await waitFor(() => {
			expect(result.current.isChatting).toBe(false);
		});

		// Now assert the final state after settlement
		expect(result.current.chatError).toBeInstanceOf(Error); // Check error state object
		expect(result.current.chatError?.message).toMatch(expectedErrorMessage); // Check error.message content
		expect(
			// Check history contains the text with "Error: " prefix
			result.current.chatHistory.some(
				(m) => m.sender === "ai" && m.text?.match(expectedHistoryText),
			),
		).toBe(true);
		expect(result.current.isChatting).toBe(false); // Ensure chatting stopped (already checked by waitFor, but good explicit check)
		expect(mockGetToken).toHaveBeenCalledTimes(1); // Ensure token was fetched
	});

	it("should handle invalid JSON response from worker", async () => {
		server.use(
			http.post(WORKER_CHAT_URL, () => {
				// Directly return invalid JSON
				console.log("[MSW Override] Returning invalid JSON for /api/chat");
				return new HttpResponse("<html>Invalid JSON</html>", { status: 200 });
			}),
		);
		const { result } = renderHook(
			() => useChat(MOCK_ARTICLE_CONTENT, mockHistoryProps),
			{
				wrapper,
			},
		);
		const userMessage = "Test invalid JSON";
		const expectedError = /Unexpected token '<'/;

		actHook(() => {
			result.current.setChatInput(userMessage);
		});
		await act(async () => {
			result.current.handleChatSubmit();
		});

		// Wait for the error state from JSON parsing
		await waitFor(() => {
			expect(result.current.chatError).toBeInstanceOf(Error);
			expect(result.current.chatError?.message).toMatch(expectedError);
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toMatch(expectedError);
		// Check history includes the AI error message added by onError
		await waitFor(() => {
			expect(
				result.current.chatHistory.some(
					(m) => m.sender === "ai" && m.text?.match(expectedError),
				),
			).toBe(true);
		});
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
		const { result } = renderHook(
			() => useChat(MOCK_ARTICLE_CONTENT, mockHistoryProps),
			{
				wrapper,
			},
		);
		const userMessage = "Test missing response field";
		const expectedError =
			"Invalid response from chat service (missing content)."; // Match actual error message

		actHook(() => {
			result.current.setChatInput(userMessage);
		});
		await act(async () => {
			result.current.handleChatSubmit();
		});

		// Wait for the error state
		await waitFor(() => {
			expect(result.current.chatError).toBeInstanceOf(Error);
			expect(result.current.chatError?.message).toBe(expectedError); // Check exact match now
		});

		expect(result.current.isChatting).toBe(false);
		expect(result.current.chatError).toBeInstanceOf(Error);
		expect(result.current.chatError?.message).toBe(expectedError);
		// Check history includes the AI error message added by onError
		// Check history includes the AI error message added by onError
		await waitFor(() => {
			expect(
				result.current.chatHistory.some(
					(msg) =>
						msg.sender === "ai" && msg.text === `Error: ${expectedError}`,
				),
			).toBe(true);
		});
		expect(mockGetToken).toHaveBeenCalledTimes(1);
	});
});
