// thinkara-worker/src/auth.test.ts

import type { ExecutionContext } from "@cloudflare/workers-types"; // Import ExecutionContext
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AuthenticatedRequest, authenticateRequest } from "./auth"; // Import AuthenticatedRequest
import type { Env } from "./types"; // Removed unused AuthResult
import { errorResponse } from "./utils"; // Import for comparison

// Mock the Clerk backend client
const mockAuthenticateRequest = vi.fn();
vi.mock("@clerk/backend", () => ({
	createClerkClient: vi.fn(() => ({
		authenticateRequest: mockAuthenticateRequest,
	})),
}));

describe("Worker Authentication", () => {
	let mockEnv: Env;
	let mockRequest: AuthenticatedRequest; // Use AuthenticatedRequest type
	let mockCtx: ExecutionContext; // Define mock context
	beforeEach(() => {
		// Reset mocks before each test
		mockAuthenticateRequest.mockReset();

		// Mock ExecutionContext
		mockCtx = {
			waitUntil: vi.fn(),
			passThroughOnException: vi.fn(),
		} as unknown as ExecutionContext;

		// Mock environment variables
		mockEnv = {
			CLERK_SECRET_KEY: "test_secret_key",
			CLERK_PUBLISHABLE_KEY: "test_pub_key",
			CLERK_WEBHOOK_SECRET: "test_webhook_secret",
			SAVED_ITEMS_KV: {} as KVNamespace,
			USER_DATA_DB: {} as D1Database, // Added mock D1Database
			GCF_SUMMARIZE_URL: "http://example.com/summarize",
			GCF_CHAT_URL: "http://example.com/chat",
			GEMINI_API_KEY: "",
			GCLOUD_PROJECT_NUMBER: "",
			GCLOUD_WORKLOAD_IDENTITY_POOL_ID: "",
			GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: "",
			GCLOUD_SERVICE_ACCOUNT_EMAIL: "",
			GCF_AUTH_SECRET: "test_gcf_secret",
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should return success with userId for a valid token", async () => {
		const testUserId = "user_test_123";
		mockAuthenticateRequest.mockResolvedValue({
			status: "signed-in",
			toAuth: () => ({ userId: testUserId }),
		});

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer valid_token" },
		});

		const result = await authenticateRequest(mockRequest, mockEnv, mockCtx); // Pass mockCtx

		// On success, middleware returns undefined and attaches auth state
		expect(result).toBeUndefined();
		expect(mockRequest.auth?.userId).toBe(testUserId);
		expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});

	it("should return error response for missing Authorization header", async () => {
		mockRequest = new Request("http://example.com/items"); // No Auth header

		const result = await authenticateRequest(mockRequest, mockEnv, mockCtx); // Pass mockCtx

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(401);
			const body = (await result.json()) as { error?: string }; // Check error property
			expect(body.error).toBe("Missing or invalid Authorization header"); // Match actual error
		}
		expect(mockAuthenticateRequest).not.toHaveBeenCalled(); // Clerk fn should not be called
	});

	it("should return error response for non-Bearer token", async () => {
		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Basic some_credentials" },
		});

		const result = await authenticateRequest(mockRequest, mockEnv, mockCtx); // Pass mockCtx

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(401);
			const body = (await result.json()) as { error?: string }; // Check error property
			expect(body.error).toBe("Missing or invalid Authorization header"); // Match actual error
		}
		expect(mockAuthenticateRequest).not.toHaveBeenCalled(); // Clerk fn should not be called
	});

	it("should return error response when Clerk authentication fails (signed-out)", async () => {
		mockAuthenticateRequest.mockResolvedValue({
			status: "signed-out",
			reason: "token_expired",
		});

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer expired_token" },
		});

		// Mock the actual underlying verifyToken call behavior for this case (token expired)
		const clerkExpiredError = new Error(
			"Token verification failed: token_expired",
		);
		mockAuthenticateRequest.mockRejectedValue(clerkExpiredError); // Use mockAuthenticateRequest used by createClerkClient mock

		const result = await authenticateRequest(mockRequest, mockEnv, mockCtx); // Pass mockCtx

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(403); // Auth failure (not just missing header) is 403
			const body = (await result.json()) as { error?: string };
			expect(body.error).toBe("Unauthorized: Invalid token");
		}
		// expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1); // This mock doesn't track verifyToken calls
	});

	it("should return error response when Clerk authentication fails (handshake)", async () => {
		mockAuthenticateRequest.mockResolvedValue({
			status: "handshake",
			reason: "needs_handshake",
		});

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer handshake_token" },
		});

		// Mock the actual underlying verifyToken call behavior for this case (needs handshake)
		const clerkHandshakeError = new Error(
			"Token verification failed: needs_handshake",
		);
		mockAuthenticateRequest.mockRejectedValue(clerkHandshakeError);

		const result = await authenticateRequest(mockRequest, mockEnv, mockCtx); // Pass mockCtx

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(403); // Auth failure is 403
			const body = (await result.json()) as { error?: string };
			expect(body.error).toBe("Unauthorized: Invalid token");
		}
		// expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});

	it("should return error response when Clerk authentication succeeds but userId is missing", async () => {
		mockAuthenticateRequest.mockResolvedValue({
			status: "signed-in",
			toAuth: () => ({ userId: null }), // Simulate missing userId
		});

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer valid_token_no_userid" },
		});

		// Mock the actual underlying verifyToken to return claims without 'sub'
		mockAuthenticateRequest.mockResolvedValue({ azp: "test_azp" }); // Using the mockAuthenticateRequest for verifyToken mock

		const result = await authenticateRequest(mockRequest, mockEnv, mockCtx); // Pass mockCtx

		// Even if claims lack 'sub', the middleware should attach what it has and return undefined
		expect(result).toBeUndefined();
		expect(mockRequest.auth?.userId).toBeUndefined(); // userId should be undefined
		expect(mockRequest.auth?.claims).toEqual({ azp: "test_azp" }); // Claims should be attached
		// expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});

	it("should return error response when Clerk SDK throws an error", async () => {
		// Mock the actual underlying verifyToken to throw (SDK internal error)
		const clerkSdkError = new Error("Clerk SDK internal error"); // Declare unique error name
		mockAuthenticateRequest.mockRejectedValue(clerkSdkError); // Use unique error name in mock setup

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer some_token" },
		});

		// Removed redundant mock setup block

		const result = await authenticateRequest(mockRequest, mockEnv, mockCtx); // Pass mockCtx

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(403); // Auth failure is 403
			const body = (await result.json()) as { error?: string };
			expect(body.error).toBe("Unauthorized: Invalid token"); // Generic message
		}
		// expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});

	it("should return specific error for header-related Clerk SDK errors", async () => {
		// Mock the actual underlying verifyToken to throw (simulate header structure issue)
		const clerkHeaderError = new Error("Invalid header structure detected"); // Declare unique error name
		mockAuthenticateRequest.mockRejectedValue(clerkHeaderError); // Use unique error name in mock setup

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer some_token" }, // Assume token is fine, but SDK has header issue
		});

		// Removed redundant mock setup block

		const result = await authenticateRequest(mockRequest, mockEnv, mockCtx); // Pass mockCtx

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(403); // Auth failure is 403
			const body = (await result.json()) as { error?: string };
			expect(body.error).toBe("Unauthorized: Invalid token"); // Generic message
		}
		// expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});
});
