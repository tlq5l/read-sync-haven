// src/services/db/index.ts

// --- Core Initialization & Config ---
export {
	initializeDatabase,
	articlesDb,
	highlightsDb,
	tagsDb,
} from "./config";

// --- Types ---
export type { Article, Highlight, Tag } from "./types";

// --- Utilities ---
export {
	isOffline,
	registerOfflineListeners,
	executeWithRetry,
	arrayBufferToBase64, // Export if needed externally, otherwise keep internal
} from "./utils";

// --- Article Operations ---
export {
	saveArticle,
	getArticle,
	updateArticle,
	deleteArticle,
	getAllArticles,
	removeDuplicateArticles,
	bulkSaveArticles, // Added bulk save function
} from "./articles";

// --- Highlight Operations ---
export {
	saveHighlight,
	getHighlightsByArticle,
	updateHighlight,
	deleteHighlight,
} from "./highlights";

// --- Tag Operations ---
export { saveTag, getAllTags, deleteTag, updateTag } from "./tags";

// --- Sync Functionality Placeholder ---
// --- Migrations ---
export { updateMissingMetadata } from "./migrations";

// Re-exporting the placeholder from the original file,
// but this should eventually be implemented properly or removed.
export function setupSync() {
	// This function will set up sync with a remote CouchDB server
	console.log(
		"Sync functionality needs implementation (consider PouchDB replication)",
	);
	// Example:
	// const remoteDB = new PouchDB('http://example.com/remote-db');
	// articlesDb.sync(remoteDB, { live: true, retry: true })
	//   .on('change', (info) => console.log('Sync change:', info))
	//   .on('paused', (err) => console.log('Sync paused:', err))
	//   .on('active', () => console.log('Sync active'))
	//   .on('denied', (err) => console.error('Sync denied:', err))
	//   .on('complete', (info) => console.log('Sync complete:', info))
	//   .on('error', (err) => console.error('Sync error:', err));
	// Repeat for highlightsDb and tagsDb if needed.
}
