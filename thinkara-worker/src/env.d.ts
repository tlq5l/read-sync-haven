/// <reference types="vite/client" />
/// <reference types="@cloudflare/workers-types" />

// Extend ImportMetaEnv for vitest-environment-miniflare bindings
interface ImportMetaEnv {
	readonly SAVED_ITEMS_KV: KVNamespace;
	// Add other bindings defined in vitest.config.ts if needed for direct access in tests
	// readonly OTHER_BINDING: Fetcher;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
