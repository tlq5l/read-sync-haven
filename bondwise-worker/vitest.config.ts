import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Use the miniflare environment to simulate the Cloudflare Workers runtime
		environment: "miniflare",
		// Optional: Configure the miniflare environment
		environmentOptions: {
			// Specify bindings, KV namespaces, etc., needed for your tests
			// These should match your wrangler.toml configuration
			kvNamespaces: ["SAVED_ITEMS_KV"],
			// Example of adding environment variables:
			// vars: { GCF_SUMMARIZE_URL: "http://localhost:8080/summarize" },
			// Example of adding secrets:
			// secrets: { CLERK_SECRET_KEY: "test_secret_key" },
		},
		// Optional: Add setup files if needed
		// setupFiles: ['./test/setup.ts'],
		globals: true, // Use Vitest's global APIs
		// Include source files in coverage report
		coverage: {
			provider: "v8", // or 'istanbul'
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
		},
	},
});