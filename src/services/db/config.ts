// src/services/db/config.ts

import PouchDBAdapterMemory from "pouchdb-adapter-memory"; // Import memory adapter
import PouchDB from "pouchdb-browser";
import PouchDBFind from "pouchdb-find";
import { updateMissingMetadata } from "./migrations"; // Import the migration function
import type { Article, Highlight, QueuedOperation, Tag } from "./types"; // Added QueuedOperation
import { executeWithRetry } from "./utils";

// Register PouchDB plugins
// Ensure this runs only once, although PouchDB handles multiple calls gracefully.
if (typeof PouchDB.plugin === "function") {
	try {
		PouchDB.plugin(PouchDBFind);
		console.log("PouchDBFind plugin registered.");
		PouchDB.plugin(PouchDBAdapterMemory); // Register memory adapter
		console.log("PouchDB Memory Adapter plugin registered.");
	} catch (e) {
		console.error("Error registering PouchDB plugins:", e);
	}
} else {
	console.error(
		"PouchDB.plugin is not a function. PouchDB might not be loaded correctly.",
	);
}

// --- Database Configuration ---

const DB_PREFIX = "readsync_"; // Using a more specific prefix
const ARTICLES_DB_NAME = `${DB_PREFIX}articles`;
const HIGHLIGHTS_DB_NAME = `${DB_PREFIX}highlights`;
const TAGS_DB_NAME = `${DB_PREFIX}tags`;
const OPERATIONS_QUEUE_DB_NAME = `${DB_PREFIX}operations_queue`; // Added

// Default options for PouchDB instances
const defaultDbOptions: PouchDB.Configuration.DatabaseConfiguration = {
	auto_compaction: true, // Helps manage disk space
	revs_limit: 50, // Reduce revision history size
	// Consider adding adapter preferences if needed, e.g., prefer 'indexeddb'
	// adapter: 'indexeddb' // Or ['indexeddb', 'websql']
	// Note: AJAX options like timeout are typically configured during replication setup,
	// not directly in the main browser adapter configuration.
};

// --- Database Instance Creation ---

// Use a function to create DB instances to handle potential errors gracefully
function createDbInstance<T extends object>(
	name: string,
	options: PouchDB.Configuration.DatabaseConfiguration = defaultDbOptions,
): PouchDB.Database<T> {
	// --- Test Environment Specific Logic ---
	if (import.meta.vitest) {
		console.log(
			`[TEST ENV] Creating PouchDB instance: ${name} using memory adapter`,
		);
		try {
			// Directly use memory adapter for tests
			return new PouchDB<T>(name, { ...options, adapter: "memory" });
		} catch (testErr) {
			console.error(
				`[TEST ENV] FATAL: Failed to create memory PouchDB instance ${name}:`,
				testErr,
			);
			throw new Error(
				`[TEST ENV] Could not initialize database ${name} with memory adapter.`,
			);
		}
	}

	// --- Production/Development Logic ---
	try {
		console.log(`Attempting to create PouchDB instance: ${name}`);
		const db = new PouchDB<T>(name, options); // Use original options
		// Perform an immediate info() call to test the connection
		db.info()
			.then((info) =>
				console.log(`Successfully connected to ${name}. Info:`, info),
			)
			.catch((err) => {
				console.error(`Initial connection test failed for ${name}:`, err);
				// Fallback logic is handled below if needed
			});
		return db;
	} catch (err) {
		console.error(`FATAL: Failed to create PouchDB instance ${name}:`, err);
		// Fallback to memory adapter immediately if constructor fails
		// This fallback is for non-test environments
		console.error(`FATAL: Failed to create PouchDB instance ${name}:`, err);
		console.warn(`Falling back to memory adapter for ${name}.`);
		try {
			return new PouchDB<T>(name, { ...options, adapter: "memory" });
		} catch (memErr) {
			console.error(
				`FATAL: Failed to create memory fallback for ${name}:`,
				memErr,
			);
			throw new Error(`Could not initialize database ${name}, even in memory.`);
		}
	}
}

// Exported database instances
export let articlesDb = createDbInstance<Article>(ARTICLES_DB_NAME);
export let highlightsDb = createDbInstance<Highlight>(HIGHLIGHTS_DB_NAME);
export let tagsDb = createDbInstance<Tag>(TAGS_DB_NAME);
export let operationsQueueDb = createDbInstance<QueuedOperation>(
	OPERATIONS_QUEUE_DB_NAME,
); // Added

// Re-assign exported variables for the test environment *after* declaration
// This ensures PouchDB uses the memory adapter specifically for tests.
if (import.meta.vitest) {
	console.log("[TEST ENV] Re-initializing DB variables with memory adapter.");
	articlesDb = createDbInstance<Article>(ARTICLES_DB_NAME);
	highlightsDb = createDbInstance<Highlight>(HIGHLIGHTS_DB_NAME);
	tagsDb = createDbInstance<Tag>(TAGS_DB_NAME);
	operationsQueueDb = createDbInstance<QueuedOperation>(
		OPERATIONS_QUEUE_DB_NAME,
	); // Added for test env
}

// --- Index Management ---

let indexesCreated = false; // Track index creation status

/**
 * Creates necessary indexes for optimal query performance.
 * Handles potential errors during index creation gracefully.
 */
