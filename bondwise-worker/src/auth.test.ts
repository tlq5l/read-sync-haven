// bondwise-worker/src/auth.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { authenticateRequestWithClerk } from "./auth";
import type { Env, AuthResult } from "./types";
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
	let mockRequest: Request;

	beforeEach(() => {
		// Reset mocks before each test
		mockAuthenticateRequest.mockReset();

		// Mock environment variables
		mockEnv = {
			CLERK_SECRET_KEY: "test_secret_key",
			CLERK_PUBLISHABLE_KEY: "test_pub_key",
			// Add other required Env properties, even if empty for this test
			SAVED_ITEMS_KV: {} as KVNamespace, // Mock KV
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

		const result = await authenticateRequestWithClerk(mockRequest, mockEnv);

		expect(result.status).toBe("success");
		// Type assertion to access userId
		expect((result as { status: "success"; userId: string }).userId).toBe(testUserId);
		expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});

	it("should return error response for missing Authorization header", async () => {
		mockRequest = new Request("http://example.com/items"); // No Auth header

		const result = await authenticateRequestWithClerk(mockRequest, mockEnv);

		expect(result.status).toBe("error");
		const response = (result as { status: "error"; response: Response }).response;
		expect(response.status).toBe(401);
		const body = (await response.json()) as { message?: string };
		expect(body.message).toBe("Missing Authorization Bearer token");
		expect(mockAuthenticateRequest).not.toHaveBeenCalled();
	});

	it("should return error response for non-Bearer token", async () => {
		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Basic some_credentials" },
		});

		const result = await authenticateRequestWithClerk(mockRequest, mockEnv);

		expect(result.status).toBe("error");
		const response = (result as { status: "error"; response: Response }).response;
		expect(response.status).toBe(401);
		const body = (await response.json()) as { message?: string };
		expect(body.message).toBe("Missing Authorization Bearer token"); // Current implementation checks prefix
		expect(mockAuthenticateRequest).not.toHaveBeenCalled();
	});

	it("should return error response when Clerk authentication fails (signed-out)", async () => {
		mockAuthenticateRequest.mockResolvedValue({
			status: "signed-out",
			reason: "token_expired",
		});

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer expired_token" },
		});

		const result = await authenticateRequestWithClerk(mockRequest, mockEnv);

		expect(result.status).toBe("error");
		const response = (result as { status: "error"; response: Response }).response;
		expect(response.status).toBe(401);
		const body = (await response.json()) as { message?: string };
		expect(body.message).toContain("Authentication failed: token_expired");
		expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});

    it("should return error response when Clerk authentication fails (handshake)", async () => {
		mockAuthenticateRequest.mockResolvedValue({
			status: "handshake",
            reason: "needs_handshake",
		});

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer handshake_token" },
		});

		const result = await authenticateRequestWithClerk(mockRequest, mockEnv);

		expect(result.status).toBe("error");
		const response = (result as { status: "error"; response: Response }).response;
		expect(response.status).toBe(401);
		const body = (await response.json()) as { message?: string };
		expect(body.message).toContain("Authentication failed: needs_handshake");
		expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});


	it("should return error response when Clerk authentication succeeds but userId is missing", async () => {
		mockAuthenticateRequest.mockResolvedValue({
			status: "signed-in",
			toAuth: () => ({ userId: null }), // Simulate missing userId
		});

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer valid_token_no_userid" },
		});

		const result = await authenticateRequestWithClerk(mockRequest, mockEnv);

		expect(result.status).toBe("error");
		const response = (result as { status: "error"; response: Response }).response;
		expect(response.status).toBe(500); // Internal error
		const body = (await response.json()) as { message?: string };
		expect(body.message).toBe(
			"Authentication succeeded but user ID could not be determined.",
		);
		expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});

	it("should return error response when Clerk SDK throws an error", async () => {
		const clerkError = new Error("Clerk SDK internal error");
		mockAuthenticateRequest.mockRejectedValue(clerkError);

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer some_token" },
		});

		const result = await authenticateRequestWithClerk(mockRequest, mockEnv);

		expect(result.status).toBe("error");
		const response = (result as { status: "error"; response: Response }).response;
		expect(response.status).toBe(401); // Defaults to 401 for thrown errors
		const body = (await response.json()) as { message?: string; details?: any };
		expect(body.message).toBe("Clerk SDK internal error"); // Uses the error message
        expect(body.details).toBe("Clerk SDK internal error");
		expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});

    it("should return specific error for header-related Clerk SDK errors", async () => {
		const clerkError = new Error("Invalid Authorization header structure");
		mockAuthenticateRequest.mockRejectedValue(clerkError);

		mockRequest = new Request("http://example.com/items", {
			headers: { Authorization: "Bearer some_token" }, // Assume token is fine, but SDK has header issue
		});

		const result = await authenticateRequestWithClerk(mockRequest, mockEnv);

		expect(result.status).toBe("error");
		const response = (result as { status: "error"; response: Response }).response;
		expect(response.status).toBe(401);
		const body = (await response.json()) as { message?: string; details?: any };
		// Message check depends on the exact error message check in auth.ts
        // Let's assume it contains 'header'
        // expect(body.message).toBe("Invalid Authorization header format or token.");
        expect(body.message).toBe("Invalid Authorization header format or token."); // Expect the generic message
        expect(body.details).toBe("Invalid Authorization header structure");
		expect(mockAuthenticateRequest).toHaveBeenCalledTimes(1);
	});
});