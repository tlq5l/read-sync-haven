// src/services/db/articles.test.ts

import PouchDBAdapterMemory from "pouchdb-adapter-memory";
import PouchDB from "pouchdb-browser"; // Import the core PouchDB constructor
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	// vi, // Removed unused import
} from "vitest";
import {
	deleteArticle, // Import the modified deleteArticle
	getAllArticles,
	removeDuplicateArticles,
	saveArticle,
} from "./articles"; // Import the function to test and helpers
import { articlesDb, initializeDatabase, operationsQueueDb } from "./config"; // Import necessary DB instances
import type { Article, QueuedOperation } from "./types"; // Import necessary types

// Mock the config to use the memory adapter
if (typeof PouchDB.plugin === "function") {
	PouchDB.plugin(PouchDBAdapterMemory);
}

// Helper function to create article data
const createArticleData = (
	idNum: number,
	url: string,
	title: string,
	type: Article["type"] = "article", // Added type parameter with default
	rev?: string,
): Omit<Article, "_id" | "_rev"> & { _id: string; _rev?: string } => ({
	_id: `article_${idNum}`,
	...(rev ? { _rev: rev } : {}),
	userId: "test-user",
	url: url,
	title: title,
	content: `Content for ${title}`,
	excerpt: `Excerpt for ${title}`,
	savedAt: Date.now() - idNum * 1000,
	status: "inbox",
	isRead: false,
	favorite: false,
	tags: [],
	type: type, // Use the provided type
	version: 1,
});

// --- Global Test Setup ---
beforeAll(async () => {
	await initializeDatabase();
});

beforeEach(async () => {
	// Clear articlesDb before each test
	const articlesDocs = await articlesDb.allDocs();
	if (articlesDocs.rows.length > 0) {
		await articlesDb.bulkDocs(
			articlesDocs.rows.map(
				(row: PouchDB.Core.AllDocsResponse<any>["rows"][number]) => ({
					// Use <any> for simplicity here
					_id: row.id,
					_rev: row.value.rev,
					_deleted: true,
				}),
			) as any[], // Cast needed for deletion stubs
		);
	}
	// Clear operationsQueueDb before each test
	const queueDocs = await operationsQueueDb.allDocs();
	if (queueDocs.rows.length > 0) {
		await operationsQueueDb.bulkDocs(
			queueDocs.rows.map(
				(row: PouchDB.Core.AllDocsResponse<any>["rows"][number]) => ({
					// Use <any> for simplicity here
					_id: row.id,
					_rev: row.value.rev,
					_deleted: true,
				}),
			) as any[], // Cast needed for deletion stubs
		);
	}

	// Verify DBs are empty
	const articlesInfo = await articlesDb.info();
	expect(articlesInfo.doc_count).toBe(0);
	const queueInfo = await operationsQueueDb.info();
	expect(queueInfo.doc_count).toBe(0);
});

afterAll(async () => {
	// Optional: Destroy databases after tests
	// await articlesDb.destroy();
	// await operationsQueueDb.destroy();
});

// --- Test Suites ---

