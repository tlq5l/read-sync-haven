// bondwise-worker/src/handlers/api.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "../auth"; // Import the auth module to mock it
import type { Env } from "../types";
import { handleChat, handleSummarize } from "./api";

// Mock the global fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
	let mockEnv: Env;
	const testUserId = "user_api_test_456";

	beforeEach(() => {
		// Reset mocks before each test
		mockFetch.mockReset();
		mockedAuth.mockReset();

		// Mock environment variables
		mockEnv = {
			GCF_SUMMARIZE_URL: "http://fake-gcf/summarize",
			GCF_CHAT_URL: "http://fake-gcf/chat",
			GCF_AUTH_SECRET: "test-secret",
			// Add other required Env properties
			SAVED_ITEMS_KV: {} as KVNamespace,
			CLERK_SECRET_KEY: "test_secret_key",
			CLERK_PUBLISHABLE_KEY: "test_pub_key",
			GEMINI_API_KEY: "",
			GCLOUD_PROJECT_NUMBER: "",
			GCLOUD_WORKLOAD_IDENTITY_POOL_ID: "",
			GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: "",
			GCLOUD_SERVICE_ACCOUNT_EMAIL: "",
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- handleSummarize ---
	describe("handleSummarize", () => {
		it("should return summary on successful GCF call", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ summary: "Test summary" }), {
					status: 200,
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
			expect(body).toEqual({ status: "success", summary: "Test summary" });
			expect(mockedAuth).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith(
				mockEnv.GCF_SUMMARIZE_URL,
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"Content-Type": "application/json",
						"X-Worker-Authorization": `Bearer ${mockEnv.GCF_AUTH_SECRET}`,
					}),
					body: JSON.stringify({ content: "Some text to summarize" }),
				}),
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
			expect(response).toBe(authErrorResponse); // Should return the exact response from auth
			expect(mockFetch).not.toHaveBeenCalled();
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
			expect(mockFetch).not.toHaveBeenCalled();
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
			expect(mockFetch).not.toHaveBeenCalled();
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
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("should return 502 if GCF call fails", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			mockFetch.mockResolvedValue(
				new Response("Internal GCF Error", { status: 500 }),
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
			expect(response.status).toBe(502); // Bad Gateway
			const body = (await response.json()) as { message?: string };
			expect(body.message).toContain("Summarization service request failed");
		});

		it("should return 502 if GCF response is invalid", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ wrong_field: "data" }), { status: 200 }),
			); // Missing 'summary'

			const request = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Some text" }),
			});

			const response = await handleSummarize(request, mockEnv);
			expect(response.status).toBe(502);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe(
				"Summarization service returned an invalid response.",
			);
		});
	});

	// --- handleChat ---
	describe("handleChat", () => {
		it("should return chat response on successful GCF call", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ response: "Test chat response" }), {
					status: 200,
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
				response: "Test chat response",
			});
			expect(mockedAuth).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith(
				mockEnv.GCF_CHAT_URL,
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"Content-Type": "application/json",
						"X-Worker-Authorization": `Bearer ${mockEnv.GCF_AUTH_SECRET}`,
					}),
					body: JSON.stringify({ content: "Context", message: "User query" }),
				}),
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
			expect(mockFetch).not.toHaveBeenCalled();
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
			expect(mockFetch).not.toHaveBeenCalled();
		});

		// Add tests similar to handleSummarize for missing URL/secret, GCF failure, invalid GCF response
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
			expect(mockFetch).not.toHaveBeenCalled();
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
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it("should return 502 if GCF call fails", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			mockFetch.mockResolvedValue(new Response("GCF Error", { status: 500 }));
			const request = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Context", message: "Query" }),
			});
			const response = await handleChat(request, mockEnv);
			expect(response.status).toBe(502);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toContain("Chat service request failed");
		});

		it("should return 502 if GCF response is invalid", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			mockFetch.mockResolvedValue(
				new Response(JSON.stringify({ wrong: "data" }), { status: 200 }),
			); // Missing 'response'
			const request = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify({ content: "Context", message: "Query" }),
			});
			const response = await handleChat(request, mockEnv);
			expect(response.status).toBe(502);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe("Chat service returned an invalid response.");
		});
	});
});
