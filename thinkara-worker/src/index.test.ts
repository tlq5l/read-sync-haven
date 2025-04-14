// thinkara-worker/src/index.test.ts

import type { ExecutionContext, KVNamespace, Request as CfRequest } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
// Import the *actual* auth module
import * as auth from "./auth";
// Import necessary types for the spy signature (excluding VerifyTokenFn)
import type { AuthenticatedRequest, AuthEnv } from "./auth";
import worker from "./index";
import type { Env, WorkerArticle } from "./types";
import { createUserItemKey } from "./utils";
// MSW server is setup in testSetup.ts

// Type for the authenticateRequest function signature (omitting VerifyTokenFn)
type AuthenticateRequestFn = (
    request: AuthenticatedRequest,
    env: AuthEnv,
    _ctx: ExecutionContext
) => Promise<Response | undefined>;


// Mock KV Namespace for tests
class MockKVNamespace {
	private store = new Map<string, string>();
	async get(key: string) { return this.store.get(key) || null; }
	async put(key: string, value: string) { this.store.set(key, value); }
	async delete(key: string) { this.store.delete(key); }
	async list(options?: { prefix?: string }) {
		const keys = [];
		const prefix = options?.prefix || "";
		for (const key of this.store.keys()) {
			if (key.startsWith(prefix)) { keys.push({ name: key }); }
		}
		return { keys, list_complete: true, cursor: undefined };
	}
}

