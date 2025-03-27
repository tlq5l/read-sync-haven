export default {
  async fetch(request, env, ctx) {
    // Simple CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    
    // Handle OPTIONS requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    
    console.log(`Processing ${request.method} request to ${request.url}`);
    
    // Return a simple JSON response
    return new Response(JSON.stringify({
      status: "ok",
      message: "Bondwise API is running",
      time: new Date().toISOString(),
      path: new URL(request.url).pathname
    }), {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
};
