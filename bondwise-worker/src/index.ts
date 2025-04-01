// bondwise-worker/src/index.ts

import { authenticateRequestWithClerk } from "./auth";
import type { Env, WorkerArticle } from "./types"; // Import types
import {
	corsHeaders,
	createUserItemKey,
	errorResponse,
	jsonResponse,
} from "./utils"; // Import utils

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
					return authResult.response; // Return the error response directly
				}
				const userId = authResult.userId; // Get authenticated userId
				// ---------------------------------------

				// GET /items - List all items for the user
				if (pathParts.length === 1 && request.method === "GET") {
					const email = url.searchParams.get("email"); // For fallback lookup
					console.log(
						`Listing items for user: ${userId} (Fallback email: ${email || "N/A"})`,
					);
					try {
						const userItemsPromise = env.SAVED_ITEMS_KV.list({ prefix: `${userId}:` });
						const emailItemsPromise = email
							? env.SAVED_ITEMS_KV.list({ prefix: `${email}:` })
							: Promise.resolve(null);

						const [userListResult, emailListResult] = await Promise.all([
							userItemsPromise,
							emailItemsPromise,
						]);

						const combinedKeys = new Map<string, KVNamespaceListKey<unknown>>();
						for (const key of userListResult.keys) combinedKeys.set(key.name, key);
						if (emailListResult) {
							for (const key of emailListResult.keys) combinedKeys.set(key.name, key);
						}
						console.log(`Found ${combinedKeys.size} unique keys for user/email.`);

						const items: WorkerArticle[] = [];
						for (const key of combinedKeys.values()) {
							const value = await env.SAVED_ITEMS_KV.get(key.name);
							if (value) {
								try {
									items.push(JSON.parse(value) as WorkerArticle);
								} catch (parseError) {
									console.error(`Failed to parse item with key ${key.name}:`, parseError);
								}
							}
						}
						return jsonResponse(items);
					} catch (listError) {
						console.error("Error listing items:", listError);
						return errorResponse("Failed to list items", 500);
					}
				}

				// POST /items - Create/Update an item
				if (pathParts.length === 1 && request.method === "POST") {
					const item = (await request.json()) as WorkerArticle;
					if (
						!item || !item._id || !item.url || !item.title || !item.userId || !item.type || item.savedAt === undefined
					) {
						return errorResponse("Invalid article data - missing required fields", 400);
					}

					// Ensure the item's userId matches the authenticated user
					if (item.userId !== userId) {
						console.warn(`Attempt to save item for user ${item.userId} by authenticated user ${userId}`);
						return errorResponse("User ID mismatch", 403); // Forbidden
					}

					console.log(`Processing article: ${item._id} (Type: ${item.type}) for user: ${userId}`);
					try {
						const key = createUserItemKey(item.userId, item._id);
						const itemToSave: WorkerArticle = {
							_id: item._id, userId: item.userId, url: item.url, title: item.title, type: item.type, savedAt: item.savedAt,
							isRead: item.isRead ?? false, favorite: item.favorite ?? false,
							...(item.content && { content: item.content }),
							...(item.fileData && { fileData: item.fileData }),
							...(item.htmlContent && { htmlContent: item.htmlContent }),
							...(item.excerpt && { excerpt: item.excerpt }),
							...(item.author && { author: item.author }),
							...(item.siteName && { siteName: item.siteName }),
							...(item.publishedDate && { publishedDate: item.publishedDate }),
							...(item.tags && { tags: item.tags }),
							...(item.readingProgress && { readingProgress: item.readingProgress }),
							...(item.readAt && { readAt: item.readAt }),
							...(item.scrollPosition && { scrollPosition: item.scrollPosition }),
							...(item.coverImage && { coverImage: item.coverImage }),
							...(item.language && { language: item.language }),
							...(item.pageCount && { pageCount: item.pageCount }),
							...(item.estimatedReadTime && { estimatedReadTime: item.estimatedReadTime }),
							...(item._rev && { _rev: item._rev }),
						};

						const kvPromise = env.SAVED_ITEMS_KV.put(key, JSON.stringify(itemToSave));
						ctx.waitUntil(kvPromise.catch(err => console.error(`Background KV put failed for ${key}:`, err))); // Log background errors
						await kvPromise; // Wait for completion before responding

						return jsonResponse({ status: "success", message: "Article saved successfully", item: itemToSave }, 201);
					} catch (saveError) {
						console.error(`Error saving article ${item._id}:`, saveError);
						return errorResponse("Failed to save article", 500);
					}
				}

				// GET /items/:id - Get a specific item
				if (pathParts.length === 2 && request.method === "GET") {
					const id = pathParts[1];
					console.log(`Getting item ${id} for user: ${userId}`);
					try {
						const key = createUserItemKey(userId, id);
						const value = await env.SAVED_ITEMS_KV.get(key);
						if (value === null) {
							return errorResponse("Item not found", 404);
						}
						// Assuming value is valid JSON stringified WorkerArticle
						return jsonResponse(JSON.parse(value));
					} catch (getError) {
						console.error(`Error retrieving item ${id}:`, getError);
						return errorResponse("Failed to retrieve item", 500);
					}
				}

				// DELETE /items/:id - Delete a specific item
				if (pathParts.length === 2 && request.method === "DELETE") {
					const id = pathParts[1];
					console.log(`Deleting item ${id} for user: ${userId}`);
					try {
						const key = createUserItemKey(userId, id);
						await env.SAVED_ITEMS_KV.delete(key);
						return jsonResponse({ status: "success", message: "Item deleted successfully" });
					} catch (deleteError) {
						console.error(`Error deleting item ${id}:`, deleteError);
						return errorResponse("Failed to delete item", 500);
					}
				}
			}

			// --- /api/summarize Endpoint ---
			if (path === "/api/summarize" && request.method === "POST") {
				console.log("Processing /api/summarize request...");
				try {
					// Authentication is required
					const authResult = await authenticateRequestWithClerk(request, env);
					if (authResult.status === "error") return authResult.response;

					const gcfUrl = env.GCF_SUMMARIZE_URL;
					if (!gcfUrl) return errorResponse("AI summarization service URL is not configured.", 503);
					if (!env.GCF_AUTH_SECRET) return errorResponse("Worker is missing configuration for backend authentication.", 500);

					const { content } = (await request.json()) as { content?: string };
					if (!content) return errorResponse("Missing 'content' in request body", 400);

					console.log(`Calling Summarize GCF at ${gcfUrl} with shared secret...`);
					const gcfResponse = await fetch(gcfUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json", "X-Worker-Authorization": `Bearer ${env.GCF_AUTH_SECRET}` },
						body: JSON.stringify({ content: content }),
					});

					if (!gcfResponse.ok) {
						const errorBody = await gcfResponse.text();
						console.error(`Summarize GCF call failed with status ${gcfResponse.status}: ${errorBody}`);
						let errorMessage = `Summarization service request failed (Status: ${gcfResponse.status})`;
						try { errorMessage = JSON.parse(errorBody).error || errorMessage; } catch (e) { /* ignore parsing error */ }
						return errorResponse(errorMessage, gcfResponse.status === 401 ? 401 : 502);
					}

					const gcfResult = (await gcfResponse.json()) as { summary?: string };
					if (!gcfResult.summary) return errorResponse("Summarization service returned an invalid response.", 502);

					console.log("Successfully processed /api/summarize request.");
					return jsonResponse({ status: "success", summary: gcfResult.summary });
				} catch (error: any) {
					console.error("Error processing /api/summarize:", error);
					return errorResponse(error.message || "Internal worker error processing summary request.", 500);
				}
			}

			// --- /api/chat Endpoint ---
			if (path === "/api/chat" && request.method === "POST") {
				console.log("Processing /api/chat request...");
				try {
					// Authentication is required
					const authResult = await authenticateRequestWithClerk(request, env);
					if (authResult.status === "error") return authResult.response;

					const gcfChatUrl = env.GCF_CHAT_URL;
					if (!gcfChatUrl) return errorResponse("AI chat service URL is not configured.", 503);
					if (!env.GCF_AUTH_SECRET) return errorResponse("Worker is missing configuration for backend authentication.", 500);

					const { content, message } = (await request.json()) as { content?: string; message?: string; };
					if (!content || !message) return errorResponse("Missing 'content' or 'message' in request body", 400);

					console.log(`Calling Chat GCF at ${gcfChatUrl} with shared secret...`);
					const gcfResponse = await fetch(gcfChatUrl, {
						method: "POST",
						headers: { "Content-Type": "application/json", "X-Worker-Authorization": `Bearer ${env.GCF_AUTH_SECRET}` },
						body: JSON.stringify({ content: content, message: message }),
					});

					if (!gcfResponse.ok) {
						const errorBody = await gcfResponse.text();
						console.error(`Chat GCF call failed with status ${gcfResponse.status}: ${errorBody}`);
						let errorMessage = `Chat service request failed (Status: ${gcfResponse.status})`;
						try { errorMessage = JSON.parse(errorBody).error || errorMessage; } catch (e) { /* ignore */ }
						return errorResponse(errorMessage, gcfResponse.status === 401 ? 401 : 502);
					}

					const gcfResult = (await gcfResponse.json()) as { response?: string };
					if (!gcfResult.response) return errorResponse("Chat service returned an invalid response.", 502);

					console.log("Successfully processed /api/chat request.");
					return jsonResponse({ status: "success", response: gcfResult.response });
				} catch (error: any) {
					console.error("Error processing /api/chat:", error);
					return errorResponse(error.message || "Internal worker error processing chat request.", 500);
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
