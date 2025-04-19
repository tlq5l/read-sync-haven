// thinkara-worker/src/utils.ts

import type { ApiResponse } from "./types";

/**
 * Creates a user-specific key for storing items in KV.
 * @param userId - The user's unique identifier.
 * @param itemId - The item's unique identifier (_id).
 * @returns A formatted string key (e.g., "user_123:article_abc").
 */
export function createUserItemKey(userId: string, itemId: string): string {
	return `${userId}:${itemId}`;
}

/**
 * Parses a user-specific KV key to extract userId and itemId.
 * @param key - The KV key string.
 * @returns An object with userId and itemId, or null if the key format is invalid.
 */
export function parseUserItemKey(
	key: string,
): { userId: string; itemId: string } | null {
	const parts = key.split(":");
	if (parts.length !== 2) return null;
	return {
		userId: parts[0],
		itemId: parts[1],
	};
}

/**
 * Standard CORS headers for API responses.
 * Allows requests specifically from the frontend origin during development.
 * These are applied automatically by `jsonResponse` and `errorResponse`
 * and used by the preflight handler in `index.ts`.
 */
export const corsHeaders = {
	"Access-Control-Allow-Origin":
		process.env.NODE_ENV === "development"
			? "*"
			: "https://your-production-domain.com", // Use wildcard in development, restrict in production
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization, *", // Explicitly define allowed headers
	"Access-Control-Allow-Credentials": "true", // Allow credentials (cookies, auth headers)
	"Access-Control-Max-Age": "86400", // 24 hours
};

/**
 * Creates a standard JSON response object with CORS headers.
 * @param body - The response body object.
 * @param status - The HTTP status code (default: 200).
 * @param additionalHeaders - Optional additional headers.
 * @returns A Response object.
 */
export function jsonResponse(
	body: ApiResponse | Record<string, any>, // Allow standard objects too
	status = 200,
	additionalHeaders: Record<string, string> = {},
): Response {
	// Apply CORS headers directly here, consistent with original design.
	// The global fetch handler will ensure they are applied even if this isn't called.
	return new Response(JSON.stringify(body), {
		status: status,
		headers: {
			"Content-Type": "application/json",
			...corsHeaders, // Apply refined CORS headers
			...additionalHeaders,
		},
	});
}

/**
 * Creates a standard error response object with CORS headers.
 * @param message - The error message.
 * @param status - The HTTP status code (default: 500).
 * @param details - Optional additional error details.
 * @returns A Response object.
 */
export function errorResponse(
	message: string,
	status = 500,
	details?: any,
): Response {
	const body: ApiResponse = {
		status: "error",
		message: message,
		...(details && { details: details }), // Include details if provided
	};
	// Use jsonResponse to ensure consistent header application (including CORS)
	return jsonResponse(body, status);
}
