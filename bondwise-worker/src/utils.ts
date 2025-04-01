// bondwise-worker/src/utils.ts

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
 */
export const corsHeaders = {
	"Access-Control-Allow-Origin": "*", // Adjust in production if needed
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Creates a standard JSON response object.
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
	return new Response(JSON.stringify(body), {
		status: status,
		headers: {
			"Content-Type": "application/json",
			...corsHeaders,
			...additionalHeaders,
		},
	});
}

/**
 * Creates a standard error response object.
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
	return jsonResponse(body, status);
}
