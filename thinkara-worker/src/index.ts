// thinkara-worker/src/index.ts

import type { WebhookEvent } from "@clerk/backend"; // Keep Clerk's type for the event payload
import { Webhook, WebhookVerificationError } from "svix"; // Use Svix for verification
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
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
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
					message: "Thinkara Sync API is running",
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
				// --- Clerk Webhook Endpoint ---
				if (path === "/api/webhooks/clerk" && request.method === "POST") {
					console.log("Received request for /api/webhooks/clerk");
					const secret = env.CLERK_WEBHOOK_SECRET;
					if (!secret) {
						console.error("CLERK_WEBHOOK_SECRET is not set in environment.");
						return errorResponse("Webhook secret configuration error", 500);
					}

					// Get headers required by Svix
					const svix_id = request.headers.get("svix-id");
					const svix_timestamp = request.headers.get("svix-timestamp");
					const svix_signature = request.headers.get("svix-signature");

					if (!svix_id || !svix_timestamp || !svix_signature) {
						console.warn("Missing svix headers for webhook verification.");
						return errorResponse("Missing required webhook headers", 400);
					}

					const headers = {
						"svix-id": svix_id,
						"svix-timestamp": svix_timestamp,
						"svix-signature": svix_signature,
					};

					// Read the body
					const body = await request.text();

					// Create a new Svix Webhook instance with your webhook secret
					const wh = new Webhook(secret);
					let evt: WebhookEvent; // Still use Clerk's type for the parsed event

					try {
						// Verify the webhook payload and headers using Svix
						evt = wh.verify(body, headers) as WebhookEvent; // Type assertion remains useful
						console.log("Svix webhook verified successfully.");
					} catch (err: unknown) {
						// Catch Svix verification errors
						if (err instanceof WebhookVerificationError) {
							console.error("Svix webhook verification failed:", err.message);
							return errorResponse(
								"Webhook signature verification failed",
								400,
							);
						}
						// Handle other potential errors during verification
						console.error("Error during webhook verification process:", err);
						const message =
							err instanceof Error ? err.message : "Unknown verification error";
						return errorResponse(`Webhook verification error: ${message}`, 500);
					}

					// Handle the event
					const eventType = evt.type;
					console.log(`Received webhook event type: ${eventType}`);

					if (eventType === "user.created") {
						// Type assertion to access data safely based on event type
						const userData = evt.data;
						const userId = userData.id;
						console.log(
							`Received user.created event for Clerk User ID: ${userId}`,
						);
						try {
							// Initialize KV store for the new user with an empty array
							await env.SAVED_ITEMS_KV.put(userId, JSON.stringify([]));
							console.log(`Initialized data store for new user: ${userId}`);
						} catch (kvError) {
							console.error(
								`Failed to initialize KV store for user ${userId}:`,
								kvError,
							);
							// Decide if this error should prevent the webhook success response.
							// For now, we log the error but still return success to Clerk,
							// as the user record exists, but initialization failed.
							// A retry mechanism or monitoring alert might be needed here.
						}
					} else {
						console.log(`Ignoring webhook event type: ${eventType}`);
					}

					// Return a 200 OK response to acknowledge receipt of the webhook
					return jsonResponse({
						status: "success",
						message: "Webhook received",
					});
				}
				// --- End Clerk Webhook Endpoint ---

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
			return errorResponse(
				error instanceof Error ? error.message : "Unknown error occurred",
				500,
			);
		}
	},
};
