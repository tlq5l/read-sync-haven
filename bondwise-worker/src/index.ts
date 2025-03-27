// Define the environment interface for TypeScript
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // CORS headers for all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    
    // Handle OPTIONS requests (CORS preflight)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    
    try {
      // Parse URL to determine the endpoint
      const url = new URL(request.url);
      const path = url.pathname;
      const pathParts = path.split('/').filter(Boolean);
      
      console.log(`Processing ${request.method} request to ${path}`);
      
      // Verify KV namespace is available
      if (!env.SAVED_ITEMS_KV) {
        console.error("KV namespace is not available");
        throw new Error("Storage unavailable");
      }
      
      // Root endpoint
      if (path === "/" || path === "") {
        return new Response(JSON.stringify({
          status: "ok",
          message: "Bondwise Sync API is running",
          version: "1.0.0",
          endpoints: ["/items"]
        }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
      
      // Items collection endpoints
      if (pathParts[0] === "items") {
        // GET /items - List all items
        if (pathParts.length === 1 && request.method === "GET") {
          try {
            const listResult = await env.SAVED_ITEMS_KV.list();
            const keys = listResult.keys.map(key => key.name);
            
            const items: SavedItem[] = [];
            for (const key of keys) {
              const value = await env.SAVED_ITEMS_KV.get(key);
              if (value) {
                try {
                  items.push(JSON.parse(value));
                } catch (parseError) {
                  console.error(`Failed to parse item with key ${key}:`, parseError);
                }
              }
            }
            
            return new Response(JSON.stringify(items), {
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            });
          } catch (listError) {
            console.error("Error listing items:", listError);
            throw new Error("Failed to list items");
          }
        }
        
        // POST /items - Create a new item
        if (pathParts.length === 1 && request.method === "POST") {
          const item = await request.json() as SavedItem;
          
          // Validate required fields
          if (!item || !item.id || !item.url || !item.title) {
            return new Response(JSON.stringify({
              status: "error",
              message: "Invalid item data - missing required fields"
            }), {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            });
          }
          
          console.log(`Processing item: ${item.id} for URL: ${item.url}`);
          
          try {
            // Store the item in KV
            const kvPromise = env.SAVED_ITEMS_KV.put(item.id, JSON.stringify(item));
            
            // Use waitUntil to ensure operation completes even if response is sent
            ctx.waitUntil(kvPromise.then(
              () => console.log(`Successfully wrote item ${item.id} to KV.`),
              (err) => console.error(`Error writing item ${item.id} to KV:`, err)
            ));
            
            // Wait for KV operation to complete before sending response
            await kvPromise;
            
            return new Response(JSON.stringify({
              status: "success",
              message: "Item saved successfully",
              item: item,
              savedAt: new Date().toISOString()
            }), {
              status: 201,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            });
          } catch (saveError) {
            console.error(`Error saving item ${item.id}:`, saveError);
            throw new Error("Failed to save item");
          }
        }
        
        // GET /items/:id - Get a specific item
        if (pathParts.length === 2 && request.method === "GET") {
          const id = pathParts[1];
          
          try {
            const value = await env.SAVED_ITEMS_KV.get(id);
            
            if (value === null) {
              return new Response(JSON.stringify({
                status: "error",
                message: "Item not found"
              }), {
                status: 404,
                headers: {
                  "Content-Type": "application/json",
                  ...corsHeaders
                }
              });
            }
            
            return new Response(value, {
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            });
          } catch (getError) {
            console.error(`Error retrieving item ${id}:`, getError);
            throw new Error("Failed to retrieve item");
          }
        }
        
        // DELETE /items/:id - Delete a specific item
        if (pathParts.length === 2 && request.method === "DELETE") {
          const id = pathParts[1];
          
          try {
            await env.SAVED_ITEMS_KV.delete(id);
            
            return new Response(JSON.stringify({
              status: "success",
              message: "Item deleted successfully"
            }), {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders
              }
            });
          } catch (deleteError) {
            console.error(`Error deleting item ${id}:`, deleteError);
            throw new Error("Failed to delete item");
          }
        }
      }
      
      // If we reach here, the endpoint was not found
      return new Response(JSON.stringify({
        status: "error",
        message: "Endpoint not found"
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    } catch (error) {
      // Global error handler
      console.error("Worker error:", error);
      
      return new Response(JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }
  }
};
