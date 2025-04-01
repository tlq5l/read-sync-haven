// bondwise-worker/src/index.ts

import { authenticateRequestWithClerk } from "./auth";
import { handleChat, handleSummarize } from "./handlers/api";
import {
	handleDeleteItem,
	handleGetItem,
	handleListItems,
	handlePostItem,
} from "./handlers/items";
import type { Env } from "./types"; // Import types
import { corsHeaders, errorResponse, jsonResponse } from "./utils"; // Import utils

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.log(
			`WORKER FETCH HANDLER INVOKED: Method=${request.method}, URL=${request.url}`,
		);

		// Handle OPTIONS requests (CORS preflight)
		if (request.method === "OPTIONS") {
			return new Response(null, { headers: corsHeaders });
		}

		try {
			// Parse URL to determine the endpoint
			const url = new URL(request.url);
			const path = url.pathname;
			const pathParts = path.split("/").filter(Boolean);

			console.log(`Processing ${request.method} request to ${path}`);

			// Verify KV namespace is available
			if (!env.SAVED_ITEMS_KV) {
				console.error("KV namespace is not available");
				return errorResponse("Storage unavailable", 503);
			}

			// --- Root Endpoint ---
			if (path === "/" || path === "") {
				return jsonResponse({
					status: "ok",
					message: "Bondwise Sync API is running",
					version: "1.0.1", // Updated version for refactor
					endpoints: ["/items", "/api/summarize", "/api/chat"],
				});
			}

			// --- /items Endpoints ---
			if (pathParts[0] === "items") {
				// --- Authenticate all /items requests ---
				const authResult = await authenticateRequestWithClerk(request, env);
				if (authResult.status === "error") {
					return authResult.response;
				}
				const userId = authResult.userId;
				// ---------------------------------------

				// Route based on method and path length
				if (pathParts.length === 1) {
					if (request.method === "GET") {
						return handleListItems(request, env, userId);
					}
					if (request.method === "POST") {
						return handlePostItem(request, env, ctx, userId);
					}
				} else if (pathParts.length === 2) {
					const itemId = pathParts[1];
					if (request.method === "GET") {
						return handleGetItem(request, env, userId, itemId);
					}
					if (request.method === "DELETE") {
						return handleDeleteItem(request, env, userId, itemId);
					}
				}
			}

			// --- /api Endpoints ---
			if (pathParts[0] === "api") {
				if (pathParts[1] === "summarize" && request.method === "POST") {
					return handleSummarize(request, env); // Auth handled inside
				}
				if (pathParts[1] === "chat" && request.method === "POST") {
					return handleChat(request, env); // Auth handled inside
				}
			}

			// --- Endpoint Not Found ---
			return errorResponse("Endpoint not found", 404);

		} catch (error) {
			// --- Global Error Handler ---
			console.error("Worker error:", error);
			return errorResponse(error instanceof Error ? error.message : "Unknown error occurred", 500);
		}
	},
};
