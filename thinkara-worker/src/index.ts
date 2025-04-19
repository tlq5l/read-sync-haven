import type { WebhookEvent } from "@clerk/backend";
// thinkara-worker/src/index.ts
import { type IRequest, Router, error, json } from "itty-router";
import { Webhook, WebhookVerificationError } from "svix";
import {
	type AuthEnv,
	type AuthenticatedRequest,
	authenticateRequest,
	getUserId,
} from "./auth";
import { handleChat, handleSummarize } from "./handlers/api"; // Assuming these handle their own internal logic/auth for now
import type { Env } from "./types";
// Use original response helpers and refined CORS headers
import { corsHeaders, errorResponse, jsonResponse } from "./utils"; // Corrected import

// Combine Env and AuthEnv for convenience in handlers
type AppEnv = Env & AuthEnv;

// Type for the D1 result wrapper (used by .all(), .run())
// See: https://developers.cloudflare.com/d1/platform/client-api/#return-object
interface D1Result<T = unknown> {
	results?: T[];
	success: boolean;
	error?: string;
	meta?: {
		// Meta is optional and its contents can vary
		duration?: number;
		// ... other meta fields like changes, last_row_id etc.
	};
}

// --- Specific Type Definitions for Payloads and DB Rows ---

interface UserSettings {
	// Define expected structure of settings JSON
	[key: string]: any; // Allow flexible settings for now
}

interface UserSettingsRow {
	settingsData: string; // JSON stored as string in DB
}

interface UserArticleData {
	// Define expected structure of article data JSON
	[key: string]: any; // Allow flexible article data for now
}

interface UserArticleRow {
	articleUrl: string;
	articleData: string; // JSON stored as string in DB
}

interface PostArticleRequestBody {
	articleUrl: string;
	articleData: UserArticleData; // Use the defined type from above
}

// --- Router Setup ---
const router = Router<AuthenticatedRequest, [AppEnv, ExecutionContext]>(); // Use AuthenticatedRequest which extends Request

// --- Middleware ---

// 1. CORS Preflight Handler - Respond with 204 No Content and correct CORS headers
router.options("*", () => {
	// Use the refined corsHeaders from utils.ts
	return new Response(null, { status: 204, headers: corsHeaders });
});

// 2. Global Request Logger (Example)
router.all("*", (request: IRequest, env: AppEnv, ctx: ExecutionContext) => {
	console.log(
		`Received Request: ${request.method} ${request.url} (CF-Connecting-IP: ${request.headers.get("CF-Connecting-IP")})`,
	);
});

// 3. Authentication Middleware (Applied specifically to /api/user/* routes below)

// --- Route Handlers ---

// Root Endpoint
router.get("/", () => {
	// Use original response helper
	return jsonResponse({
		status: "ok",
		message: "Thinkara Sync API is running",
		version: "2.0.0",
		endpoints: [
			"/api/webhooks/clerk",
			"/api/summarize",
			"/api/chat",
			"/api/user/settings",
			"/api/user/articles",
		],
	});
});

