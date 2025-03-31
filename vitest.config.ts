import { type ConfigEnv, loadEnv } from "vite"; // Import loadEnv from vite
/// <reference types="vitest" />
import { type UserConfig, defineConfig, mergeConfig } from "vitest/config";
import viteConfigFn from "./vite.config"; // Import the function

// Define a default environment for resolving the Vite config for tests
const testEnv: ConfigEnv = { command: "serve", mode: "test" };

// --- Resolve both configurations to objects ---

// 1. Resolve the Vite config object
const resolvedViteConfig = viteConfigFn(testEnv) as UserConfig;

// 2. Define the Vitest config function
const vitestConfigFn = ({ mode }: ConfigEnv): UserConfig => {
	// Load .env files based on the mode (usually 'test')
	// Load base .env file regardless of mode for test environment
	const env = loadEnv("", process.cwd(), ""); // Use empty string for mode to load base .env
	return {
		// Define environment variables at the top level for Vitest
		define: {
			"import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(
				env.VITE_CLERK_PUBLISHABLE_KEY,
			),
			// Add other VITE_ variables needed by your tests here if any
		},
		test: {
			globals: true,
			environment: "jsdom",
			setupFiles: "./src/setupTests.ts",
			// Optional: Configure coverage
			// coverage: {
			//   provider: 'v8',
			//   reporter: ['text', 'json', 'html'],
			// },
		},
	};
};

// 3. Resolve the Vitest config object using the test environment
const resolvedVitestConfig = vitestConfigFn(testEnv);

// --- Merge the resolved configuration objects ---
export default mergeConfig(resolvedViteConfig, resolvedVitestConfig);
