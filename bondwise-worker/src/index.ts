import { type IRequest, Router } from "itty-router"; // Use IRequest and import type (Sorted)

// Define the environment expected by the Worker
// This includes the KV namespace binding defined in wrangler.toml
export interface Env {
	SAVED_ITEMS_KV: KVNamespace;
}

// Define the structure for saved items (consistent with extension)
interface SavedItem {
	id: string;
	url: string;
	title: string;
	content?: string;
	scrapedAt: string;
	type: "article" | "youtube" | "other";
}

const router = Router();

// Middleware to handle CORS preflight requests and add CORS headers
const corsHeaders = {
	"Access-Control-Allow-Origin": "*", // Allow all origins (adjust for production)
	"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization", // Add any other headers your client might send
};

function handleOptions(request: IRequest) {
	// Change type annotation to IRequest
	if (
		request.headers.get("Origin") !== null &&
		request.headers.get("Access-Control-Request-Method") !== null &&
		request.headers.get("Access-Control-Request-Headers") !== null
	) {
		// Handle CORS preflight requests.
		return new Response(null, {
			headers: corsHeaders,
		});
	}
	// Handle standard OPTIONS request.
	return new Response(null, {
		headers: {
			Allow: "GET, POST, PUT, DELETE, OPTIONS",
		},
	});
}

// Helper function to add CORS headers to responses by creating a new Response
function corsify(response: Response): Response {
	// Create a safe copy of headers
	const newHeaders = new Headers(response.headers);
	
	// Add CORS headers
	for (const [key, value] of Object.entries(corsHeaders)) {
		newHeaders.set(key, value);
	}
	
	// Create a new response without modifying the body
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
}

// --- API Routes ---

// Root path handler
router.get("/", () => {
	return new Response(JSON.stringify({
		status: "ok",
		message: "Bondwise Sync API is running",
		endpoints: ["/items"]
	}), { 
		status: 200,
		headers: { "Content-Type": "application/json" }
	});
});

// POST /items - Save a new item
router.post("/items", async (request: IRequest, env: Env, ctx: ExecutionContext) => {
	console.log(`Received POST /items request`);
	
	try {
		// Verify KV namespace is available
		if (!env.SAVED_ITEMS_KV) {
			console.error("KV namespace SAVED_ITEMS_KV is not available");
			return new Response("Storage unavailable", { status: 503 });
		}
		
		console.log("Attempting to parse request body...");
		const item = await request.json() as SavedItem;
		console.log(`Successfully parsed request body for item ID: ${item?.id}`);

		// Validate the item
		if (!item || !item.id || !item.url || !item.title) {
			console.error(`Invalid item data received:`, item);
			return new Response("Invalid item data", { status: 400 });
		}
		
		console.log(`Processing item: ${item.id} for URL: ${item.url}`);
		
		// Use waitUntil for the KV operation to ensure it completes
		const kvPromise = env.SAVED_ITEMS_KV.put(item.id, JSON.stringify(item));
		
		// Use waitUntil to ensure the operation completes even if the response returns first
		ctx.waitUntil(kvPromise.then(
			() => console.log(`Successfully wrote item ${item.id} to KV.`),
			(err) => console.error(`Error writing item ${item.id} to KV:`, err)
		));
		
		// Wait for the KV operation to complete before sending response
		await kvPromise;
		
		console.log(`Saved item ${item.id}`);
		return new Response(JSON.stringify(item), { 
			status: 201,
			headers: { "Content-Type": "application/json" }
		});
	} catch (e) {
		console.error(`Error in POST /items handler:`, e instanceof Error ? e.stack : e);
		const errorMessage = e instanceof Error ? e.message : "Failed to save item";
		return new Response(errorMessage, { status: 500 });
	}
});

