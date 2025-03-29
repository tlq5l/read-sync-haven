import { createClerkClient } from "@clerk/backend"; // Correct import
import { GoogleAuth } from "google-auth-library";

// Define the environment interface for TypeScript
export interface Env {
	// Bindings
	SAVED_ITEMS_KV: KVNamespace;

	// Variables
	GCF_URL: string; // URL for the Google Cloud Function summarizer
	GEMINI_API_KEY: string; // Kept for potential future use/debugging
	GCLOUD_PROJECT_NUMBER: string;
	GCLOUD_WORKLOAD_IDENTITY_POOL_ID: string;
	GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: string;
	GCLOUD_SERVICE_ACCOUNT_EMAIL: string;

	// Secrets
	CLERK_SECRET_KEY: string;
	CLERK_PUBLISHABLE_KEY: string; // Added publishable key
	GCF_AUTH_SECRET: string; // Added shared secret for GCF auth
}

// Define the structure for saved items (consistent with extension)
interface SavedItem {
	id: string;
	url: string;
	title: string;
	content?: string;
	scrapedAt: string;
	type: "article" | "youtube" | "other";
	userId: string; // Added userId field
}

// Helper function to create user-specific keys
function createUserItemKey(userId: string, itemId: string): string {
	return `${userId}:${itemId}`;
}