async function createDbIndexes(): Promise<void> {
	if (indexesCreated) {
		console.log("Indexes already initialized, skipping creation.");
		return;
	}
	console.log("Attempting to create database indexes...");

	const indexPromises: Promise<any>[] = [];

	// Helper to create index and log errors
	const createIndex = async (
		db: PouchDB.Database<any>,
		fields: string[],
		name?: string,
	) => {
		try {
			const indexDef = { index: { fields, name } };
			await db.createIndex(indexDef);
			console.log(
				`Index created successfully on fields: ${fields.join(", ")} ${
					name ? `(name: ${name})` : ""
				} for DB: ${db.name}`,
			);
		} catch (err: any) {
			// Ignore 'exists' errors, warn others
			if (err.name !== "conflict" && !err.message?.includes("exists")) {
				console.warn(
					`Error creating index on ${fields.join(", ")} for DB ${db.name}:`,
					err,
				);
			} else {
				console.log(
					`Index on ${fields.join(", ")} already exists for DB ${db.name}.`,
				);
			}
		}
	};

	// Article Indexes
	indexPromises.push(createIndex(articlesDb, ["_id"], "primary")); // Basic primary key index
	indexPromises.push(createIndex(articlesDb, ["savedAt"], "savedAt"));
	indexPromises.push(createIndex(articlesDb, ["isRead"], "isRead"));
	indexPromises.push(createIndex(articlesDb, ["favorite"], "favorite"));
	indexPromises.push(createIndex(articlesDb, ["userId"], "userId"));
	indexPromises.push(createIndex(articlesDb, ["type"], "type"));
	indexPromises.push(createIndex(articlesDb, ["tags"], "tags")); // For $elemMatch queries

	// Highlight Indexes
	indexPromises.push(createIndex(highlightsDb, ["articleId"], "articleId"));

	// Tag Indexes
	indexPromises.push(createIndex(tagsDb, ["name"], "name")); // Assuming tag names are unique per user

	// Queue Indexes
	indexPromises.push(
		createIndex(operationsQueueDb, ["timestamp"], "queueTimestamp"),
	); // For processing order
	indexPromises.push(createIndex(operationsQueueDb, ["type"], "queueType")); // For filtering by type

	try {
		await Promise.all(indexPromises);
		indexesCreated = true;
		console.log("Database index creation process completed.");
	} catch (error) {
		// Errors are logged within createIndex, this catch is for potential Promise.all issues
		console.error("Error during bulk index creation:", error);
		// Do not set indexesCreated to true if bulk operation fails critically
	}
}

// --- Database Initialization ---

let isInitializing = false;
let initializationPromise: Promise<boolean> | null = null;

/**
 * Initializes the database connections and creates necessary indexes.
 * Handles retries and fallbacks to memory adapter if IndexedDB fails.
 * Ensures initialization runs only once.
 * @returns {Promise<boolean>} True if initialization (including index creation attempt) was successful, false otherwise.
 */
export async function initializeDatabase(): Promise<boolean> {
	if (initializationPromise) {
		console.log("Database initialization already in progress or completed.");
		return initializationPromise;
	}
	if (isInitializing) {
		console.warn("Initialization called while already initializing.");
		// Wait for the ongoing promise
		while (isInitializing) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		return initializationPromise ?? false; // Return the result of the completed initialization
	}

	isInitializing = true;
	console.log("Starting database initialization...");

	initializationPromise = executeWithRetry(async () => {
		let success = true;
		try {
			// 1. Test primary database connections
			console.log("Testing primary database connections...");
			await Promise.all([
				articlesDb.info(),
				highlightsDb.info(),
				tagsDb.info(),
				operationsQueueDb.info(), // Added queue DB test
			]);
			console.log("Primary database connections successful.");
		} catch (dbError) {
			console.error("Primary database connection failed:", dbError);
			console.warn("Attempting to fallback to memory adapters...");
			success = false; // Mark as potentially failed, but try fallback

			// 2. Attempt fallback to memory adapters
			try {
				articlesDb = new PouchDB<Article>(ARTICLES_DB_NAME, {
					adapter: "memory",
				});
				highlightsDb = new PouchDB<Highlight>(HIGHLIGHTS_DB_NAME, {
					adapter: "memory",
				});
				tagsDb = new PouchDB<Tag>(TAGS_DB_NAME, { adapter: "memory" });
				operationsQueueDb = new PouchDB<QueuedOperation>(
					// Added queue fallback
					OPERATIONS_QUEUE_DB_NAME,
					{ adapter: "memory" },
				);

				// Test memory connections
				await Promise.all([
					articlesDb.info(),
					highlightsDb.info(),
					tagsDb.info(),
					operationsQueueDb.info(), // Added queue test
				]);
				console.log("Memory database fallback connections successful.");
				success = true; // Fallback succeeded
			} catch (fallbackError) {
				console.error("FATAL: Memory database fallback failed:", fallbackError);
				isInitializing = false;
				return false; // Initialization failed critically
			}
		}

		// 3. Create indexes (attempt even if primary connection failed but fallback worked)
		try {
			await createDbIndexes();
		} catch (indexError) {
			console.error(
				"Index creation failed during initialization, proceeding without optimal indexes:",
				indexError,
			);
			// Don't mark initialization as failed just because indexes failed,
			// but log it as a significant issue.
			success = success && false; // Reflect that indexes might be missing
		}

		// 4. Run data migrations after indexes are set up
		if (success) {
			// Only run migrations if DB connection is okay
			try {
				console.log("Running data migrations (updateMissingMetadata)...");
				const updatedCount = await updateMissingMetadata();
				console.log(
					`Data migration completed. Updated ${updatedCount} articles.`,
				);
			} catch (migrationError) {
				console.error("Data migration failed:", migrationError);
				// Decide if this should affect the overall success status
				// For now, let's log it but not fail the entire initialization
			}
		}

		console.log(
			`Database initialization finished. Overall success: ${success}`,
		);
		isInitializing = false;
		return success;
	}, 3); // Retry initialization logic up to 3 times

	return initializationPromise;
}

// Optional: Trigger initialization early if needed, but often better to call explicitly from app setup
// initializeDatabase().catch(err => console.error("Background DB initialization failed:", err));
