import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { GoogleAuth } from "google-auth-library"; // Import GoogleAuth
import { type Plugin, defineConfig, loadEnv } from "vite"; // Moved vite import down
import { nodePolyfills } from "vite-plugin-node-polyfills";

// // Custom plugin to provide GCF token during development
// function gcfDevTokenProvider(): Plugin {
// 	return {
// 		name: "vite-plugin-gcf-dev-token",
// 		configureServer(server) {
// 			// Load .env variables for server-side use
// 			const env = loadEnv("development", process.cwd(), "");
// 			const gcfUrl = env.VITE_GCF_SUMMARIZE_URL;

// 			if (!gcfUrl) {
// 				console.warn(
// 					"VITE_GCF_SUMMARIZE_URL not found in .env file. GCF token endpoint will not work.",
// 				);
// 				return;
// 			}

// 			server.middlewares.use(async (req, res, next) => {
// 				if (req.url === "/api/get-gcf-token") {
// 					console.log("Received request for GCF token...");
// 					try {
// 						const auth = new GoogleAuth();
// 						// Get the client using ADC
// 						const client = await auth.getClient();
// 						// Check if the client supports fetchIdToken (it should for ADC)
// 						if (
// 							client &&
// 							"fetchIdToken" in client &&
// 							typeof client.fetchIdToken === "function"
// 						) {
// 							const idToken = await client.fetchIdToken(gcfUrl); // Fetch token with audience
// 							console.log("Successfully fetched GCF token.");
// 							res.setHeader("Content-Type", "application/json");
// 							res.end(JSON.stringify({ token: idToken }));
// 						} else {
// 							throw new Error(
// 								"Authenticated client does not support fetchIdToken.",
// 							);
// 						}
// 					} catch (error: any) {
// 						console.error("Error fetching GCF token:", error);
// 						// Check if the error is due to ADC not being configured
// 						if (
// 							error.message?.includes(
// 								"Could not load the default credentials",
// 							) ||
// 							error.message?.includes("Unable to detect a Project Id")
// 						) {
// 							res.statusCode = 500;
// 							res.setHeader("Content-Type", "application/json");
// 							res.end(
// 								JSON.stringify({
// 									error:
// 										"Failed to get GCF token. Application Default Credentials (ADC) might not be configured. Run 'gcloud auth application-default login' in your terminal.",
// 								}),
// 							);
// 						} else {
// 							res.statusCode = 500;
// 							res.setHeader("Content-Type", "application/json");
// 							res.end(
// 								JSON.stringify({
// 									error: "Internal server error fetching GCF token.",
// 									details: error.message,
// 								}),
// 							);
// 						}
// 					}
// 				} else {
// 					next(); // Pass request to next middleware if URL doesn't match
// 				}
// 			});
// 		},
// 	};
// }

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
	// Accept mode here
	server: {
		host: "::",
		port: 8080,
	},
	plugins: [
		// Add the custom plugin for development only - Placed first
		// mode === "development" ? gcfDevTokenProvider() : null, // Use mode variable
		react({
			jsxImportSource: "react",
			// jsxRuntime: "classic", // Removed invalid option
		}),
		nodePolyfills({
			// Exclude polyfills that might bring in 'asn1.js' and aren't typically needed/fully functional in browsers
			exclude: ["vm", "crypto", "https", "tls"],
			globals: {
				process: true,
				Buffer: true,
				global: true,
			},
			// Removed 'include' array to polyfill all supported modules by default
			protocolImports: true,
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
		dedupe: ["react", "react-dom"], // Ensure single instance
	},
	define: {
		global: "globalThis",
	},
	build: {
		target: "es2020",
		outDir: "dist",
		// Increase warning limit to avoid seeing the warning
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			output: {
				// Implement intelligent code-splitting
				manualChunks: (id) => {
					// Split Clerk authentication
					if (id.includes("@clerk")) {
						return "vendor-clerk";
					}

					// Split UI components (Radix, Lucide)
					if (
						id.includes("@/components/ui") ||
						id.includes("@radix-ui") ||
						id.includes("lucide-react")
					) {
						return "ui-components";
					}

					// Split PouchDB
					if (id.includes("pouchdb")) {
						return "vendor-pouchdb";
					}

					// Split potentially large dependencies
					if (id.includes("epubjs")) {
						return "vendor-epubjs";
					}
					if (id.includes("recharts")) {
						return "vendor-recharts";
					}
					if (id.includes("@mozilla/readability")) {
						return "vendor-readability";
					}
					if (id.includes("dompurify")) {
						return "vendor-dompurify";
					}
					if (id.includes("turndown")) {
						return "vendor-turndown";
					}

					// Catch-all for other node_modules
					if (id.includes("node_modules")) {
						return "vendor-deps"; // Remaining smaller deps
					}
				},
			},
		},
	},
})); // Close the function call
