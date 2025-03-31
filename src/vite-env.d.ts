/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_CLERK_PUBLISHABLE_KEY: string;
	readonly VITE_GCF_SUMMARIZE_URL?: string; // Add optional GCF URL for dev
	readonly VITE_GCF_CHAT_URL?: string; // Add optional GCF URL for dev
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
	// Add type definition for Vitest's injected property
	readonly vitest?: typeof import("vitest");
}
