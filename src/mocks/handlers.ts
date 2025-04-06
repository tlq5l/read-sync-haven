import { http, HttpResponse, type RequestHandler } from "msw";
import {
	MOCK_CHAT_RESPONSE,
	MOCK_CLERK_TOKEN,
	MOCK_SUMMARY,
	WORKER_BASE_URL,
} from "./constants"; // Import constants

// Helper to check Authorization header
const checkAuthHeader = (request: Request): boolean => {
	const authHeader = request.headers.get("Authorization");
	return authHeader === `Bearer ${MOCK_CLERK_TOKEN}`;
};

export const handlers: RequestHandler[] = [
	// Handler for POST /api/summarize
	http.post(`${WORKER_BASE_URL}/api/summarize`, async ({ request }) => {
		console.log("[MSW] Intercepted POST /api/summarize"); // Log interception

		// Check for correct Authorization header
		if (!checkAuthHeader(request)) {
			console.log("[MSW] Unauthorized /api/summarize request");
			return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Check for request body
		try {
			const body = await request.json();
			if (!body || typeof body !== "object" || !("content" in body)) {
				console.log("[MSW] Bad request body for /api/summarize");
				return new HttpResponse(
					JSON.stringify({ error: "Bad Request: Missing content" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}
		} catch (e) {
			console.log("[MSW] Invalid JSON body for /api/summarize");
			return new HttpResponse(
				JSON.stringify({ error: "Bad Request: Invalid JSON" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Simulate successful response
		console.log("[MSW] Responding successfully to /api/summarize");
		return HttpResponse.json({
			status: "success",
			summary: MOCK_SUMMARY,
		});
	}),

	// Handler for POST /api/chat
	http.post(`${WORKER_BASE_URL}/api/chat`, async ({ request }) => {
		console.log("[MSW] Intercepted POST /api/chat"); // Log interception

		// Check for correct Authorization header
		if (!checkAuthHeader(request)) {
			console.log("[MSW] Unauthorized /api/chat request");
			return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		// Check for request body
		try {
			const body = await request.json();
			if (
				!body ||
				typeof body !== "object" ||
				!("content" in body) ||
				!("message" in body)
			) {
				console.log("[MSW] Bad request body for /api/chat");
				return new HttpResponse(
					JSON.stringify({ error: "Bad Request: Missing content or message" }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}
		} catch (e) {
			console.log("[MSW] Invalid JSON body for /api/chat");
			return new HttpResponse(
				JSON.stringify({ error: "Bad Request: Invalid JSON" }),
				{
					status: 400,
					headers: { "Content-Type": "application/json" },
				},
			);
		}

		// Simulate successful response
		console.log("[MSW] Responding successfully to /api/chat");
		return HttpResponse.json({
			status: "success",
			response: MOCK_CHAT_RESPONSE,
		});
	}),

	// --- Handlers for Fake GCF URLs used in Worker Tests ---

	// Handler for POST http://fake-gcf/summarize
	http.post("http://fake-gcf/summarize", async () => {
		// Removed unused { request }
		console.log("[MSW] Intercepted POST http://fake-gcf/summarize");
		// Basic success response for worker tests
		return HttpResponse.json({ summary: "Fake GCF Summary" });
	}),

	// Handler for POST http://fake-gcf/chat
	http.post("http://fake-gcf/chat", async () => {
		// Removed unused { request }
		console.log("[MSW] Intercepted POST http://fake-gcf/chat");
		// Basic success response for worker tests
		return HttpResponse.json({ response: "Fake GCF Chat Response" });
	}),

	// --- Handlers for Fake GCF URLs used in Worker Index Tests ---

	// Handler for POST http://fake-gcf.test/summarize
	http.post("http://fake-gcf.test/summarize", async () => {
		// Removed unused { request }
		console.log("[MSW] Intercepted POST http://fake-gcf.test/summarize");
		// Basic success response for worker index tests
		return HttpResponse.json({ summary: "Fake GCF Summary (.test)" });
	}),

	// Handler for POST http://fake-gcf.test/chat
	http.post("http://fake-gcf.test/chat", async () => {
		// Removed unused { request }
		console.log("[MSW] Intercepted POST http://fake-gcf.test/chat");
		// Basic success response for worker index tests
		return HttpResponse.json({ response: "Fake GCF Chat Response (.test)" });
	}),
];

// You can add more handlers here for different scenarios (e.g., server errors)
// Example error handler:
// http.post(`${WORKER_BASE_URL}/api/summarize`, () => {
//   return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' });
// })
