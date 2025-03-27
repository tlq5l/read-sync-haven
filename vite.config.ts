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
      jsxImportSource: "react",
      jsxRuntime: "classic",
    }),
    nodePolyfills({
      globals: {
        process: true,
        Buffer: true,
        global: true,
      },
      include: ["util", "path", "events"],
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
          // Split Clerk authentication into separate chunk
          if (id.includes('@clerk')) {
            return 'vendor-clerk';
          }
          
          // Split React and related libraries
          if (id.includes('react') || 
              id.includes('react-dom') || 
              id.includes('react-router')) {
            return 'vendor-react';
          }
          
          // Split UI components
          if (id.includes('@/components/ui') || 
              id.includes('@radix-ui') || 
              id.includes('lucide-react')) {
            return 'ui-components';
          }
          
          // Split PouchDB
          if (id.includes('pouchdb')) {
            return 'vendor-pouchdb';
          }
          
          // Split utilities and other third-party libraries
          if (id.includes('node_modules')) {
            return 'vendor-deps';
          }
        }
      }
    }
  },
});