describe("removeDuplicateArticles", () => {
	// Existing tests for removeDuplicateArticles...
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
		const article1 = await saveArticle(
			createArticleData(1, "http://duplicate.com", "Duplicate Article 1"),
		);
		await saveArticle(
			createArticleData(2, "http://unique.com", "Unique Article"),
		);
		const article3 = await saveArticle(
			createArticleData(3, "http://duplicate.com", "Duplicate Article 3"),
		);

		expect(article1._id).toBe("article_1");
		expect(article3._id).toBe("article_3");

		const initialArticles = await getAllArticles();
		expect(initialArticles).toHaveLength(3);

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(1);
		expect(remainingArticles).toHaveLength(2);

		const keptArticleIds = remainingArticles.map((a) => a._id);
		expect(keptArticleIds).toContain("article_1");
		expect(keptArticleIds).toContain("article_2");
		expect(keptArticleIds).not.toContain("article_3");
	});

	it("should handle multiple groups of duplicates", async () => {
		await saveArticle(createArticleData(1, "http://group1.com", "Group 1 - A"));
		await saveArticle(createArticleData(2, "http://group2.com", "Group 2 - A"));
		await saveArticle(createArticleData(3, "http://group1.com", "Group 1 - B"));
		await saveArticle(createArticleData(4, "http://group2.com", "Group 2 - B"));
		await saveArticle(createArticleData(5, "http://group1.com", "Group 1 - C"));
		await saveArticle(createArticleData(6, "http://group3.com", "Group 3 - A"));

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(3);
		expect(remainingArticles).toHaveLength(3);

		const keptArticleIds = remainingArticles.map((a) => a._id);
		expect(keptArticleIds).toEqual(
			expect.arrayContaining(["article_1", "article_2", "article_6"]),
		);
	});

	it("should skip articles without a URL", async () => {
		await saveArticle(
			createArticleData(1, "http://example.com", "Valid Article"),
		);
		await articlesDb.put({
			_id: "article_no_url",
			userId: "test-user",
			title: "No URL Article",
			content: "Content",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			url: "local-file://no-url-test",
			excerpt: "Excerpt for No URL Article",
			version: 1,
		});
		await saveArticle(
			createArticleData(3, "http://example.com", "Duplicate Valid"),
		);

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(1);
		expect(remainingArticles).toHaveLength(2);

		const keptArticleIds = remainingArticles.map((a) => a._id);
		expect(keptArticleIds).toContain("article_1");
		expect(keptArticleIds).toContain("article_no_url");
	});

	it("should correctly remove duplicates even if one has missing _rev initially (it gets one on fetch)", async () => {
		await saveArticle(
			createArticleData(1, "http://rev-test.com", "Rev Test 1"),
		);
		await articlesDb.put({
			_id: "article_2",
			userId: "test-user",
			url: "http://rev-test.com",
			title: "Rev Test 2 - No Rev",
			content: "Content",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			excerpt: "Excerpt for Rev Test 2",
			version: 1,
		});

		const initialArticles = await getAllArticles();
		expect(initialArticles).toHaveLength(2);

		const removedCount = await removeDuplicateArticles();
		const remainingArticles = await getAllArticles();

		expect(removedCount).toBe(1);
		expect(remainingArticles).toHaveLength(1);
		expect(remainingArticles[0]._id).toBe("article_1");
	});

	it("should return 0 if the database is empty", async () => {
		const removedCount = await removeDuplicateArticles();
		expect(removedCount).toBe(0);
	});
});

describe("saveArticle", () => {
	// Existing tests for saveArticle...
	it("should save normally if the local version exists but is not deleted", async () => {
		const initialData = createArticleData(
			2,
			"http://update-test.com",
			"Update Test",
		);
		const savedDoc = await articlesDb.put(initialData);
		// Cast initialData to Article to satisfy the type checker for version access
		const incomingData: Article = {
			...(initialData as Article),
			_id: savedDoc.id,
			_rev: savedDoc.rev,
			title: "Updated Title",
			version: (initialData.version || 0) + 1,
		};

		const result = await saveArticle(incomingData);

		expect(result._id).toBe(savedDoc.id);
		expect(result._deleted).toBeUndefined();
		expect(result.title).toBe("Updated Title");
		expect(result._rev).not.toBe(savedDoc.rev);

		const finalLocalDoc = await articlesDb.get<Article>(savedDoc.id);
		expect(finalLocalDoc.title).toBe("Updated Title");
		expect(finalLocalDoc._deleted).toBeUndefined();
	});

	it("should save normally if the local version does not exist", async () => {
		const incomingData = createArticleData(
			3,
			"http://new-test.com",
			"New Test",
		);
		const result = await saveArticle(incomingData);

		expect(result._id).toBe("article_3");
		expect(result._deleted).toBeUndefined();
		expect(result.title).toBe("New Test");
		expect(result._rev).toBeDefined();

		const finalLocalDoc = await articlesDb.get<Article>("article_3");
		expect(finalLocalDoc.title).toBe("New Test");
		expect(finalLocalDoc._deleted).toBeUndefined();
	});
});

