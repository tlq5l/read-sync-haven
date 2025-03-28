import { GoogleGenerativeAI } from "@google/generative-ai";

// Define the environment interface for TypeScript
export interface Env {
	SAVED_ITEMS_KV: KVNamespace;
	GEMINI_API_KEY: string; // Added for Gemini API
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

			// POST /api/summarize - Summarize content using Gemini
			if (path === "/api/summarize" && request.method === "POST") {
				console.log("Processing /api/summarize request");
				try {
					const apiKey = env.GEMINI_API_KEY;
					if (!apiKey) {
						console.error("GEMINI_API_KEY is not configured in environment variables.");
						throw new Error("AI service is not configured.");
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

					const genAI = new GoogleGenerativeAI(apiKey);
					const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro-exp-03-25" });
					const prompt = `Summarize the following text concisely:

${content}`;

					const result = await model.generateContent(prompt);
					const response = result.response;
					const summary = response.text();

					return new Response(
						JSON.stringify({ status: "success", summary: summary }),
						{
							headers: { "Content-Type": "application/json", ...corsHeaders },
						},
					);
				} catch (aiError) {
					console.error("Error calling Gemini API:", aiError);
					// Don't throw here, return a proper error response
					return new Response(
						JSON.stringify({
							status: "error",
							message:
								aiError instanceof Error
									? aiError.message
									: "Failed to generate summary due to an AI service error.",
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