// GET /items - Retrieve all saved items (can be inefficient for large datasets)
router.get("/items", async (request: IRequest, env: Env, ctx: ExecutionContext) => {
	try {
		// Verify KV namespace exists
		if (!env.SAVED_ITEMS_KV) {
			console.error("KV namespace SAVED_ITEMS_KV is not available");
			return new Response("Storage unavailable", { status: 503 });
		}

		const listResult = await env.SAVED_ITEMS_KV.list();
		const keys = listResult.keys.map((key) => key.name);

		const items: SavedItem[] = [];
		const fetchPromises = keys.map(async (key) => {
			try {
				const value = await env.SAVED_ITEMS_KV.get(key);
				if (value) {
					try {
						items.push(JSON.parse(value));
					} catch (parseError) {
						console.error(`Failed to parse item with key ${key}:`, parseError);
						// Optionally skip or handle corrupted data
					}
				}
			} catch (fetchError) {
				console.error(`Error fetching key ${key}:`, fetchError);
			}
		});

		// Use waitUntil to ensure all fetches complete
		const fetchAllPromise = Promise.all(fetchPromises);
		ctx.waitUntil(fetchAllPromise);
		
		// Wait for all fetches to complete
		await fetchAllPromise;

		console.log(`Retrieved ${items.length} items`);
		return new Response(JSON.stringify(items), {
			headers: { "Content-Type": "application/json" }
		});
	} catch (e) {
		console.error("Error retrieving items:", e instanceof Error ? e.stack : e);
		const errorMessage = e instanceof Error ? e.message : "Failed to retrieve items";
		return new Response(errorMessage, { status: 500 });
	}
});

// GET /items/:id - Retrieve a specific item
router.get("/items/:id", async (request: IRequest, env: Env) => {
	const { id } = request.params;
	if (!id) {
		return new Response("Missing item ID", { status: 400 });
	}

	try {
		// Verify KV namespace exists
		if (!env.SAVED_ITEMS_KV) {
			console.error("KV namespace SAVED_ITEMS_KV is not available");
			return new Response("Storage unavailable", { status: 503 });
		}

		const value = await env.SAVED_ITEMS_KV.get(id);

		if (value === null) {
			return new Response("Item not found", { status: 404 });
		}

		console.log(`Retrieved item ${id}`);
		// Assuming the value is a JSON string of SavedItem
		return new Response(value, {
			headers: { "Content-Type": "application/json" }
		});
	} catch (e) {
		console.error(`Error retrieving item ${id}:`, e instanceof Error ? e.stack : e);
		const errorMessage = e instanceof Error ? e.message : "Failed to retrieve item";
		return new Response(errorMessage, { status: 500 });
	}
});

// DELETE /items/:id - Delete a specific item
router.delete("/items/:id", async (request: IRequest, env: Env) => {
	const { id } = request.params;
	if (!id) {
		return new Response("Missing item ID", { status: 400 });
	}

	try {
		// Verify KV namespace exists
		if (!env.SAVED_ITEMS_KV) {
			console.error("KV namespace SAVED_ITEMS_KV is not available");
			return new Response("Storage unavailable", { status: 503 });
		}

		await env.SAVED_ITEMS_KV.delete(id);
		console.log(`Deleted item ${id}`);
		return new Response(null, { status: 204 }); // No Content
	} catch (e) {
		console.error(`Error deleting item ${id}:`, e instanceof Error ? e.stack : e);
		const errorMessage = e instanceof Error ? e.message : "Failed to delete item";
		return new Response(errorMessage, { status: 500 });
	}
});

// Handle OPTIONS requests for CORS
router.options("*", handleOptions);

// Catch-all for 404s
router.all("*", () => new Response("404, not found!", { status: 404 }));

// Export the fetch handler
export default {
	async fetch(
		request: IRequest,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// Set a default fallback response
		let response: Response = new Response("Internal Server Error: Fallback response", {
			status: 500
		});
		
		try {
			// Handle OPTIONS separately for CORS preflight
			if (request.method === "OPTIONS") {
				return handleOptions(request);
			}
			
			// Log all requests for debugging
			console.log(`Processing ${request.method} request to ${request.url}`);
			
			// Use the router to handle the request
			const routerResponse = await router.handle(request, env, ctx);
			
			// Properly handle different response types
			if (routerResponse instanceof Response) {
				response = routerResponse;
			} else if (routerResponse !== undefined && routerResponse !== null) {
				// Convert non-Response values to a Response
				console.warn(
					`Router returned non-Response object: ${typeof routerResponse}. Converting.`
				);
				response = new Response(
					typeof routerResponse === 'object' ? JSON.stringify(routerResponse) : String(routerResponse),
					{ 
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			} else {
				console.error(`Router handler did not return a valid Response`);
				response = new Response("No response from router", { status: 500 });
			}
		} catch (error) {
			// Log errors but don't rethrow
			console.error(
				`Error handling ${request.method} ${request.url}:`, 
				error instanceof Error ? error.stack : error
			);
			
			const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
			response = new Response(errorMessage, { status: 500 });
		}
		
		// Safely add CORS headers
		try {
			return corsify(response);
		} catch (corsError) {
			console.error("Error adding CORS headers:", corsError);
			return response; // Return original response if corsify fails
		}
	},
};