// Clerk Webhook Endpoint (Unaffected by user auth)
router.post(
	"/api/webhooks/clerk",
	async (request: Request, env: AppEnv, ctx: ExecutionContext) => {
		console.log("Received request for /api/webhooks/clerk");
		const secret = env.CLERK_WEBHOOK_SECRET;
		if (!secret) {
			console.error("CLERK_WEBHOOK_SECRET is not set in environment.");
			// Use original error helper
			return errorResponse("Webhook secret configuration error", 500);
		}

		// Get headers required by Svix
		const svix_id = request.headers.get("svix-id");
		const svix_timestamp = request.headers.get("svix-timestamp");
		const svix_signature = request.headers.get("svix-signature");

		if (!svix_id || !svix_timestamp || !svix_signature) {
			console.warn("Missing svix headers for webhook verification.");
			// Use original error helper
			return errorResponse("Missing required webhook headers", 400);
		}

		const headers = {
			"svix-id": svix_id,
			"svix-timestamp": svix_timestamp,
			"svix-signature": svix_signature,
		};

		const body = await request.text();
		const wh = new Webhook(secret);
		let evt: WebhookEvent;

		try {
			evt = wh.verify(body, headers) as WebhookEvent;
			console.log("Svix webhook verified successfully.");
		} catch (err: unknown) {
			if (err instanceof WebhookVerificationError) {
				console.error("Svix webhook verification failed:", err.message);
				// Use original error helper
				return errorResponse("Webhook signature verification failed", 400);
			}
			console.error("Error during webhook verification process:", err);
			const message =
				err instanceof Error ? err.message : "Unknown verification error";
			// Use original error helper
			return errorResponse(`Webhook verification error: ${message}`, 500);
		}

		const eventType = evt.type;
		console.log(`Received webhook event type: ${eventType}`);

		if (eventType === "user.created") {
			const userData = evt.data;
			const userId = userData.id;
			console.log(`Received user.created event for Clerk User ID: ${userId}`);
			// Optional: Initialize default settings in D1 here if needed
		} else if (eventType === "user.deleted") {
			const userData = evt.data;
			if (userData.id && userData.deleted) {
				const userId = userData.id;
				console.log(`Received user.deleted event for Clerk User ID: ${userId}`);
				// Clean up user data from D1
				try {
					await env.USER_DATA_DB.batch([
						env.USER_DATA_DB.prepare(
							"DELETE FROM user_settings WHERE clerkUserId = ?",
						).bind(userId),
						env.USER_DATA_DB.prepare(
							"DELETE FROM user_articles WHERE clerkUserId = ?",
						).bind(userId),
					]);
					console.log(`Deleted data for user: ${userId}`);
				} catch (dbError) {
					console.error(`Failed to delete data for user ${userId}:`, dbError);
					// Decide how to handle this - maybe log for manual cleanup
				}
			} else {
				console.warn(
					"Received user.deleted event without expected data structure",
					userData,
				);
			}
		} else {
			console.log(`Ignoring webhook event type: ${eventType}`);
		}
		// Use original response helper
		return jsonResponse({ status: "success", message: "Webhook received" });
	},
);

// Existing API Endpoints (Assumed to handle own auth/logic for now)
router.post("/api/summarize", handleSummarize);
router.post("/api/chat", handleChat);

// --- New User Data Routes (Protected) ---

const checkDb = (env: AppEnv) => {
	if (!env.USER_DATA_DB) {
		console.error("USER_DATA_DB binding is not available");
		// itty-router's error() helper automatically creates a Response
		throw error(503, "Database service unavailable");
	}
};

// GET /api/user/settings
router.get(
	"/api/user/settings",
	authenticateRequest, // Apply auth middleware first
	async (request: AuthenticatedRequest, env: AppEnv, ctx: ExecutionContext) => {
		checkDb(env);
		const userId = getUserId(request); // Throws if auth failed/missing

		try {
			const stmt = env.USER_DATA_DB.prepare(
				"SELECT settingsData FROM user_settings WHERE clerkUserId = ?",
			).bind(userId);
			const result = await stmt.first<UserSettingsRow>();

			if (result) {
				try {
					const settings: UserSettings = JSON.parse(result.settingsData);
					// Use itty-router's json() helper for simple cases
					return json({ status: "success", data: settings });
				} catch (parseError) {
					console.error(
						`Failed to parse settings JSON for user ${userId}:`,
						parseError,
					);
					// Use itty-router's error() helper
					return error(500, "Failed to parse stored settings");
				}
			}
			return json({ status: "success", data: {} });
		} catch (dbError) {
			console.error(
				`Database error fetching settings for user ${userId}:`,
				dbError,
			);
			return error(500, "Database error retrieving settings");
		}
	},
);

// POST /api/user/settings (Create/Update)
router.post(
	"/api/user/settings",
	authenticateRequest,
	async (request: AuthenticatedRequest, env: AppEnv, ctx: ExecutionContext) => {
		checkDb(env);
		const userId = getUserId(request);
		let settingsData: UserSettings;

		try {
			settingsData = (await request.json()) as UserSettings;
			if (typeof settingsData !== "object" || settingsData === null) {
				return error(400, "Invalid JSON body: Expected an object.");
			}
		} catch (e) {
			console.error("Failed to parse settings JSON body:", e);
			return error(400, "Invalid JSON request body");
		}

		try {
			const settingsJson = JSON.stringify(settingsData);
			const stmt = env.USER_DATA_DB.prepare(
				`INSERT INTO user_settings (clerkUserId, settingsData, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(clerkUserId) DO UPDATE SET settingsData = excluded.settingsData, updatedAt = CURRENT_TIMESTAMP`,
			).bind(userId, settingsJson);

			const info: D1Result = await stmt.run();

			if (!info.success) {
				console.error(
					`D1 UPSERT failed for user settings ${userId}: ${info.error}`,
					info,
				);
				return error(500, `Database error saving settings: ${info.error}`);
			}

			console.log(`Settings updated for user ${userId}`);
			return json({ status: "success", message: "Settings updated" });
		} catch (dbError) {
			console.error(
				`Database error saving settings for user ${userId}:`,
				dbError,
			);
			return error(500, "Database error saving settings");
		}
	},
);

