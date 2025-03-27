import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig({
	server: {
		host: "::",
		port: 8080,
	},
	plugins: [
		react({
			// Force using React import with JSX
			jsxImportSource: "react",
			jsxRuntime: "classic",
		}),
		// Add Node.js polyfills - reduce to only what's essential
		nodePolyfills({
			// Whether to polyfill specific globals
			globals: {
				process: true,
				Buffer: true,
				global: true,
			},
			// Minimize included polyfills
			include: ["util", "path", "events"],
			// Whether to polyfill `node:` protocol imports
			protocolImports: true,
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	define: {
		// Ensure process is defined for any remaining references
		global: "globalThis",
	},
	build: {
		target: "es2020",
		outDir: "dist",
	},
});
