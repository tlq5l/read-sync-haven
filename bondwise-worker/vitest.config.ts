import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Use the miniflare environment to simulate the Cloudflare Workers runtime
		environment: "miniflare",
		// Optional: Configure the miniflare environment
		environmentOptions: {
			// Prevent loading wrangler.toml vars/secrets, use only those defined below
			wranglerConfigPath: false,
			// scriptPath removed - let Miniflare handle build or TS directly
			// Specify bindings, KV namespaces, etc., needed for your tests
			// These should match your wrangler.toml configuration
			kvNamespaces: ["SAVED_ITEMS_KV"],
			// Define environment variables needed by the worker handlers
			vars: {
				GCF_SUMMARIZE_URL: "http://fake-gcf.test/summarize", // Use .test TLD for mocks
				GCF_CHAT_URL: "http://fake-gcf.test/chat",
				// Add other VARS from wrangler.toml if they become necessary for tests
			},
			// Define secrets needed by the worker handlers
			secrets: {
				CLERK_SECRET_KEY: "TEST_CLERK_SECRET_KEY",
				CLERK_PUBLISHABLE_KEY: "TEST_CLERK_PUBLISHABLE_KEY",
				GCF_AUTH_SECRET: "TEST_GCF_SECRET",
				// Add other SECRETS from wrangler.toml if needed
			},
		},
		// Optional: Add setup files if needed
		setupFiles: ["./src/testSetup.ts"], // Load the worker-specific setup file
		globals: true, // Use Vitest's global APIs
		// Include source files in coverage report
		coverage: {
			provider: "v8", // or 'istanbul'
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
		},
	},
});