// GET /api/user/articles (Fetch article data/memory)
router.get(
	"/api/user/articles",
	authenticateRequest,
	async (request: AuthenticatedRequest, env: AppEnv, ctx: ExecutionContext) => {
		checkDb(env);
		const userId = getUserId(request);
		const { searchParams } = new URL(request.url);
		const articleUrl = searchParams.get("url");

		try {
			let stmt: D1PreparedStatement;
			if (articleUrl) {
				stmt = env.USER_DATA_DB.prepare(
					"SELECT articleUrl, articleData FROM user_articles WHERE clerkUserId = ? AND articleUrl = ?",
				).bind(userId, articleUrl);
				const result = await stmt.first<UserArticleRow>();

				if (result) {
					try {
						const articleData: UserArticleData = JSON.parse(result.articleData);
						return json({ status: "success", data: articleData });
					} catch (parseError) {
						console.error(
							`Failed to parse article JSON for user ${userId}, url ${articleUrl}:`,
							parseError,
						);
						return error(500, "Failed to parse stored article data");
					}
				} else {
					return json({ status: "success", data: null });
				}
			} else {
				stmt = env.USER_DATA_DB.prepare(
					"SELECT articleUrl, articleData FROM user_articles WHERE clerkUserId = ?",
				).bind(userId);
				const results = await stmt.all<UserArticleRow>();

				if (results.results) {
					const articles = results.results
						.map((row: UserArticleRow) => {
							try {
								const data: UserArticleData = JSON.parse(row.articleData);
								return { url: row.articleUrl, data: data };
							} catch (parseError) {
								console.error(
									`Failed to parse article JSON for user ${userId}, url ${row.articleUrl}:`,
									parseError,
								);
								return null;
							}
						})
						.filter(
							(item): item is { url: string; data: UserArticleData } =>
								item !== null,
						);
					return json({ status: "success", data: articles });
				}
				return json({ status: "success", data: [] });
			}
		} catch (dbError) {
			console.error(
				`Database error fetching article data for user ${userId}:`,
				dbError,
			);
			return error(500, "Database error retrieving article data");
		}
	},
);

// POST /api/user/articles (Create/Update article data/memory)
router.post(
	"/api/user/articles",
	authenticateRequest,
	async (request: AuthenticatedRequest, env: AppEnv, ctx: ExecutionContext) => {
		checkDb(env);
		const userId = getUserId(request);
		let body: PostArticleRequestBody;

		try {
			body = (await request.json()) as PostArticleRequestBody;

			if (
				typeof body !== "object" ||
				body === null ||
				!body.articleUrl ||
				typeof body.articleUrl !== "string" ||
				typeof body.articleData === "undefined"
			) {
				return error(
					400,
					'Invalid JSON body: Expected an object with "articleUrl" (string) and "articleData".',
				);
			}
		} catch (e) {
			console.error("Failed to parse article JSON body:", e);
			return error(400, "Invalid JSON request body");
		}

		try {
			const { articleUrl, articleData } = body;
			const articleDataJson = JSON.stringify(articleData);
			const stmt = env.USER_DATA_DB.prepare(
				`INSERT INTO user_articles (clerkUserId, articleUrl, articleData, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(clerkUserId, articleUrl) DO UPDATE SET articleData = excluded.articleData, updatedAt = CURRENT_TIMESTAMP`,
			).bind(userId, articleUrl, articleDataJson);

			const info: D1Result = await stmt.run();

			if (!info.success) {
				console.error(
					`D1 UPSERT failed for article data ${userId}/${articleUrl}: ${info.error}`,
					info,
				);
				return error(500, `Database error saving article data: ${info.error}`);
			}

			console.log(`Article data updated for user ${userId}, url ${articleUrl}`);
			return json({ status: "success", message: "Article data updated" });
		} catch (dbError) {
			console.error(
				`Database error saving article data for user ${userId}, url ${body.articleUrl}:`,
				dbError,
			);
			return error(500, "Database error saving article data");
		}
	},
);

