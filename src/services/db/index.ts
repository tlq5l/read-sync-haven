// src/services/db/index.ts

// --- Core Initialization & Config ---
export {
	articlesDb,
	highlightsDb,
	initializeDatabase,
	tagsDb,
} from "./config";

// --- Types ---
export type { Article, Highlight, Tag } from "./types";

// --- Utilities ---
export {
	arrayBufferToBase64,
	executeWithRetry,
	isOffline,
	registerOfflineListeners,
} from "./utils";

// --- Article Operations ---
export {
	deleteArticle,
	getAllArticles,
	getArticle,
	removeDuplicateArticles,
	saveArticle,
	updateArticle,
} from "./articles";

// --- Highlight Operations ---
export {
	deleteHighlight,
	getHighlightsByArticle,
	saveHighlight,
	updateHighlight,
} from "./highlights";

// --- Tag Operations ---
export { deleteTag, getAllTags, saveTag, updateTag } from "./tags";

// --- Sync Functionality Placeholder ---
// --- Migrations ---
export { updateMissingMetadata } from "./migrations";

// Re-exporting the placeholder from the original file,
// but this should eventually be implemented properly or removed.
export function setupSync() {
	// This function does not currently use remote sync features
	console.log(
		"Sync functionality is not implemented - no remote database sync is available",
	);
	// Remote sync has been disabled to avoid security vulnerabilities
	// If sync is needed in the future, use a more secure approach than the
	// deprecated request library that has vulnerabilities
}