// Helper function to parse user-specific keys
function parseUserItemKey(
	key: string,
): { userId: string; itemId: string } | null {
	const parts = key.split(":");
	if (parts.length !== 2) return null;
	return {
		userId: parts[0],
		itemId: parts[1],
	};
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		console.log(
			`WORKER FETCH HANDLER INVOKED: Method=${request.method}, URL=${request.url}`,
		); // Add top-level log
		// CORS headers for all responses
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization",
		};

		// Handle OPTIONS requests (CORS preflight)
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: corsHeaders,
			});
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
				throw new Error("Storage unavailable");
			}

			// Root endpoint
			if (path === "/" || path === "") {
				return new Response(
					JSON.stringify({
						status: "ok",
						message: "Bondwise Sync API is running",
						version: "1.0.0",
						endpoints: ["/items"],
					}),
					{
						headers: {
							"Content-Type": "application/json",
							...corsHeaders,
						},
					},
				);
			}

			// Items collection endpoints
			if (pathParts[0] === "items") {
				// GET /items?userId=email@example.com - List all items for a user
				if (pathParts.length === 1 && request.method === "GET") {
					// Get userId from query parameter
					const userId = url.searchParams.get("userId");

					if (!userId) {
						return new Response(
							JSON.stringify({
								status: "error",
								message: "userId parameter is required",
							}),
							{
								status: 400,
								headers: {
									"Content-Type": "application/json",
									...corsHeaders,
								},
							},
						);
					}

					try {
						// List all keys in the KV namespace
						const listResult = await env.SAVED_ITEMS_KV.list();

						// Filter keys that belong to the requested user
						const userKeys = listResult.keys
							.map((key) => key.name)
							.filter((key) => key.startsWith(`${userId}:`));

						// Get all values for the user's keys
						const items: SavedItem[] = [];
						for (const key of userKeys) {
							const value = await env.SAVED_ITEMS_KV.get(key);
							if (value) {
								try {
									items.push(JSON.parse(value));
								} catch (parseError) {
									console.error(
										`Failed to parse item with key ${key}:`,
										parseError,
									);
								}
							}
						}

						return new Response(JSON.stringify(items), {
							headers: {
								"Content-Type": "application/json",
								...corsHeaders,
							},
						});
					} catch (listError) {
						console.error("Error listing items:", listError);
						throw new Error("Failed to list items");
					}
				}

				// POST /items - Create a new item
				if (pathParts.length === 1 && request.method === "POST") {
					const item = (await request.json()) as SavedItem;

					// Validate required fields including userId
					if (!item || !item.id || !item.url || !item.title || !item.userId) {
						return new Response(
							JSON.stringify({
								status: "error",
								message:
									"Invalid item data - missing required fields (including userId)",
							}),
							{
								status: 400,
								headers: {
									"Content-Type": "application/json",
									...corsHeaders,
								},
							},
						);
					}

					console.log(`Processing item: ${item.id} for user: ${item.userId}`);

					try {
						// Create a user-specific key
						const key = createUserItemKey(item.userId, item.id);

						// Store the item in KV with the user-specific key
						const kvPromise = env.SAVED_ITEMS_KV.put(key, JSON.stringify(item));

						// Use waitUntil to ensure operation completes even if response is sent
						ctx.waitUntil(
							kvPromise.then(
								() => console.log(`Successfully wrote item ${key} to KV.`),
								(err) => console.error(`Error writing item ${key} to KV:`, err),
							),
						);

						// Wait for KV operation to complete before sending response
						await kvPromise;

						return new Response(
							JSON.stringify({
								status: "success",
								message: "Item saved successfully",
								item: item,
								savedAt: new Date().toISOString(),
							}),
							{
								status: 201,
								headers: {
									"Content-Type": "application/json",
									...corsHeaders,
								},
							},
						);
					} catch (saveError) {
						console.error(`Error saving item ${item.id}:`, saveError);
						throw new Error("Failed to save item");
					}
				}

				// GET /items/:id?userId=email@example.com - Get a specific item for a user
				if (pathParts.length === 2 && request.method === "GET") {
					const id = pathParts[1];
					const userId = url.searchParams.get("userId");

					if (!userId) {
						return new Response(
							JSON.stringify({
								status: "error",
								message: "userId parameter is required",
							}),
							{
								status: 400,
								headers: {
									"Content-Type": "application/json",
									...corsHeaders,
								},
							},
						);
					}

					try {
						const key = createUserItemKey(userId, id);
						const value = await env.SAVED_ITEMS_KV.get(key);

						if (value === null) {
							return new Response(
								JSON.stringify({
									status: "error",
									message: "Item not found",
								}),
								{
									status: 404,
									headers: {
										"Content-Type": "application/json",
										...corsHeaders,
									},
								},
							);
						}

						return new Response(value, {
							headers: {
								"Content-Type": "application/json",
								...corsHeaders,
							},
						});
					} catch (getError) {
						console.error(`Error retrieving item ${id}:`, getError);
						throw new Error("Failed to retrieve item");
					}
				}

				// DELETE /items/:id?userId=email@example.com - Delete a specific item for a user
				if (pathParts.length === 2 && request.method === "DELETE") {
					const id = pathParts[1];
					const userId = url.searchParams.get("userId");

					if (!userId) {
						return new Response(
							JSON.stringify({
								status: "error",
								message: "userId parameter is required",
							}),
							{
								status: 400,
								headers: {
									"Content-Type": "application/json",
									...corsHeaders,
								},
							},
						);
					}

					try {
						const key = createUserItemKey(userId, id);
						await env.SAVED_ITEMS_KV.delete(key);

						return new Response(
							JSON.stringify({
								status: "success",
								message: "Item deleted successfully",
							}),
							{
								status: 200,
								headers: {
									"Content-Type": "application/json",
									...corsHeaders,
								},
							},
						);
					} catch (deleteError) {
						console.error(`Error deleting item ${id}:`, deleteError);
						throw new Error("Failed to delete item");
					}
				}
			}

			// POST /api/summarize - Summarize content using Google Cloud Function (with Clerk Auth & WIF)
			if (path === "/api/summarize" && request.method === "POST") {
				console.log("Processing /api/summarize request...");
				try {
					// --- 1. Verify Clerk Token ---
					console.log(
						`DEBUG: CLERK_SECRET_KEY is ${env.CLERK_SECRET_KEY ? "present" : "MISSING"}`,
					); // Temporary debug log
					console.log(
						`DEBUG: CLERK_PUBLISHABLE_KEY is ${env.CLERK_PUBLISHABLE_KEY ? "present" : "MISSING"}`,
					); // Temporary debug log
					const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
					const authHeader = request.headers.get("Authorization");
					if (!authHeader || !authHeader.startsWith("Bearer ")) {
						return new Response(
							JSON.stringify({
								status: "error",
								message: "Missing Authorization Bearer token",
							}),
							{
								status: 401,
								headers: { "Content-Type": "application/json", ...corsHeaders },
							},
						);
					}
					// Note: Clerk verification often needs the full Request object
					// We'll pass necessary parts or adapt if the SDK requires it.
					// For now, assuming we just need the token itself for a basic check,
					// but full request verification is more robust.

					try {
						// Verify the token using Clerk SDK's request authentication
						const requestState = await clerk.authenticateRequest(request, {
							// Pass request first, then options
							secretKey: env.CLERK_SECRET_KEY,
							publishableKey: env.CLERK_PUBLISHABLE_KEY, // Add publishable key
						});

						// Check if the request is authenticated
						if (requestState.status !== "signed-in") {
							// Use hyphenated status
							console.error(
								"Clerk authentication failed:",
								requestState.reason,
							);
							return new Response(
								JSON.stringify({
									status: "error",
									message: `Authentication failed: ${requestState.reason}`,
								}), // Use template literal
								{
									status: 401,
									headers: {
										"Content-Type": "application/json",
										...corsHeaders,
									},
								},
							);
						}

						console.log(
							"Clerk token verified successfully via authenticateRequest.",
						);
						// Optional: Extract userId if needed
						// const userId = requestState.toAuth().userId;
						// const userId = claims.sub;
					} catch (clerkError: any) {
						console.error("Clerk token verification failed:", clerkError);
						return new Response(
							JSON.stringify({
								status: "error",
								message: "Invalid or expired session token",
								details: clerkError.message,
							}),
							{
								status: 401,
								headers: { "Content-Type": "application/json", ...corsHeaders },
							},
						);
					}

					// --- 2. Prepare GCF Call ---
					const gcfUrl = env.GCF_URL;
					if (!gcfUrl) {
						console.error("GCF_URL environment variable is not configured.");
						return new Response(
							JSON.stringify({
								status: "error",
								message: "AI summarization service URL is not configured.",
							}),
							{
								status: 503,
								headers: { "Content-Type": "application/json", ...corsHeaders },
							},
						);
					}

					const { content } = (await request.json()) as { content?: string };
					if (!content) {
						return new Response(
							JSON.stringify({
								status: "error",
								message: "Missing 'content' in request body",
							}),
							{
								status: 400,
								headers: { "Content-Type": "application/json", ...corsHeaders },
							},
						);
					}

					// --- 3. Prepare GCF Call with Shared Secret ---
					if (!env.GCF_AUTH_SECRET) {
						console.error("GCF_AUTH_SECRET is not configured in worker environment.");
						return new Response(
							JSON.stringify({
								status: "error",
								message: "Worker is missing configuration for backend authentication.",
							}),
							{
								status: 500,
								headers: { "Content-Type": "application/json", ...corsHeaders },
							},
						);
					}

					// --- 4. Call the Google Cloud Function ---
					console.log(`Calling GCF at ${gcfUrl} with shared secret...`); // Updated log
					const gcfResponse = await fetch(gcfUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							// Add the shared secret header
							"X-Worker-Authorization": `Bearer ${env.GCF_AUTH_SECRET}`,
						},
						body: JSON.stringify({ content: content }),
					});

					// --- 5. Handle GCF Response ---
					if (!gcfResponse.ok) {
						const errorBody = await gcfResponse.text();
						console.error(
							`GCF call failed with status ${gcfResponse.status}: ${errorBody}`,
						);
						let errorMessage = `AI service request failed (Status: ${gcfResponse.status})`;
						try {
							const errorJson = JSON.parse(errorBody);
							errorMessage =
								errorJson.error ||
								`AI service error: ${gcfResponse.statusText}`;
						} catch (e) {
							if (errorBody) {
								errorMessage = `AI service error: ${errorBody}`;
							}
						}
						return new Response(
							JSON.stringify({ status: "error", message: errorMessage }),
							{
								status: gcfResponse.status === 401 ? 401 : 502,
								headers: { "Content-Type": "application/json", ...corsHeaders },
							},
						);
					}

					const gcfResult = (await gcfResponse.json()) as { summary?: string };
					if (!gcfResult.summary) {
						console.error("GCF response missing 'summary' field.");
						return new Response(
							JSON.stringify({
								status: "error",
								message: "AI service returned an invalid response.",
							}),
							{
								status: 502,
								headers: { "Content-Type": "application/json", ...corsHeaders },
							},
						);
					}

					// --- 6. Return Success Response ---
					console.log("Successfully processed /api/summarize request.");
					return new Response(
						JSON.stringify({ status: "success", summary: gcfResult.summary }),
						{ headers: { "Content-Type": "application/json", ...corsHeaders } },
					);
				} catch (error: any) {
					// Catch errors from Clerk verification, JSON parsing, or GCF call
					console.error("Error processing /api/summarize:", error);
					return new Response(
						JSON.stringify({
							status: "error",
							message:
								error.message ||
								"Internal worker error processing summary request.",
						}),
						{
							status: 500,
							headers: { "Content-Type": "application/json", ...corsHeaders },
						},
					);
				}
			}

			// If we reach here, the endpoint was not found
			return new Response(
				JSON.stringify({
					status: "error",
					message: "Endpoint not found",
				}),
				{
					status: 404,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				},
			);
		} catch (error) {
			// Global error handler
			console.error("Worker error:", error);

			return new Response(
				JSON.stringify({
					status: "error",
					message:
						error instanceof Error ? error.message : "Unknown error occurred",
					timestamp: new Date().toISOString(),
				}),
				{
					status: 500,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				},
			);
		}
	},
};
