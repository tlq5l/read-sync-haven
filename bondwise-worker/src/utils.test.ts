// bondwise-worker/src/utils.test.ts

import { describe, it, expect } from "vitest";
import {
	createUserItemKey,
	parseUserItemKey,
	jsonResponse,
	errorResponse,
	corsHeaders,
} from "./utils";
import type { ApiResponse } from "./types";

describe("Worker Utilities", () => {
	// Test createUserItemKey
	describe("createUserItemKey", () => {
		it("should create a correctly formatted key", () => {
			const userId = "user_123";
			const itemId = "item_abc";
			expect(createUserItemKey(userId, itemId)).toBe("user_123:item_abc");
		});

		it("should handle empty strings", () => {
			expect(createUserItemKey("", "")).toBe(":");
		});
	});

	// Test parseUserItemKey
	describe("parseUserItemKey", () => {
		it("should parse a valid key correctly", () => {
			const key = "user_123:item_abc";
			expect(parseUserItemKey(key)).toEqual({
				userId: "user_123",
				itemId: "item_abc",
			});
		});

		it("should return null for keys without a colon", () => {
			expect(parseUserItemKey("user123itemabc")).toBeNull();
		});

		it("should return null for keys with multiple colons", () => {
			expect(parseUserItemKey("user:123:item:abc")).toBeNull();
		});

		it("should return null for empty string", () => {
			expect(parseUserItemKey("")).toBeNull();
		});

		it("should handle keys with empty parts", () => {
			expect(parseUserItemKey(":")).toEqual({ userId: "", itemId: "" });
			expect(parseUserItemKey("user:")).toEqual({ userId: "user", itemId: "" });
			expect(parseUserItemKey(":item")).toEqual({ userId: "", itemId: "item" });
		});
	});

	// Test jsonResponse
	describe("jsonResponse", () => {
		it("should create a Response with correct JSON body and default status 200", async () => {
			const body: ApiResponse = { status: "success", data: { id: 1 } };
			const response = jsonResponse(body);
			expect(response.status).toBe(200);
			expect(response.headers.get("Content-Type")).toBe("application/json");
			// Check standard CORS headers
			for (const [key, value] of Object.entries(corsHeaders)) {
				expect(response.headers.get(key)).toBe(value);
			}
			const responseBody = await response.json();
			expect(responseBody).toEqual(body);
		});

		it("should create a Response with specified status", async () => {
			const body = { message: "Created" };
			const response = jsonResponse(body, 201);
			expect(response.status).toBe(201);
			const responseBody = await response.json();
			expect(responseBody).toEqual(body);
		});

		it("should include additional headers", () => {
			const body = {};
			const headers = { "X-Custom-Header": "TestValue" };
			const response = jsonResponse(body, 200, headers);
			expect(response.headers.get("X-Custom-Header")).toBe("TestValue");
		});
	});

	// Test errorResponse
	describe("errorResponse", () => {
		it("should create an error Response with default status 500", async () => {
			const message = "Internal Server Error";
			const response = errorResponse(message);
			expect(response.status).toBe(500);
			expect(response.headers.get("Content-Type")).toBe("application/json");
			// Check standard CORS headers
			for (const [key, value] of Object.entries(corsHeaders)) {
				expect(response.headers.get(key)).toBe(value);
			}
			const responseBody = await response.json();
			expect(responseBody).toEqual({ status: "error", message: message });
		});

		it("should create an error Response with specified status", async () => {
			const message = "Not Found";
			const response = errorResponse(message, 404);
			expect(response.status).toBe(404);
			const responseBody = await response.json();
			expect(responseBody).toEqual({ status: "error", message: message });
		});

		it("should include details if provided", async () => {
			const message = "Validation Failed";
			const details = { field: "email", issue: "required" };
			const response = errorResponse(message, 400, details);
			expect(response.status).toBe(400);
			const responseBody = await response.json();
			expect(responseBody).toEqual({
				status: "error",
				message: message,
				details: details,
			});
		});
	});
});