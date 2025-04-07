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

	// --- Handlers for /items endpoint (cloudSync.ts) ---

	// Handler for GET /items
	http.get(`${WORKER_BASE_URL}/items`, ({ request }) => {
		console.log("[MSW] Intercepted GET /items");
		if (!checkAuthHeader(request)) {
			console.log("[MSW] Unauthorized GET /items request");
			return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
			});
		}
		// Respond with mock data similar to cloudSync.test.ts
		const mockItems = [
			{
				id: "cloud-123",
				url: "http://example.com/1",
				title: "Cloud Article 1",
				content: "Content 1",
				scrapedAt: "2024-01-01T10:00:00.000Z",
				type: "article",
				userId: "user-abc",
			},
			{
				id: "cloud-456",
				url: "http://example.com/2",
				title: "Cloud Article 2",
				content: "Content 2",
				scrapedAt: "2024-01-02T12:30:00.000Z",
				type: "article",
				userId: "user-abc",
				isRead: true,
				favorite: false,
			},
			{
				id: "cloud-789",
				url: "http://example.com/3",
				title: "Cloud Article 3",
				content: "Content 3",
				type: "article",
				userId: "user-abc",
			},
		];
		console.log("[MSW] Responding successfully to GET /items");
		return HttpResponse.json(mockItems);
	}),

	// Handler for POST /items
	http.post(`${WORKER_BASE_URL}/items`, async ({ request }) => {
		console.log("[MSW] Intercepted POST /items");
		if (!checkAuthHeader(request)) {
			console.log("[MSW] Unauthorized POST /items request");
			return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
			});
		}
		// TODO: Add body validation if needed for specific tests
		try {
			await request.json(); // Consume body
		} catch (e) {
			// Handle invalid JSON if necessary
			console.log("[MSW] Invalid JSON body for POST /items");
			return new HttpResponse(
				JSON.stringify({ error: "Bad Request: Invalid JSON" }),
				{ status: 400 },
			);
		}
		console.log("[MSW] Responding successfully to POST /items");
		return new HttpResponse(null, { status: 200 }); // OK status
	}),

	// Handler for DELETE /items/:id
	http.delete(`${WORKER_BASE_URL}/items/:id`, ({ request, params }) => {
		const { id } = params;
		console.log(`[MSW] Intercepted DELETE /items/${id}`);
		if (!checkAuthHeader(request)) {
			console.log(`[MSW] Unauthorized DELETE /items/${id} request`);
			return new HttpResponse(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
			});
		}
		// Example: Mock "not found" for a specific ID if needed by a test
		// if (id === 'not-real-id') {
		//   console.log(`[MSW] Responding 404 Not Found to DELETE /items/${id}`);
		//   return new HttpResponse(null, { status: 404 });
		// }
		console.log(`[MSW] Responding successfully to DELETE /items/${id}`);
		return new HttpResponse(null, { status: 204 }); // No Content status
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
]; // END of main handlers array

// You can add more handlers here for different scenarios (e.g., server errors)
// Example error handler:
// http.post(`${WORKER_BASE_URL}/api/summarize`, () => {
//   return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' });
// })
