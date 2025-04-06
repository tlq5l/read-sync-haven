// bondwise-worker/src/index.test.ts

import type { ExecutionContext } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as auth from "./auth"; // Import the auth module to mock it
import worker from "./index"; // Import the worker module directly
import type { Env, WorkerArticle } from "./types";
import { createUserItemKey } from "./utils";
// import { server } from '../../src/mocks/server'; // Cannot import due to rootDir constraint

// Mock the authenticateRequestWithClerk function from the auth module
vi.mock("./auth", async (importOriginal) => {
	const actual = await importOriginal<typeof auth>();
	return {
		...actual,
		authenticateRequestWithClerk: vi.fn(),
	};
});
const mockedAuth = vi.mocked(auth.authenticateRequestWithClerk);

// We will rely on MSW to intercept fetch calls now
// const mockFetch = vi.fn();
// global.fetch = mockFetch;

// Mock KV Namespace for tests
class MockKVNamespace {
	private store = new Map<string, string>();

	async get(key: string) {
		return this.store.get(key) || null;
	}

	async put(key: string, value: string) {
		this.store.set(key, value);
		return null;
	}

	async delete(key: string) {
		this.store.delete(key);
		return null;
	}

	async list(options?: { prefix?: string }) {
		const keys = [];
		const prefix = options?.prefix || "";
		for (const key of this.store.keys()) {
			if (key.startsWith(prefix)) {
				keys.push({ name: key });
			}
		}
		return { keys };
	}
}
// ExecutionContext is not provided globally, we'll mock it simply (though likely unused now)
describe("Worker Integration Tests", () => {
	let env: Env;
	let ctx: ExecutionContext;
	const testUserId = "user_integration_789";
	const testArticleId = "article_integ_1";
	const testArticle: WorkerArticle = {
		_id: testArticleId,
		userId: testUserId,
		url: "http://integration.test/1",
		title: "Integration Test Article",
		type: "article",
		savedAt: Date.now(),
		isRead: false,
		favorite: false,
		siteName: "Integration",
		estimatedReadTime: 2,
		content: "<h1>Integration Test Content</h1><p>More text.</p>", // Added content
	};

	beforeEach(async () => {
		// Reset mocks
		mockedAuth.mockReset();
		// mockFetch.mockReset(); // No longer needed

		// Create a mock KV namespace
		const mockKV = new MockKVNamespace();

		// Create a simple mock ExecutionContext
		ctx = {
			waitUntil: vi.fn((promise) => promise),
			passThroughOnException: vi.fn(),
		} as unknown as ExecutionContext;

		// Create the env object with our mocks
		env = {
			SAVED_ITEMS_KV: mockKV as any,
			CLERK_SECRET_KEY: "test-clerk-key",
			CLERK_PUBLISHABLE_KEY: "test-clerk-pub-key",
			GEMINI_API_KEY: "test-gemini-key",
			GCF_SUMMARIZE_URL: "http://fake-gcf.test/summarize",
			GCF_CHAT_URL: "http://fake-gcf.test/chat",
			GCF_AUTH_SECRET: "test-auth-secret",
			GCLOUD_PROJECT_NUMBER: "123456",
			GCLOUD_WORKLOAD_IDENTITY_POOL_ID: "test-pool",
			GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: "test-provider",
			GCLOUD_SERVICE_ACCOUNT_EMAIL: "test@example.com",
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- Root Endpoint ---
	it("GET / should return status ok", async () => {
		const req = new Request("http://worker/");
		const res = await worker.fetch(req, env, ctx);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status?: string; message?: string };
		expect(body.status).toBe("ok");
		expect(body.message).toContain("Bondwise Sync API is running");
	});

	// --- /items Endpoints ---
	describe("/items", () => {
		it("GET /items should return 401 if not authenticated", async () => {
			const authErrorResponse = new Response(
				JSON.stringify({ message: "Auth Failed" }),
				{ status: 401 },
			);
			mockedAuth.mockResolvedValue({
				status: "error",
				response: authErrorResponse,
			});
			const req = new Request("http://worker/items");
			const res = await worker.fetch(req, env, ctx);
			expect(res).toBe(authErrorResponse);
		});

		it("GET /items should return empty array when no items exist", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const req = new Request("http://worker/items");
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual([]);
		});

		it("POST /items should create an item and GET /items should retrieve it", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });

			// POST
			const postReq = new Request("http://worker/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(testArticle),
			});
			const postRes = await worker.fetch(postReq, env, ctx);
			expect(postRes.status).toBe(201);
			const postBody = (await postRes.json()) as {
				status?: string;
				item?: WorkerArticle;
			};
			expect(postBody.status).toBe("success");
			expect(postBody.item).toEqual(testArticle); // Check returned item

			// Verify in KV using our mock
			const kvValue = await env.SAVED_ITEMS_KV.get(
				createUserItemKey(testUserId, testArticleId),
			);
			expect(JSON.parse(kvValue ?? "{}")).toEqual(testArticle); // Compare parsed objects

			// GET List
			const getReq = new Request("http://worker/items");
			const getRes = await worker.fetch(getReq, env, ctx);
			expect(getRes.status).toBe(200);
			const getBody = (await getRes.json()) as WorkerArticle[];
			expect(getBody).toHaveLength(1);
			expect(getBody[0]).toEqual(testArticle);
		});

		it("POST /items should return 400 for invalid data", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			// Add content to satisfy validation, title is still undefined
			const invalidArticle = {
				...testArticle,
				title: undefined,
				content: "Some content",
			};
			const req = new Request("http://worker/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(invalidArticle),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(400);
			const body = (await res.json()) as { message?: string };
			expect(body.message).toContain("Invalid article data");
		});

		it("GET /items/:id should retrieve a specific item", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			// Pre-populate KV using our mock
			await env.SAVED_ITEMS_KV.put(
				createUserItemKey(testUserId, testArticleId),
				JSON.stringify(testArticle),
			);

			const req = new Request(`http://worker/items/${testArticleId}`);
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual(testArticle);
		});

		it("GET /items/:id should return 404 for non-existent item", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const req = new Request("http://worker/items/not-real");
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(404);
		});

		it("DELETE /items/:id should delete an item", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			const key = createUserItemKey(testUserId, testArticleId);
			// Pre-populate KV using our mock
			await env.SAVED_ITEMS_KV.put(key, JSON.stringify(testArticle));
			expect(await env.SAVED_ITEMS_KV.get(key)).toBe(
				JSON.stringify(testArticle),
			); // Verify setup

			// DELETE
			const req = new Request(`http://worker/items/${testArticleId}`, {
				method: "DELETE",
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = (await res.json()) as { status?: string };
			expect(body.status).toBe("success");

			// Verify deletion
			expect(await env.SAVED_ITEMS_KV.get(key)).toBeNull(); // Verify deletion
		});
	});

	// --- /api Endpoints ---
	describe("/api", () => {
		const summarizeContent = { content: "Text to summarize" };
		const chatContent = { content: "Chat context", message: "User message" };

		it("POST /api/summarize should call GCF and return summary", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			// MSW will handle the response based on the handler in src/mocks/handlers.ts

			const req = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify(summarizeContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				status: "success",
				summary: "Fake GCF Summary (.test)",
			}); // Match MSW handler response
			// expect(mockFetch).toHaveBeenCalledTimes(1); // MSW handles this now
			// expect(mockFetch).toHaveBeenCalledWith( // MSW handles this now
			// 	"http://fake-gcf.test/summarize",
			// 	expect.anything(),
			// );
		});

		it("POST /api/chat should call GCF and return response", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
			// MSW will handle the response based on the handler in src/mocks/handlers.ts

			const req = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify(chatContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({
				status: "success",
				response: "Fake GCF Chat Response (.test)", // Match MSW handler response
			});
			// expect(mockFetch).toHaveBeenCalledTimes(1); // MSW handles this now
			// expect(mockFetch).toHaveBeenCalledWith( // MSW handles this now
			// 	"http://fake-gcf.test/chat",
			// 	expect.anything(),
			// );
		});

		it("POST /api/summarize should return 401 if auth fails", async () => {
			const authErrorResponse = new Response(
				JSON.stringify({ message: "Auth Failed" }),
				{ status: 401 },
			);
			mockedAuth.mockResolvedValue({
				status: "error",
				response: authErrorResponse,
			});
			const req = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer invalid",
				},
				body: JSON.stringify(summarizeContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res).toBe(authErrorResponse);
			// expect(mockFetch).not.toHaveBeenCalled(); // MSW handles this now
		});

		it("POST /api/chat should return 401 if auth fails", async () => {
			const authErrorResponse = new Response(
				JSON.stringify({ message: "Auth Failed" }),
				{ status: 401 },
			);
			mockedAuth.mockResolvedValue({
				status: "error",
				response: authErrorResponse,
			});
			const req = new Request("http://worker/api/chat", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer invalid",
				},
				body: JSON.stringify(chatContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res).toBe(authErrorResponse);
			// expect(mockFetch).not.toHaveBeenCalled(); // MSW handles this now
		});

		it("POST /api/summarize should return 502 if GCF fetch fails", async () => {
			mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });

			// Temporarily mock global fetch for this specific test to simulate GCF failure
			const fetchSpy = vi.spyOn(globalThis, "fetch");
			fetchSpy.mockResolvedValueOnce(
				new Response("GCF Error", { status: 500 }),
			);
			// Alternatively, simulate a network error:
			// fetchSpy.mockRejectedValueOnce(new Error("Network failure"));

			const req = new Request("http://worker/api/summarize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer valid",
				},
				body: JSON.stringify(summarizeContent),
			});
			const res = await worker.fetch(req, env, ctx);
			// TODO: Revisit mocking strategy. Currently cannot override MSW handler
			// for 502 failure due to TS rootDir constraint. Default handler returns 200.
			expect(res.status).toBe(502); // Expect 502 when GCF fetch fails
		});
	});

	// --- Not Found ---
	it("should return 404 for unknown routes", async () => {
		const req = new Request("http://worker/unknown/route");
		const res = await worker.fetch(req, env, ctx);
		expect(res.status).toBe(404);
		const body = (await res.json()) as { message?: string };
		expect(body.message).toBe("Endpoint not found");
	});
});
