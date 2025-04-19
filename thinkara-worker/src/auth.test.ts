// thinkara-worker/src/auth.test.ts

import type { JwtPayload } from "@clerk/types";
import type { ExecutionContext } from "@cloudflare/workers-types"; // Import ExecutionContext
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Import the function to test using standard import
import { type AuthenticatedRequest, authenticateRequest } from "./auth";
import type { Env } from "./types";
import { errorResponse } from "./utils";
// No longer importing from testSetup

// Declare the mock function locally for this test suite
const mockVerifyToken = vi.fn();

describe("Worker Authentication", () => {
	let mockEnv: Env;
	let mockRequest: AuthenticatedRequest; // Use AuthenticatedRequest type
	let mockCtx: ExecutionContext; // Define mock context

	beforeEach(() => {
		// Reset the local mock before each test
		mockVerifyToken.mockReset();

		// Mock ExecutionContext
		mockCtx = {
			waitUntil: vi.fn(),
			passThroughOnException: vi.fn(),
		} as unknown as ExecutionContext;

		// Mock environment variables
		mockEnv = {
			CLERK_SECRET_KEY: "test_secret_key",
			// Keep other env vars as needed by tests or other modules
			CLERK_PUBLISHABLE_KEY: "test_pub_key",
			CLERK_WEBHOOK_SECRET: "test_webhook_secret",
			SAVED_ITEMS_KV: {} as KVNamespace,
			USER_DATA_DB: {} as D1Database,
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
		// Vitest automatically handles restoring original implementations when mocks are declared with vi.fn() locally
		// No need for vi.clearAllMocks() or vi.restoreAllMocks() here for the local mockVerifyToken
	});

	it("should return success with userId for a valid token", async () => {
		const testUserId = "user_test_123";
		// Add missing required JwtPayload fields with placeholder values
		const mockClaims: JwtPayload = {
			__raw: "mock_raw_token", // Required placeholder
			sid: "mock_session_id", // Required placeholder
			sub: testUserId, // 'sub' holds the user ID
			azp: "test_azp",
			iss: "https://clerk.example.com",
			nbf: Math.floor(Date.now() / 1000) - 60, // Not Before: 1 min ago
			exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
			iat: Math.floor(Date.now() / 1000),
		};
		// Configure the local mock
		mockVerifyToken.mockResolvedValue(mockClaims);

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer valid_token" },
		});

		// Pass the local mock function as the last argument
		const result = await authenticateRequest(
			mockRequest,
			mockEnv,
			mockCtx,
			mockVerifyToken,
		);

		// On success, middleware returns undefined and attaches auth state
		expect(result).toBeUndefined();
		expect(mockRequest.auth?.userId).toBe(testUserId);
		expect(mockRequest.auth?.claims).toEqual(mockClaims);
		expect(mockVerifyToken).toHaveBeenCalledTimes(1);
		// Verify arguments passed to verifyToken
		expect(mockVerifyToken).toHaveBeenCalledWith("valid_token", {
			secretKey: mockEnv.CLERK_SECRET_KEY,
		});
	});

	it("should return error response for missing Authorization header", async () => {
		mockRequest = new Request("http://example.com/items"); // No Auth header

		// Pass the local mock (though it won't be called)
		const result = await authenticateRequest(
			mockRequest,
			mockEnv,
			mockCtx,
			mockVerifyToken,
		);

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(401);
			const body = (await result.json()) as { error?: string }; // Check error property
			expect(body.error).toBe("Missing or invalid Authorization header"); // Match actual error
		}
		expect(mockVerifyToken).not.toHaveBeenCalled(); // verifyToken should not be called
	});

	it("should return error response for non-Bearer token", async () => {
		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Basic some_credentials" },
		});

		// Pass the local mock
		const result = await authenticateRequest(
			mockRequest,
			mockEnv,
			mockCtx,
			mockVerifyToken,
		);

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(401);
			const body = (await result.json()) as { error?: string }; // Check error property
			expect(body.error).toBe("Missing or invalid Authorization header"); // Match actual error
		}
		expect(mockVerifyToken).not.toHaveBeenCalled(); // verifyToken should not be called
	});

	it("should return 403 error response when Clerk token verification fails (e.g., expired)", async () => {
		// Mock verifyToken to reject with an error simulating expiration
		const clerkExpiredError = new Error(
			"Token verification failed: token_expired",
		);
		// Configure the local mock
		mockVerifyToken.mockRejectedValue(clerkExpiredError);

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer expired_token" },
		});

		// Pass the local mock
		const result = await authenticateRequest(
			mockRequest,
			mockEnv,
			mockCtx,
			mockVerifyToken,
		);

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(403); // Auth failure (not just missing header) is 403
			const body = (await result.json()) as { error?: string };
			expect(body.error).toBe("Unauthorized: Invalid token");
		}
		expect(mockVerifyToken).toHaveBeenCalledTimes(1);
		expect(mockVerifyToken).toHaveBeenCalledWith("expired_token", {
			secretKey: mockEnv.CLERK_SECRET_KEY,
		});
	});

	// Combine other failure cases like 'handshake' into a generic verification failure test
	it("should return 403 error response for other Clerk token verification failures", async () => {
		const clerkVerificationError = new Error(
			"Token verification failed: invalid_signature", // Example reason
		);
		// Configure the local mock
		mockVerifyToken.mockRejectedValue(clerkVerificationError);

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer invalid_token" },
		});

		// Pass the local mock
		const result = await authenticateRequest(
			mockRequest,
			mockEnv,
			mockCtx,
			mockVerifyToken,
		);

		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(403);
			const body = (await result.json()) as { error?: string };
			expect(body.error).toBe("Unauthorized: Invalid token");
		}
		expect(mockVerifyToken).toHaveBeenCalledTimes(1);
	});

	it("should succeed but have null userId when verifyToken returns claims without 'sub'", async () => {
		// Add missing required JwtPayload fields, omit 'sub' property
		const mockClaimsNoSub = {
			__raw: "mock_raw_token_no_sub",
			sid: "mock_session_id_no_sub",
			azp: "test_azp",
			iss: "https://clerk.example.com",
			nbf: Math.floor(Date.now() / 1000) - 60,
			exp: Math.floor(Date.now() / 1000) + 3600,
			iat: Math.floor(Date.now() / 1000),
			// 'sub' property is intentionally omitted here
		};
		// Cast to JwtPayload to satisfy the type checker for the mock setup,
		// even though 'sub' is technically missing from the object itself.
		// Configure the local mock
		mockVerifyToken.mockResolvedValue(mockClaimsNoSub as JwtPayload);

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer valid_token_no_userid" },
		});

		// Pass the local mock
		const result = await authenticateRequest(
			mockRequest,
			mockEnv,
			mockCtx,
			mockVerifyToken,
		);

		// Even if claims lack 'sub', the middleware should attach what it has and return undefined
		expect(result).toBeUndefined();
		// Check for null now due to ?? null in authenticateRequest
		expect(mockRequest.auth?.userId).toBeNull();
		// Assert against the object without 'sub'
		expect(mockRequest.auth?.claims).toEqual(mockClaimsNoSub);
		expect(mockVerifyToken).toHaveBeenCalledTimes(1);
	});

	it("should return 403 error response when Clerk SDK throws an unexpected error", async () => {
		// Mock verifyToken to throw an unexpected SDK error
		const clerkSdkError = new Error("Clerk SDK internal error");
		// Configure the local mock
		mockVerifyToken.mockRejectedValue(clerkSdkError);

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer some_token" },
		});

		// Pass the local mock
		const result = await authenticateRequest(
			mockRequest,
			mockEnv,
			mockCtx,
			mockVerifyToken,
		);

		// On error, middleware returns a Response
		expect(result).toBeInstanceOf(Response);
		if (result instanceof Response) {
			expect(result.status).toBe(403); // Auth failure is 403
			const body = (await result.json()) as { error?: string };
			expect(body.error).toBe("Unauthorized: Invalid token"); // Generic message
		}
		expect(mockVerifyToken).toHaveBeenCalledTimes(1);
	});

	// Removed redundant header-related error test, covered by generic failure cases
});
