import path from "node:path";
/// <reference types="vitest" />
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		react(), // Include React plugin
	],
	test: {
		globals: true,
		environment: "jsdom", // Revert back to jsdom environment
		setupFiles: "./src/setupTests.ts", // Keep setup file
		// Optional: Configure coverage
		// coverage: {
		//   provider: 'v8',
		//   reporter: ['text', 'json', 'html'],
		// },
		environmentOptions: {
			jsdom: {
				// Add any jsdom-specific options here
			},
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"), // Keep path alias
		},
		dedupe: ["react", "react-dom"], // Keep dedupe
	},
	define: {
		global: "globalThis", // Keep global define
		// If your tests need environment variables, load and define them here
		// Example:
		// 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(process.env.VITE_CLERK_PUBLISHABLE_KEY),
		"import.meta.env.VITEST": "true",
	},
});
