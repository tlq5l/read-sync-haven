import { resolve } from "node:path"; // Add node: prefix
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vitejs.dev/config/
export default defineConfig({
	build: {
		outDir: resolve(__dirname, "dist"),
		emptyOutDir: true, // Clean the output directory before building
		rollupOptions: {
			input: {
				// Define entry points
				popup: resolve(__dirname, "popup/popup.html"),
				options: resolve(__dirname, "options.html"),
				background: resolve(__dirname, "src/background.ts"),
				content: resolve(__dirname, "src/content.ts"),
			},
			output: {
				// Configure output names and formats
				entryFileNames: (chunkInfo) => {
					// Keep original names for background and content scripts
					if (chunkInfo.name === "background" || chunkInfo.name === "content") {
						return "[name].js";
					}
					// Default naming for other entries (like popup script linked from HTML)
					return "assets/[name]-[hash].js";
				},
				chunkFileNames: "assets/chunks/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash].[ext]",
				// Specify format, especially for content script
				format: "es", // Use ES module format for background/popup
				// Override format specifically for content script if needed (Vite might handle this automatically via HTML entry)
				// If content script still fails, we might need manual format override here or separate build steps.
			},
		},
		// Minification can sometimes cause issues with extensions, disable for now
		minify: false,
	},
	plugins: [
		viteStaticCopy({
			targets: [
				{
					src: "manifest.json",
					dest: ".", // Copy to the root of dist
				},
				{
					src: "icons",
					dest: ".", // Copy icons directory to the root of dist
				},
				{
					src: "popup/popup.css", // Copy popup CSS
					dest: "popup",
				},
				// No need to copy options.html as it's now an entry point
			],
		}),
	],
	// Define __dirname for ES modules
	define: {
		__dirname: JSON.stringify(new URL(".", import.meta.url).pathname),
	},
});
