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
        [userId+siteName]
      `, // 'id' is primary key, others are indexes. '*tags' for multi-entry array index. '[userId+savedAt]' etc. for compound indexes.
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