// --- Catch-All for 404 ---
// Use itty-router's error helper for consistency
router.all("*", () => error(404, "Endpoint not found"));

// --- Exported Fetch Handler ---
export default {
	async fetch(
		request: Request,
		env: AppEnv,
		ctx: ExecutionContext,
	): Promise<Response> {
		try {
			// Check essential environment variables/bindings needed early
			if (!env.CLERK_SECRET_KEY) {
				console.error(
					"CRITICAL ERROR: CLERK_SECRET_KEY is not configured in the environment.",
				);
				// Use original error helper here. CORS headers will be applied by the catch block.
				// Need to explicitly return the result of errorResponse
				return errorResponse("Authentication system configuration error.", 500);
			}
			// USER_DATA_DB check happens within authenticated routes that need it

			// Handle requests and apply CORS headers globally to the final response
			return await router
				.handle(request, env, ctx)
				.then((response: Response) => {
					// Clone the response to modify headers
					const newHeaders = new Headers(response.headers);
					// Apply CORS headers from utils.ts to ALL responses
					for (const [key, value] of Object.entries(corsHeaders)) {
						newHeaders.set(key, value);
					}
					// Return new response with original body/status but updated headers
					return new Response(response.body, {
						status: response.status,
						statusText: response.statusText,
						headers: newHeaders,
					});
				})
				// Make the catch callback async to allow await
				.catch(async (err: unknown) => {
					// Catch errors thrown by handlers or middleware (including itty-router's error())
					console.error("Unhandled error caught by router handler:", err);

					// Default error details
					let statusCode = 500;
					let message = "Internal Server Error";
					let errorResp: Response; // Declare here

					// Check if it's an itty-router error response (which is a Response object)
					if (err instanceof Response) {
						// Use the response directly, as itty-router's error() creates it
						errorResp = err;
						statusCode = err.status; // Update status code based on the response
						try {
							// Try to parse the error body if it's JSON to extract message
							const errorBody = await err.clone().json(); // Clone before reading body
							if (
								typeof errorBody === "object" &&
								errorBody !== null &&
								"error" in errorBody && // itty-router uses 'error' key
								typeof errorBody.error === "string"
							) {
								message = errorBody.error; // Use message from body if available
							}
							// If parsing succeeds but no 'error' key, message remains default
						} catch {
							// If body isn't JSON or parsing fails, message remains default
						}
						// Re-create the response body using the potentially extracted message
						// This ensures the body matches the intended error structure
						errorResp = errorResponse(message, statusCode);
					} else if (err instanceof Error) {
						// Handle standard JS Errors
						message = err.message;
						// Check if itty-router attached a status code
						if (typeof (err as any).status === "number") {
							statusCode = (err as any).status;
						}
						// Create a response using the original error helper
						errorResp = errorResponse(message, statusCode);
					} else {
						// Fallback for non-Error, non-Response throws
						errorResp = errorResponse(message, statusCode);
					}

					// Apply CORS headers to the final error response MANUALLY
					const finalHeaders = new Headers(errorResp.headers);
					for (const [key, value] of Object.entries(corsHeaders)) {
						finalHeaders.set(key, value);
					}

					return new Response(errorResp.body, {
						status: errorResp.status, // Use updated statusCode
						statusText: errorResp.statusText,
						headers: finalHeaders,
					});
				});
		} catch (globalError) {
			// Catch unexpected errors outside the router handling
			console.error("Critical error in fetch handler:", globalError);
			const message =
				globalError instanceof Error
					? globalError.message
					: "Unknown critical error";
			// Use original helper, apply CORS headers manually
			const errorResp = errorResponse(message, 500);
			const finalHeaders = new Headers(errorResp.headers);
			for (const [key, value] of Object.entries(corsHeaders)) {
				finalHeaders.set(key, value);
			}
			return new Response(errorResp.body, {
				status: errorResp.status,
				statusText: errorResp.statusText,
				headers: finalHeaders,
			});
		}
	},
};
