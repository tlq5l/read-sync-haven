// thinkara-worker/src/handlers/api.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "../auth"; // Import the auth module to mock it
import type { Env } from "../types";
import { handleChat, handleSummarize } from "./api";

// Spy on global.fetch for worker tests
// Spy on global.fetch for worker tests
let fetchSpy: any; // Use 'any' or leave untyped for inference in beforeEach

// Mock the authenticateRequestWithClerk function
vi.mock("../auth", async (importOriginal) => {
	const actual = await importOriginal<typeof auth>();
	return {
		...actual, // Keep other exports if any
		authenticateRequestWithClerk: vi.fn(), // Mock the specific function
	};
});
const mockedAuth = vi.mocked(auth.authenticateRequestWithClerk);

describe("Worker API Handlers", () => {
	// Define constants locally within the describe scope
	const MOCK_SUMMARY_LOCAL = "Fake GCF Summary";
	const MOCK_CHAT_RESPONSE_LOCAL = "Fake GCF Chat Response";

	let mockEnv: Env;
	const testUserId = "user_api_test_456";

	beforeEach(() => {
		// Reset mocks before each test
		fetchSpy = vi.spyOn(global, "fetch"); // Initialize spy before each test
		mockedAuth.mockReset();

		// Mock environment variables
		mockEnv = {
			GCF_SUMMARIZE_URL: "http://fake-gcf/summarize", // Keep fake URL for MSW interception
			GCF_CHAT_URL: "http://fake-gcf/chat",
			GCF_AUTH_SECRET: "test-secret",
			SAVED_ITEMS_KV: {} as KVNamespace,
			CLERK_SECRET_KEY: "test_secret_key",
			CLERK_WEBHOOK_SECRET: "test_webhook_secret", // Added for test environment
			CLERK_PUBLISHABLE_KEY: "test_pub_key",
			GEMINI_API_KEY: "",
			GCLOUD_PROJECT_NUMBER: "",
			GCLOUD_WORKLOAD_IDENTITY_POOL_ID: "",
			GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: "",
			GCLOUD_SERVICE_ACCOUNT_EMAIL: "",
		};
	});

	afterEach(() => {
		// vi.restoreAllMocks() will handle restoring the fetch spy
		vi.restoreAllMocks();
	});

	// --- handleSummarize ---
	describe("handleSummarize", () => {
		it("should return summary on successful GCF call", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			// Mock the fetch spy's behavior for the GCF call
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ summary: MOCK_SUMMARY_LOCAL }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const request = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Some text to summarize" }),
			});

			const response = await handleSummarize(request, mockEnv);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				status?: string;
				summary?: string;
			};
			expect(body).toEqual({ status: "success", summary: MOCK_SUMMARY_LOCAL });
			expect(mockedAuth).toHaveBeenCalledTimes(1);
			expect(fetchSpy).toHaveBeenCalledTimes(1); // Check fetch spy was called
			expect(fetchSpy).toHaveBeenCalledWith(
				"http://fake-gcf/summarize",
				expect.anything(),
			);
		});

		it("should return 401 if authentication fails", async () => {
			const authErrorResponse = new Response(
				JSON.stringify({ status: "error", message: "Auth failed" }),
				{ status: 401 },
			);
			mockedAuth.mockResolvedValue({
				status: "error",
				response: authErrorResponse,
			});

			const request = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer invalid",
				},
				body: JSON.stringify({ content: "Some text" }),
			});

			const response = await handleSummarize(request, mockEnv);
			expect(response).toBe(authErrorResponse);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("should return 400 if content is missing", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const request = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({}), // Missing content
			});
			const response = await handleSummarize(request, mockEnv);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe("Missing 'content' in request body");
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("should return 503 if GCF URL is not configured", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const envWithoutUrl = { ...mockEnv, GCF_SUMMARIZE_URL: "" }; // Simulate missing URL
			const request = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Some text" }),
			});
			const response = await handleSummarize(request, envWithoutUrl);
			expect(response.status).toBe(503);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe(
				"AI summarization service URL is not configured.",
			);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("should return 500 if GCF secret is not configured", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const envWithoutSecret = { ...mockEnv, GCF_AUTH_SECRET: "" }; // Simulate missing secret
			const request = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Some text" }),
			});
			const response = await handleSummarize(request, envWithoutSecret);
			expect(response.status).toBe(500);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe(
				"Worker is missing configuration for backend authentication.",
			);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		// Note: Testing specific GCF failures (502 errors) from within this file
		// is difficult without directly mocking fetch to fail.
		// This test remains largely the same, relying on the direct fetch mock now.
		it("should return 200 when GCF call succeeds (using direct fetch mock)", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			// Mock the fetch spy's behavior
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ summary: MOCK_SUMMARY_LOCAL }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const request = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Some text" }),
			});

			const response = await handleSummarize(request, mockEnv);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { summary?: string };
			expect(body.summary).toBe(MOCK_SUMMARY_LOCAL);
			expect(fetchSpy).toHaveBeenCalledTimes(1); // Verify spy call
		});
	});

	// --- handleChat ---
	describe("handleChat", () => {
		it("should return chat response on successful GCF call", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			// Mock the fetch spy's behavior for the GCF call
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ response: MOCK_CHAT_RESPONSE_LOCAL }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const request = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Context", message: "User query" }),
			});

			const response = await handleChat(request, mockEnv);
			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				status?: string;
				response?: string;
			};
			expect(body).toEqual({
				status: "success",
				response: MOCK_CHAT_RESPONSE_LOCAL, // Use local constant
			});
			expect(mockedAuth).toHaveBeenCalledTimes(1);
			expect(fetchSpy).toHaveBeenCalledTimes(1); // Check fetch spy was called
			expect(fetchSpy).toHaveBeenCalledWith(
				"http://fake-gcf/chat",
				expect.anything(),
			);
		});

		it("should return 401 if authentication fails", async () => {
			const authErrorResponse = new Response(
				JSON.stringify({ status: "error", message: "Auth failed" }),
				{ status: 401 },
			);
			mockedAuth.mockResolvedValue({
				status: "error",
				response: authErrorResponse,
			});

			const request = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer invalid",
				},
				body: JSON.stringify({ content: "Context", message: "User query" }),
			});

			const response = await handleChat(request, mockEnv);
			expect(response).toBe(authErrorResponse);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("should return 400 if content or message is missing", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const request = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Context only" }), // Missing message
			});
			const response = await handleChat(request, mockEnv);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe(
				"Missing 'content' or 'message' in request body",
			);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("should return 503 if GCF URL is not configured", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const envWithoutUrl = { ...mockEnv, GCF_CHAT_URL: "" };
			const request = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Context", message: "Query" }),
			});
			const response = await handleChat(request, envWithoutUrl);
			expect(response.status).toBe(503);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe("AI chat service URL is not configured.");
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("should return 500 if GCF secret is not configured", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const envWithoutSecret = { ...mockEnv, GCF_AUTH_SECRET: "" };
			const request = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Context", message: "Query" }),
			});
			const response = await handleChat(request, envWithoutSecret);
			expect(response.status).toBe(500);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe(
				"Worker is missing configuration for backend authentication.",
			);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		// This test remains largely the same, relying on the direct fetch mock now.
		it("should return 200 when GCF call succeeds (using direct fetch mock)", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			// Mock the fetch spy's behavior
			fetchSpy.mockResolvedValueOnce(
				new Response(JSON.stringify({ response: MOCK_CHAT_RESPONSE_LOCAL }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);

			const request = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Context", message: "Query" }),
			});
			const response = await handleChat(request, mockEnv);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { response?: string };
			expect(body.response).toBe(MOCK_CHAT_RESPONSE_LOCAL);
			expect(fetchSpy).toHaveBeenCalledTimes(1); // Verify spy call
		});
	});
});
