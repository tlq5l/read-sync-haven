// src/types/pouchdb-memory.d.ts

// It seems 'pouchdb-adapter-memory' is the actual module used for the plugin
// Let's declare that one based on how it's used in config.ts
declare module "pouchdb-adapter-memory" {
	const plugin: PouchDB.Plugin;
	export default plugin;
}

// Keep the declaration for 'pouchdb-memory' as well, since it's imported in tests
// and is the installed package. This might be redundant but covers both import styles.
declare module "pouchdb-memory" {
	const plugin: PouchDB.Plugin;
	export default plugin;
}

// Augment PouchDB Static interface to recognize the 'memory' adapter option
// This helps if you construct PouchDB directly with the adapter option.
declare namespace PouchDB {
	namespace Core {
		// interface DatabaseInfo { } // Removed empty interface
	}

	interface Static {
		new <Content extends Record<string, unknown> = Record<string, unknown>>(
			// Use Record<string, unknown> instead of {}
			name?: string | null,
			options?: Configuration.DatabaseConfiguration & { adapter: "memory" },
		): Database<Content>;
	}
}
