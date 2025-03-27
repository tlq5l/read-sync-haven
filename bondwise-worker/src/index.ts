import { Router, type IRequest } from "itty-router"; // Use IRequest and import type

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

// Helper function to add CORS headers to responses
function corsify(response: Response): Response {
	for (const [key, value] of Object.entries(corsHeaders)) {
		response.headers.set(key, value);
	}
	return response;
}

// --- API Routes ---

// POST /items - Save a new item
router.post("/items", async (request: IRequest, env: Env) => {
	try {
		const item = (await request.json()) as SavedItem; // Assuming body is a SavedItem

		// Basic validation (add more robust validation later)
		if (!item || !item.id || !item.url || !item.title) {
			return corsify(new Response("Invalid item data", { status: 400 }));
		}

		// Store in KV using the item's ID as the key
		// We store the full object as a JSON string
		await env.SAVED_ITEMS_KV.put(item.id, JSON.stringify(item));

		console.log(`Saved item ${item.id}`);
		return corsify(new Response(JSON.stringify(item), { status: 201 }));
	} catch (e) {
		console.error("Error saving item:", e);
		const errorMessage = e instanceof Error ? e.message : "Failed to save item";
		return corsify(new Response(errorMessage, { status: 500 }));
	}
});

// GET /items - Retrieve all saved items (can be inefficient for large datasets)
router.get("/items", async (request: IRequest, env: Env) => {
	try {
		const listResult = await env.SAVED_ITEMS_KV.list();
		const keys = listResult.keys.map((key) => key.name);

		const items: SavedItem[] = [];
		for (const key of keys) {
			const value = await env.SAVED_ITEMS_KV.get(key);
			if (value) {
				try {
					items.push(JSON.parse(value));
				} catch (parseError) {
					console.error(`Failed to parse item with key ${key}:`, parseError);
					// Optionally skip or handle corrupted data
				}
			}
		}

		console.log(`Retrieved ${items.length} items`);
		return corsify(
			new Response(JSON.stringify(items), {
				headers: { "Content-Type": "application/json" },
			}),
		);
	} catch (e) {
		console.error("Error retrieving items:", e);
		const errorMessage =
			e instanceof Error ? e.message : "Failed to retrieve items";
		return corsify(new Response(errorMessage, { status: 500 }));
	}
});

// GET /items/:id - Retrieve a specific item
router.get("/items/:id", async (request: IRequest, env: Env) => {
	const { id } = request.params;
	if (!id) {
		return corsify(new Response("Missing item ID", { status: 400 }));
	}

	try {
		const value = await env.SAVED_ITEMS_KV.get(id);

		if (value === null) {
			return corsify(new Response("Item not found", { status: 404 }));
		}

		console.log(`Retrieved item ${id}`);
		// Assuming the value is a JSON string of SavedItem
		return corsify(
			new Response(value, {
				headers: { "Content-Type": "application/json" },
			}),
		);
	} catch (e) {
		console.error(`Error retrieving item ${id}:`, e);
		const errorMessage =
			e instanceof Error ? e.message : "Failed to retrieve item";
		return corsify(new Response(errorMessage, { status: 500 }));
	}
});

// DELETE /items/:id - Delete a specific item
router.delete("/items/:id", async (request: IRequest, env: Env) => {
	const { id } = request.params;
	if (!id) {
		return corsify(new Response("Missing item ID", { status: 400 }));
	}

	try {
		await env.SAVED_ITEMS_KV.delete(id);
		console.log(`Deleted item ${id}`);
		return corsify(new Response(null, { status: 204 })); // No Content
	} catch (e) {
		console.error(`Error deleting item ${id}:`, e);
		const errorMessage =
			e instanceof Error ? e.message : "Failed to delete item";
		return corsify(new Response(errorMessage, { status: 500 }));
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
		// Change type annotation to IRequest
		// Handle OPTIONS separately for CORS preflight
		if (request.method === "OPTIONS") {
			return handleOptions(request);
		}

		try {
			const response = await router.handle(request, env, ctx);
			// Add CORS headers to the actual response
			return corsify(response);
		} catch (error) {
			console.error("Unhandled error in fetch handler:", error);
			const errorMessage =
				error instanceof Error ? error.message : "Internal Server Error";
			// Ensure CORS headers are added even for errors
			return corsify(new Response(errorMessage, { status: 500 }));
		}
	},
};
