// bondwise-worker/src/index.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "./index"; // Import the default export from index.ts
import type { Env, WorkerArticle } from "./types";
import * as auth from "./auth"; // Import the auth module to mock it
import { createUserItemKey } from "./utils";

// Mock the authenticateRequestWithClerk function from the auth module
vi.mock("./auth", async (importOriginal) => {
	const actual = await importOriginal<typeof auth>();
	return {
		...actual,
		authenticateRequestWithClerk: vi.fn(),
	};
});
const mockedAuth = vi.mocked(auth.authenticateRequestWithClerk);

// Mock global fetch for GCF calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to get bindings provided by vitest-environment-miniflare
// We need to declare this, but the environment provides the implementation
declare const getMiniflareBindings: () => Env;
// ExecutionContext is not provided globally, we'll mock it simply

describe("Worker Integration Tests", () => {
	let env: Env; // Will be populated by getMiniflareBindings()
    let ctx: ExecutionContext; // Will be mocked
	const testUserId = "user_integration_789";
    const testArticleId = "article_integ_1";
    const testArticle: WorkerArticle = {
        _id: testArticleId, userId: testUserId, url: "http://integration.test/1", title: "Integration Test Article", type: "article", savedAt: Date.now(), isRead: false, favorite: false, siteName: "Integration", estimatedReadTime: 2,
    };

	beforeEach(async () => {
		// Reset mocks
		mockedAuth.mockReset();
		mockFetch.mockReset();

		// Get bindings from Miniflare
		const bindings = getMiniflareBindings();
	       // Manually add the vars and secrets needed for tests
	       env = {
	           ...bindings, // Spread the bindings (like SAVED_ITEMS_KV)
	           GCF_SUMMARIZE_URL: "http://fake-gcf.test/summarize",
	           GCF_CHAT_URL: "http://fake-gcf.test/chat",
	           CLERK_SECRET_KEY: "TEST_CLERK_SECRET_KEY",
	           CLERK_PUBLISHABLE_KEY: "TEST_CLERK_PUBLISHABLE_KEY",
	           GCF_AUTH_SECRET: "TEST_GCF_SECRET",
	           // Add other required Env properties with dummy values if needed
	           GEMINI_API_KEY: "",
	           GCLOUD_PROJECT_NUMBER: "",
	           GCLOUD_WORKLOAD_IDENTITY_POOL_ID: "",
	           GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: "",
	           GCLOUD_SERVICE_ACCOUNT_EMAIL: "",
	       };

	       // Create a simple mock ExecutionContext
	       ctx = {
	           waitUntil: vi.fn((promise) => promise),
            passThroughOnException: vi.fn(),
        } as unknown as ExecutionContext;

        // Clear KV before each test using the env provided by Miniflare
        const kv = env.SAVED_ITEMS_KV;
        const list = await kv.list();
        const keys = list.keys.map(k => k.name);
        // Vitest-miniflare doesn't directly support deleteMany in older versions, do it manually
        for (const key of keys) {
            await kv.delete(key);
        }
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
            const authErrorResponse = new Response(JSON.stringify({ message: "Auth Failed" }), { status: 401 });
            mockedAuth.mockResolvedValue({ status: "error", response: authErrorResponse });
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
                     const postBody = (await postRes.json()) as { status?: string; item?: WorkerArticle };
                     expect(postBody.status).toBe("success");
            expect(postBody.item).toEqual(testArticle); // Check returned item

            // Verify in KV (using the environment binding)
            const kvValue = await env.SAVED_ITEMS_KV.get(createUserItemKey(testUserId, testArticleId));
            expect(kvValue).toBe(JSON.stringify(testArticle));

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
            const invalidArticle = { ...testArticle, title: undefined };
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
            // Pre-populate KV
            await env.SAVED_ITEMS_KV.put(createUserItemKey(testUserId, testArticleId), JSON.stringify(testArticle));

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
            // Pre-populate KV
            await env.SAVED_ITEMS_KV.put(key, JSON.stringify(testArticle));
            expect(await env.SAVED_ITEMS_KV.get(key)).toBe(JSON.stringify(testArticle)); // Verify setup

            // DELETE
            const req = new Request(`http://worker/items/${testArticleId}`, { method: "DELETE" });
            const res = await worker.fetch(req, env, ctx);
                     expect(res.status).toBe(200);
                     const body = (await res.json()) as { status?: string };
                     expect(body.status).toBe("success");

            // Verify deletion
            expect(await env.SAVED_ITEMS_KV.get(key)).toBeNull();
        });
    });

    // --- /api Endpoints ---
    describe("/api", () => {
        const summarizeContent = { content: "Text to summarize" };
        const chatContent = { content: "Chat context", message: "User message" };

        it("POST /api/summarize should call GCF and return summary", async () => {
            mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
            mockFetch.mockResolvedValue(new Response(JSON.stringify({ summary: "Mock summary" }), { status: 200 }));

            const req = new Request("http://worker/api/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
                body: JSON.stringify(summarizeContent),
            });
            const res = await worker.fetch(req, env, ctx);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body).toEqual({ status: "success", summary: "Mock summary" });
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith(env.GCF_SUMMARIZE_URL, expect.anything());
        });

        it("POST /api/chat should call GCF and return response", async () => {
            mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
            mockFetch.mockResolvedValue(new Response(JSON.stringify({ response: "Mock chat response" }), { status: 200 }));

            const req = new Request("http://worker/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
                body: JSON.stringify(chatContent),
            });
            const res = await worker.fetch(req, env, ctx);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body).toEqual({ status: "success", response: "Mock chat response" });
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith(env.GCF_CHAT_URL, expect.anything());
        });

        it("POST /api/summarize should return 401 if auth fails", async () => {
            const authErrorResponse = new Response(JSON.stringify({ message: "Auth Failed" }), { status: 401 });
            mockedAuth.mockResolvedValue({ status: "error", response: authErrorResponse });
             const req = new Request("http://worker/api/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer invalid" },
                body: JSON.stringify(summarizeContent),
            });
            const res = await worker.fetch(req, env, ctx);
            expect(res).toBe(authErrorResponse);
            expect(mockFetch).not.toHaveBeenCalled();
        });

         it("POST /api/chat should return 401 if auth fails", async () => {
            const authErrorResponse = new Response(JSON.stringify({ message: "Auth Failed" }), { status: 401 });
            mockedAuth.mockResolvedValue({ status: "error", response: authErrorResponse });
             const req = new Request("http://worker/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer invalid" },
                body: JSON.stringify(chatContent),
            });
            const res = await worker.fetch(req, env, ctx);
            expect(res).toBe(authErrorResponse);
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("POST /api/summarize should return 502 if GCF fetch fails", async () => {
            mockedAuth.mockResolvedValue({ status: "success", userId: testUserId });
            mockFetch.mockResolvedValue(new Response("GCF Down", { status: 500 }));
             const req = new Request("http://worker/api/summarize", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer valid" },
                body: JSON.stringify(summarizeContent),
            });
            const res = await worker.fetch(req, env, ctx);
            expect(res.status).toBe(502);
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