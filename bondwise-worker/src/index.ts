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
    // Simple CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    
    // Handle OPTIONS requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    
    try {
      // Parse the URL to extract the path
      const url = new URL(request.url);
      const path = url.pathname;
      
      console.log(`Processing ${request.method} request to ${path}`);
      
      // Check if KV namespace is available
      if (!env.SAVED_ITEMS_KV) {
        console.error("KV namespace is not available");
        throw new Error("Storage unavailable");
      }
      
      // Basic router implementation
      if (path === "/" && request.method === "GET") {
        // Root path handler
        return new Response(JSON.stringify({
          status: "ok",
          message: "Bondwise API is running",
          time: new Date().toISOString(),
          endpoints: ["/items"]
        }), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      } 
      else if (path === "/items" && request.method === "POST") {
        // POST /items - Save a new item
        const item = await request.json() as SavedItem;
        
        // Validate the item
        if (!item || !item.id || !item.url || !item.title) {
          return new Response(JSON.stringify({
            status: "error",
            message: "Invalid item data"
          }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          });
        }
        
        console.log(`Processing item: ${item.id} for URL: ${item.url}`);
        
        // Save to KV
        const kvPromise = env.SAVED_ITEMS_KV.put(item.id, JSON.stringify(item));
        
        // Use waitUntil to ensure operation completes
        ctx.waitUntil(kvPromise.then(
          () => console.log(`Successfully wrote item ${item.id} to KV.`),
          (err) => console.error(`Error writing item ${item.id} to KV:`, err)
        ));
        
        // Wait for KV operation before responding
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
      }
      else if (path === "/items" && request.method === "GET") {
        // GET /items - Retrieve all items
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
              }
            }
          }
          
          return new Response(JSON.stringify(items), {
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          });
        } catch (kvError) {
          console.error("Error retrieving items from KV:", kvError);
          throw new Error("Failed to retrieve items");
        }
      }
      else {
        // Not found handler
        return new Response(JSON.stringify({
          status: "error",
          message: "Not found"
        }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    } catch (error) {
      // Error handler
      console.error("Worker error:", error);
      
      return new Response(JSON.stringify({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
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
