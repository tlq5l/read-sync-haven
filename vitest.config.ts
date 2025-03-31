/// <reference types="vitest" />
import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		react(), // Include React plugin
		nodePolyfills({
			// Include node polyfills
			// Removed globals section as it might conflict with jsdom
			include: ["util", "path", "events"],
			protocolImports: true,
		}),
	],
	test: {
		globals: true,
		environment: "jsdom", // Keep jsdom environment
		setupFiles: "./src/setupTests.ts", // Keep setup file
		// Optional: Configure coverage
		// coverage: {
		//   provider: 'v8',
		//   reporter: ['text', 'json', 'html'],
		// },
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
	},
});
