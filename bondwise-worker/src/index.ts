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
  async fetch(request, env, ctx) {
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
        // POST /items - just echo back the received item for testing
        const item = await request.json();
        
        console.log("Received item:", item);
        
        return new Response(JSON.stringify({
          status: "success",
          message: "Item received (but not saved to KV yet)",
          item: item,
          receivedAt: new Date().toISOString()
        }), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
      else if (path === "/items" && request.method === "GET") {
        // GET /items - return empty array for now
        return new Response(JSON.stringify([]), {
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
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
