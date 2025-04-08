// src/services/db/dexie.ts
import Dexie, { type Table } from "dexie";
import type { Article, ArticleCategory, Highlight, Tag } from "./types"; // Import existing types, added ArticleCategory

// Remove PouchDB specific fields from types for Dexie
// We'll use a simplified ID, likely a string UUID, as the primary key.
// Dexie typically uses 'id' or '++id' for auto-incrementing primary keys,
// but since we used UUIDs (_id) in PouchDB, let's stick with a string 'id'.
export interface DexieArticle
	extends Omit<Article, "_id" | "_rev" | "_deleted" | "version"> {
	id: string; // Primary key for Dexie
	url: string; // Explicitly add URL as it's used for duplicate check
	// Add compound indexes or multi-entry indexes as needed
	// Example: *tags for multi-entry index on the tags array
	// Example: [userId+savedAt] for compound index
}

export interface DexieHighlight extends Omit<Highlight, "_id" | "_rev"> {
	id: string; // Primary key for Dexie
}

export interface DexieTag extends Omit<Tag, "_id" | "_rev"> {
	id: string; // Primary key for Dexie
}
// Define DexieArticle class for mapping (optional but good practice)
// Dexie pattern requires class implementing matching interface
export class DexieArticle implements DexieArticle {
	constructor(
		public id: string,
		public title: string,
		public url: string,
		public content: string,
		public excerpt: string,
		public savedAt: number,
		public isRead: boolean,
		public favorite: boolean,
		public tags: string[],
		public type: "article" | "pdf" | "note" | "epub",
		public status: "inbox" | "later" | "archived",
		public userId?: string,
		public author?: string,
		public publishedDate?: string,
		public readAt?: number,
		public siteName?: string,
		public estimatedReadTime?: number,
		public readingProgress?: number,
		public fileData?: string,
		public fileSize?: number,
		public fileName?: string,
		public pageCount?: number,
		public category?: ArticleCategory,
		public htmlContent?: string,
		public scrollPosition?: number,
		public coverImage?: string,
		public language?: string,
		public deletedAt?: number, // Keep for potential soft-delete logic if needed locally
	) {}
}

// Define DexieHighlight class for mapping
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: Dexie pattern requires class implementing matching interface
export class DexieHighlight implements DexieHighlight {
	constructor(
		public id: string,
		public articleId: string,
		public text: string,
		public color: string,
		public createdAt: number,
		public position: {
			start: number | string;
			end: number | string;
			pageNumber?: number;
		},
		public tags: string[],
		public note?: string,
		public userId?: string,
	) {}
}

// Define DexieTag class for mapping
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: Dexie pattern requires class implementing matching interface
export class DexieTag implements DexieTag {
	constructor(
		public id: string,
		public name: string,
		public color: string,
		public createdAt: number,
		public userId?: string,
	) {}
}

export class ReadSyncDexie extends Dexie {
	// Define tables (stores) based on the interfaces
	articles!: Table<DexieArticle, string>; // Primary key is string (id)
	highlights!: Table<DexieHighlight, string>; // Primary key is string (id)
	tags!: Table<DexieTag, string>; // Primary key is string (id)

	constructor() {
		super("ReadSyncDatabase"); // Database name

		// Define schema and indexes
		this.version(1).stores({
			articles: `
        id,
        url,
        userId,
        savedAt,
        isRead,
        favorite,
        status,
        type,
        category,
        siteName,
        *tags,
        [userId+savedAt],
        [userId+status],
        [userId+isRead],
        [userId+favorite],
        [userId+type],
        [userId+category],
        [userId+siteName],
        [userId+url]
      `, // 'id' is primary key, others are indexes. Added 'url' and compound index including it.
			highlights: `
        id,
        articleId,
        [articleId+createdAt]
      `, // 'id' is primary key, 'articleId' is an index. Compound index example.
			tags: `
        id,
        name,
        userId,
        [userId+name]
      `, // 'id' is primary key, 'name' & 'userId' are indexes. Compound index for user-specific unique names.
		});

		// Map PouchDB types to Dexie types (if needed, mainly for primary key 'id')
		this.articles.mapToClass(DexieArticle);
		this.highlights.mapToClass(DexieHighlight);
		this.tags.mapToClass(DexieTag);
	}
}

// Export a single instance of the Dexie database
export const db = new ReadSyncDexie();

// Helper type for Article primary key
export type ArticleId = DexieArticle["id"];

// --- Initialization Function ---
let initializationPromise: Promise<void> | null = null;

/**
 * Initializes the Dexie database by opening it.
 * Ensures initialization runs only once.
 * Dexie handles schema creation and upgrades automatically.
 * @returns {Promise<void>} Promise that resolves when the database is open.
 */
export async function initializeDexieDatabase(): Promise<void> {
	if (initializationPromise) {
		console.log(
			"Dexie database initialization already in progress or completed.",
		);
		return initializationPromise;
	}

	console.log("Starting Dexie database initialization...");
	initializationPromise = db
		.open()
		.then(() => {
			console.log("Dexie database opened successfully.");
		})
		.catch((error) => {
			console.error("Failed to open Dexie database:", error);
			initializationPromise = null; // Reset promise on failure
			throw error; // Re-throw the error
		});

	return initializationPromise;
}

// --- Duplicate Removal ---

/**
 * Removes duplicate articles based on their 'url', keeping only the one saved earliest.
 * @returns {Promise<number>} The number of duplicate articles removed.
 */
export async function removeDuplicateArticles(): Promise<number> {
	console.log("Starting duplicate article removal process...");
	try {
		// Ensure DB is initialized before proceeding
		await initializeDexieDatabase();

		const allArticles = await db.articles.toArray();
		console.log(`Found ${allArticles.length} total articles.`);

		if (allArticles.length < 2) {
			console.log("Not enough articles to have duplicates.");
			return 0;
		}

		const articlesByUrl = new Map<string, DexieArticle[]>();

		// Group articles by URL
		for (const article of allArticles) {
			// Ensure URL exists and is a non-empty string before grouping
			if (
				article.url &&
				typeof article.url === "string" &&
				article.url.trim() !== ""
			) {
				const group = articlesByUrl.get(article.url) || [];
				group.push(article);
				articlesByUrl.set(article.url, group);
			} else {
				// Log articles with invalid/missing URLs but don't stop the process
				console.warn(
					`Article with ID ${article.id} has missing or invalid URL, skipping.`,
				);
			}
		}

		const duplicateIds: ArticleId[] = [];

		// Identify duplicates within each group
		for (const [url, articles] of articlesByUrl.entries()) {
			if (articles.length > 1) {
				// Sort by savedAt (earliest first)
				articles.sort((a, b) => a.savedAt - b.savedAt);

				// The first article is the one to keep, the rest are duplicates
				const idsToRemove = articles.slice(1).map((article) => article.id);
				if (idsToRemove.length > 0) {
					duplicateIds.push(...idsToRemove);
					console.log(
						`Identified ${idsToRemove.length} duplicates for URL: ${url}`,
					);
				}
			}
		}

		if (duplicateIds.length > 0) {
			console.log(
				`Attempting to delete ${duplicateIds.length} duplicate articles...`,
			);
			await db.articles.bulkDelete(duplicateIds);
			console.log(
				`Successfully deleted ${duplicateIds.length} duplicate articles.`,
			);
			return duplicateIds.length;
		}

		console.log("No duplicate articles found to remove.");
		return 0;
	} catch (error) {
		console.error("Error removing duplicate articles:", error);
		// Don't re-throw here, let the UI handle the error reporting if needed
		return -1; // Indicate an error occurred
	}
}
