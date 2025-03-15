import react from "@vitejs/plugin-react-swc";
import { componentTagger } from "lovable-tagger";
import path from "path";
import { defineConfig } from "vite";
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    // Add Node.js polyfills
    nodePolyfills({
      // Whether to polyfill specific globals
      globals: {
        process: true,
        Buffer: true,
        global: true,
      },
      // Whether to polyfill specific modules
      include: [
        'util',
        'path',
        'stream',
        'events',
        'http',
        'https',
      ],
      // Whether to polyfill `node:` protocol imports
      protocolImports: true,
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Ensure process is defined for any remaining references
    global: 'globalThis',
  },
}));