describe("Worker Integration Tests", { timeout: 10000 }, () => {
	let env: Env;
	let ctx: ExecutionContext;
	// Declare the spy variable with the correct function signature type
	let authSpy: MockInstance<AuthenticateRequestFn>;

	const testUserId = "user_integration_789";
	const testAuthContext = { userId: testUserId, claims: { /* Add claims if needed */ } };
	const testArticleId = "article_integ_1";
	const testArticle: WorkerArticle = {
		_id: testArticleId, userId: testUserId, url: "http://integration.test/1",
		title: "Integration Test Article", type: "article", savedAt: Date.now(),
		isRead: false, favorite: false, siteName: "Integration",
		estimatedReadTime: 2, content: "<h1>Integration Test Content</h1><p>More text.</p>",
	};

	// Helper using vi.spyOn().mockImplementationOnce()
	const mockSuccessfulAuth = () => {
        // Implementation must match the (simplified) AuthenticateRequestFn signature
		authSpy.mockImplementationOnce(async (request /*, env, _ctx */) => {
			Object.assign(request, { auth: testAuthContext });
			return undefined;
		});
	};

	// Helper using vi.spyOn().mockResolvedValueOnce()
	const mockFailedAuth = (status = 401) => {
		const authErrorResponse = new Response(JSON.stringify({ message: "Auth Failed" }), { status });
		authSpy.mockResolvedValueOnce(authErrorResponse);
		return authErrorResponse;
	};

	beforeEach(async () => {
        // Spy on the actual authenticateRequest before each test
        authSpy = vi.spyOn(auth, 'authenticateRequest') as MockInstance<AuthenticateRequestFn>;

		const mockKV = new MockKVNamespace();

		ctx = {
			waitUntil: vi.fn(async (promise) => { await promise; }),
			passThroughOnException: vi.fn(),
		} as unknown as ExecutionContext;

		env = {
			SAVED_ITEMS_KV: mockKV as any,
			USER_DATA_DB: null as any,
			CLERK_SECRET_KEY: "test-clerk-key",
			CLERK_PUBLISHABLE_KEY: "test-clerk-pub-key",
			CLERK_WEBHOOK_SECRET: "test-webhook-secret",
			GEMINI_API_KEY: "test-gemini-key",
			GCF_SUMMARIZE_URL: "http://fake-gcf.test/summarize",
			GCF_CHAT_URL: "http://fake-gcf.test/chat",
			GCF_AUTH_SECRET: "test-auth-secret",
			GCLOUD_PROJECT_NUMBER: "123456",
			GCLOUD_WORKLOAD_IDENTITY_POOL_ID: "test-pool",
			GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: "test-provider",
			GCLOUD_SERVICE_ACCOUNT_EMAIL: "test@example.com",
		};
        mockKV['store'].clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- Root Endpoint ---
	it("GET / should return status ok", async () => {
		const req = new Request("http://worker/");
		const res = await worker.fetch(req, env, ctx);
		expect(res.status).toBe(200);
		const body = await res.json() as { status?: string; message?: string };
		expect(body.status).toBe("ok");
	});

	// --- /items Endpoints ---
	describe("/items", () => {
		it("GET /items should return 401 if not authenticated", async () => {
			const authErrorResponse = mockFailedAuth(401);
			const req = new Request("http://worker/items");
			const res = await worker.fetch(req, env, ctx);
			expect(res).toBe(authErrorResponse);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("GET /items should return empty array when no items exist", async () => {
			mockSuccessfulAuth();
			const req = new Request("http://worker/items");
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual([]);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("POST /items should create an item and GET /items should retrieve it", async () => {
			mockSuccessfulAuth(); // Auth for POST
			const postReq = new Request("http://worker/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(testArticle),
			});
			const postRes = await worker.fetch(postReq, env, ctx);
			expect(postRes.status).toBe(201);
			const postBody = await postRes.json() as { status?: string; item?: WorkerArticle };
			expect(postBody.status).toBe("success");
			expect(postBody.item).toEqual(testArticle);
			expect(authSpy).toHaveBeenCalledTimes(1);

			const kvKey = createUserItemKey(testUserId, testArticleId);
			const kvValue = await env.SAVED_ITEMS_KV.get(kvKey);
			expect(kvValue).not.toBeNull();
			expect(JSON.parse(kvValue ?? "{}")).toEqual(testArticle);

			mockSuccessfulAuth(); // Re-mock auth for GET
			const getReq = new Request("http://worker/items");
			const getRes = await worker.fetch(getReq, env, ctx);
			expect(getRes.status).toBe(200);
			const getBody = await getRes.json() as WorkerArticle[];
			expect(getBody).toHaveLength(1);
			expect(getBody[0]).toEqual(testArticle);
			expect(authSpy).toHaveBeenCalledTimes(2);
		});

		it("POST /items should return 400 for invalid data", async () => {
			mockSuccessfulAuth();
			const invalidArticle = { ...testArticle, title: undefined };
			const req = new Request("http://worker/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(invalidArticle),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(400);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("GET /items/:id should retrieve a specific item", async () => {
			mockSuccessfulAuth();
			const kvKey = createUserItemKey(testUserId, testArticleId);
			await env.SAVED_ITEMS_KV.put(kvKey, JSON.stringify(testArticle));
			const req = new Request(`http://worker/items/${testArticleId}`);
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual(testArticle);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("GET /items/:id should return 404 for non-existent item", async () => {
			mockSuccessfulAuth();
			const req = new Request("http://worker/items/not-real");
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(404);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("DELETE /items/:id should delete an item", async () => {
			mockSuccessfulAuth();
			const key = createUserItemKey(testUserId, testArticleId);
			await env.SAVED_ITEMS_KV.put(key, JSON.stringify(testArticle));
			expect(await env.SAVED_ITEMS_KV.get(key)).toBe(JSON.stringify(testArticle));
			const req = new Request(`http://worker/items/${testArticleId}`, { method: "DELETE" });
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			expect(authSpy).toHaveBeenCalledTimes(1);
			expect(await env.SAVED_ITEMS_KV.get(key)).toBeNull();
		});
	});

	// --- /api Endpoints ---
	describe("/api", () => {
		const summarizeContent = { content: "Text to summarize" };
		const chatContent = { content: "Chat context", message: "User message" };

		it("POST /api/summarize should call GCF and return summary", async () => {
			mockSuccessfulAuth();
			const req = new Request("http://worker/api/summarize", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify(summarizeContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ status: "success", summary: "Fake GCF Summary (.test)" });
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("POST /api/chat should call GCF and return response", async () => {
			mockSuccessfulAuth();
			const req = new Request("http://worker/api/chat", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify(chatContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body).toEqual({ status: "success", response: "Fake GCF Chat Response (.test)" });
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("POST /api/summarize should return 401 if auth fails", async () => {
			const authErrorResponse = mockFailedAuth(401);
			const req = new Request("http://worker/api/summarize", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify(summarizeContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res).toBe(authErrorResponse);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("POST /api/chat should return 401 if auth fails", async () => {
			const authErrorResponse = mockFailedAuth(401);
			const req = new Request("http://worker/api/chat", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify(chatContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res).toBe(authErrorResponse);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("POST /api/summarize should return 502 if GCF fetch fails (via MSW)", async () => {
			mockSuccessfulAuth();
			// TODO: Ensure MSW handler for error exists
			const req = new Request("http://worker/api/summarize", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify(summarizeContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(502);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});

		it("POST /api/chat should return 502 if GCF fetch fails (via MSW)", async () => {
			mockSuccessfulAuth();
			// TODO: Ensure MSW handler for error exists
			const req = new Request("http://worker/api/chat", {
				method: "POST", headers: { "Content-Type": "application/json" },
				body: JSON.stringify(chatContent),
			});
			const res = await worker.fetch(req, env, ctx);
			expect(res.status).toBe(502);
			expect(authSpy).toHaveBeenCalledTimes(1);
		});
	});

	// --- Not Found ---
	it("should return 404 for unknown routes", async () => {
		const req = new Request("http://worker/unknown/route");
		const res = await worker.fetch(req, env, ctx);
		expect(res.status).toBe(404);
		const body = await res.json() as { message?: string };
		expect(body.message).toBe("Endpoint not found");
		// Auth spy should *not* have been called for a 404 route
		// Need to check if authSpy exists because beforeEach might not run if describe block is skipped
		if (authSpy) {
            expect(authSpy).not.toHaveBeenCalled();
        }
	});
});
