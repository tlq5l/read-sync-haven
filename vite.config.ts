import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
		mode === "development" && componentTagger(),
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
	].filter(Boolean),
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	optimizeDeps: {
		include: ["@mui/material/esm", "@mui/icons-material/esm", "react-dom"],
		esbuildOptions: {
			target: "es2020",
		},
	},
	define: {
		// Ensure process is defined for any remaining references
		global: "globalThis",
	},
	build: {
		// Set higher chunk size warning limit
		chunkSizeWarningLimit: 1000,
		rollupOptions: {
			output: {
				// Configure manual chunks to optimize bundle size
				manualChunks: {
					// UI components from shadcn/ui
					ui: [
						"./src/components/ui/button.tsx",
						"./src/components/ui/card.tsx",
						"./src/components/ui/dialog.tsx",
						"./src/components/ui/input.tsx",
						"./src/components/ui/dropdown-menu.tsx",
						"./src/components/ui/toast.tsx",
					],
					// Core React dependencies
					vendor: ["react", "react-dom", "react-router-dom"],
					// Database-related code
					database: ["pouchdb-browser", "pouchdb-find"],
					// Parser and content utilities
					parser: [
						"@mozilla/readability",
						"dompurify",
						"turndown",
						"html-react-parser",
					],
				},
			},
		},
	},
}));