// --- New Tests for Soft Delete ---
describe("deleteArticle (Soft Delete)", () => {
	it("should soft delete an article locally", async () => {
		const articleData = createArticleData(
			1,
			"http://todelete.com",
			"To Delete",
		);
		const savedArticle = await saveArticle(articleData);
		const initialVersion = savedArticle.version;

		const deleteResult = await deleteArticle(savedArticle._id);
		expect(deleteResult).toBe(true);

		// Verify local DB record is soft-deleted
		try {
			const deletedDoc = await articlesDb.get<Article>(savedArticle._id);
			expect(deletedDoc.deletedAt).toBeDefined();
			expect(deletedDoc.deletedAt).toBeGreaterThan(savedArticle.savedAt);
			expect(deletedDoc.version).toBe(initialVersion + 1); // Version should increment
		} catch (error: any) {
			// Should not throw 'not_found'
			throw new Error(
				`Article unexpectedly not found after soft delete: ${error.message}`,
			);
		}
	});

	it("should add a delete operation to the queue", async () => {
		const articleData = createArticleData(
			2,
			"http://queue-test.com",
			"Queue Delete",
		);
		const savedArticle = await saveArticle(articleData);

		await deleteArticle(savedArticle._id);

		// Verify queue entry
		const queueDocs = await operationsQueueDb.allDocs<QueuedOperation>({
			include_docs: true,
		});
		expect(queueDocs.rows).toHaveLength(1);
		const queueOp = queueDocs.rows[0].doc;
		expect(queueOp?.type).toBe("delete");
		expect(queueOp?.docId).toBe(savedArticle._id);
		expect(queueOp?.timestamp).toBeDefined();
		expect(queueOp?.retryCount).toBe(0);
	});

	it("should return false if article not found", async () => {
		const deleteResult = await deleteArticle("article_nonexistent");
		expect(deleteResult).toBe(false);

		// Verify queue is empty
		const queueDocs = await operationsQueueDb.allDocs<QueuedOperation>();
		expect(queueDocs.rows).toHaveLength(0);
	});
});

// --- New Tests for getAllArticles Filtering ---
describe("getAllArticles (Soft Delete Filtering)", () => {
	beforeEach(async () => {
		// Setup articles: one active, one soft-deleted
		await saveArticle(
			createArticleData(1, "http://active.com", "Active Article"),
		);
		const savedToDelete = await saveArticle(
			createArticleData(2, "http://deleted.com", "Deleted Article"),
		);
		await deleteArticle(savedToDelete._id); // Soft delete this one
	});

	it("should exclude soft-deleted articles by default", async () => {
		const articles = await getAllArticles();
		expect(articles).toHaveLength(1);
		expect(articles[0]._id).toBe("article_1");
		expect(articles.find((a) => a._id === "article_2")).toBeUndefined();
	});

	it("should include soft-deleted articles when includeDeleted is true", async () => {
		const articles = await getAllArticles({ includeDeleted: true });
		expect(articles).toHaveLength(2);
		expect(articles.find((a) => a._id === "article_1")).toBeDefined();
		const deletedArticle = articles.find((a) => a._id === "article_2");
		expect(deletedArticle).toBeDefined();
		expect(deletedArticle?.deletedAt).toBeDefined();
	});

	it("should return only soft-deleted articles if filtering specifically for them (hypothetical)", async () => {
		// Note: Current implementation filters *out* deleted unless includeDeleted=true.
		// This test checks if we *could* filter *for* them if needed.
		const allDocs = await articlesDb.allDocs<Article>({ include_docs: true });
		const softDeleted = allDocs.rows
			.filter((row) => row.doc?.deletedAt)
			.map((row) => row.doc);
		expect(softDeleted).toHaveLength(1);
		expect(softDeleted[0]?._id).toBe("article_2");
	});

	it("should still apply other filters when includeDeleted is true", async () => {
		// Use the 'type' property which exists in getAllArticles options
		await saveArticle(
			createArticleData(3, "http://active-pdf.com", "Active PDF", "pdf"),
		);
		await saveArticle(
			createArticleData(4, "http://deleted-pdf.com", "Deleted PDF", "pdf"),
		);
		await deleteArticle("article_4"); // Soft delete the second PDF

		// Fetch all PDFs including deleted
		const allArticlesIncludingDeleted = await getAllArticles({
			includeDeleted: true,
			userIds: ["test-user"],
		});
		// Filter by type in memory as getAllArticles doesn't support it directly
		const pdfs = allArticlesIncludingDeleted.filter((a) => a.type === "pdf");
		expect(pdfs).toHaveLength(2); // Should get both active and deleted PDFs

		// Fetch only active PDFs
		const activeArticles = await getAllArticles({ userIds: ["test-user"] }); // includeDeleted defaults to false
		// Filter by type in memory
		const activePdfs = activeArticles.filter((a) => a.type === "pdf");
		expect(activePdfs).toHaveLength(1);
		expect(activePdfs[0]._id).toBe("article_3");
	});
});
