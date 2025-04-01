// src/services/db/articles.test.ts

import PouchDBAdapterMemory from "pouchdb-adapter-memory"; // Import the memory adapter plugin
import PouchDB from "pouchdb-browser"; // Import the core PouchDB constructor
import {
	afterAll,
	// afterEach, // Removed unused import
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	getAllArticles,
	removeDuplicateArticles,
	saveArticle,
} from "./articles"; // Import the function to test and helpers
import { articlesDb, initializeDatabase } from "./config"; // Need to initialize
import type { Article } from "./types";

// Mock the config to use the memory adapter
vi.mock("./config", async (importOriginal) => {
	const originalConfig = await importOriginal<typeof import("./config")>();
	// Ensure the memory adapter plugin is registered before creating the instance
	if (typeof PouchDB.plugin === "function") {
		PouchDB.plugin(PouchDBAdapterMemory);
	} else {
		console.error("PouchDB.plugin is not available in test setup!");
	}
	// Now create the instance using the registered adapter
	const memoryDb = new PouchDB<Article>("test-articles-db", {
		adapter: "memory",
	});
	return {
		...originalConfig,
		articlesDb: memoryDb,
		initializeDatabase: vi.fn().mockResolvedValue({ articlesDb: memoryDb }), // Mock initializeDatabase
	};
});

// Helper function to create article data
const createArticleData = (
	idNum: number,
	url: string,
	title: string,
	rev?: string,
): Omit<Article, "_id" | "_rev"> & { _id: string; _rev?: string } => ({
	_id: `article_${idNum}`,
	...(rev ? { _rev: rev } : {}),
	userId: "test-user",
	url: url,
	title: title,
	content: `Content for ${title}`,
	excerpt: `Excerpt for ${title}`, // Add missing required field
	savedAt: Date.now() - idNum * 1000, // Ensure different save times
	isRead: false,
	favorite: false,
	tags: [],
	type: "article",
});

describe("removeDuplicateArticles", () => {
	let dbInstance: PouchDB.Database<Article>;

	beforeAll(async () => {
		// Initialize the mocked DB (though it's already created by the mock)
		await initializeDatabase(); // Call the correct function (doesn't need userId here as it's mocked)
		dbInstance = articlesDb; // Use the mocked instance
	});

	beforeEach(async () => {
		// Clear the database before each test
		const allDocs = await dbInstance.allDocs();
		await dbInstance.bulkDocs(
			allDocs.rows.map((row: { id: string; value: { rev: string } }) => ({
				_id: row.id,
				_rev: row.value.rev,
				_deleted: true,
			})) as any[], // Cast to any[] for bulkDocs deletion stubs
		);
	});

	afterAll(async () => {
		// Optional: Destroy the DB after all tests if needed, though memory adapter might not require it
		// await dbInstance.destroy();
	});

	it("should return 0 and not remove anything if no duplicates exist", async () => {
		await saveArticle(
			createArticleData(1, "http://example.com/1", "Article 1"),
		);
		await saveArticle(
			createArticleData(2, "http://example.com/2", "Article 2"),
		);

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(0);
		expect(remainingArticles).toHaveLength(2);
	});

	it("should remove duplicates based on URL, keeping the one with the lowest _id", async () => {
		// Save articles, ensuring IDs are sequential for predictability
		const article1 = await saveArticle(
			createArticleData(1, "http://duplicate.com", "Duplicate Article 1"),
		);
		await saveArticle(
			// Removed unused variable 'article2'
			createArticleData(2, "http://unique.com", "Unique Article"),
		);
		const article3 = await saveArticle(
			createArticleData(3, "http://duplicate.com", "Duplicate Article 3"),
		); // Duplicate of 1

		expect(article1._id).toBe("article_1");
		expect(article3._id).toBe("article_3");

		const initialArticles = await getAllArticles();
		expect(initialArticles).toHaveLength(3);

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(1);
		expect(remainingArticles).toHaveLength(2);

		// Check that the one with the lower ID ('article_1') was kept
		const keptArticleIds = remainingArticles.map((a) => a._id);
		expect(keptArticleIds).toContain("article_1");
		expect(keptArticleIds).toContain("article_2");
		expect(keptArticleIds).not.toContain("article_3");
	});

	it("should handle multiple groups of duplicates", async () => {
		await saveArticle(createArticleData(1, "http://group1.com", "Group 1 - A"));
		await saveArticle(createArticleData(2, "http://group2.com", "Group 2 - A"));
		await saveArticle(createArticleData(3, "http://group1.com", "Group 1 - B")); // Dup of 1
		await saveArticle(createArticleData(4, "http://group2.com", "Group 2 - B")); // Dup of 2
		await saveArticle(createArticleData(5, "http://group1.com", "Group 1 - C")); // Dup of 1
		await saveArticle(createArticleData(6, "http://group3.com", "Group 3 - A"));

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(3); // Removed 3, 4, 5
		expect(remainingArticles).toHaveLength(3); // Kept 1, 2, 6

		const keptArticleIds = remainingArticles.map((a) => a._id);
		expect(keptArticleIds).toEqual(
			expect.arrayContaining(["article_1", "article_2", "article_6"]),
		);
		expect(keptArticleIds).not.toContain("article_3");
		expect(keptArticleIds).not.toContain("article_4");
		expect(keptArticleIds).not.toContain("article_5");
	});

	it("should skip articles without a URL", async () => {
		await saveArticle(
			createArticleData(1, "http://example.com", "Valid Article"),
		);
		// Save an article directly without a URL (simulate bad data)
		await dbInstance.put({
			_id: "article_no_url",
			userId: "test-user",
			title: "No URL Article",
			content: "Content",
			savedAt: Date.now(),
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			url: "local-file://no-url-test", // Add dummy URL
			excerpt: "Excerpt for No URL Article", // Add missing excerpt
		});
		await saveArticle(
			createArticleData(3, "http://example.com", "Duplicate Valid"),
		); // Dup of 1

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(1); // Only article_3 removed
		expect(remainingArticles).toHaveLength(2); // article_1 and article_no_url remain

		const keptArticleIds = remainingArticles.map((a) => a._id);
		expect(keptArticleIds).toContain("article_1");
		expect(keptArticleIds).toContain("article_no_url");
		expect(keptArticleIds).not.toContain("article_3");
	});

	it("should skip deleting duplicates if they are missing _rev (log warning)", async () => {
		const consoleWarnSpy = vi.spyOn(console, "warn");

		// Save one article normally
		await saveArticle(
			createArticleData(1, "http://rev-test.com", "Rev Test 1"),
		);

		// Manually put a duplicate without fetching _rev first (simulates missing rev)
		await dbInstance.put({
			_id: "article_2", // Different ID
			userId: "test-user",
			url: "http://rev-test.com", // Same URL
			title: "Rev Test 2 - No Rev",
			content: "Content",
			savedAt: Date.now(),
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			// _rev is missing
			excerpt: "Excerpt for Rev Test 2", // Add missing excerpt
		});

		const initialArticles = await getAllArticles();
		expect(initialArticles).toHaveLength(2); // Both exist initially

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(0); // Should not remove article_2 because _rev is missing
		expect(remainingArticles).toHaveLength(2); // Both should still exist
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"Article article_2 is missing _rev, cannot delete. Skipping.",
			),
		);

		consoleWarnSpy.mockRestore();
	});

	it("should return 0 if the database is empty", async () => {
		const removedCount = await removeDuplicateArticles();
		expect(removedCount).toBe(0);
	});
});
