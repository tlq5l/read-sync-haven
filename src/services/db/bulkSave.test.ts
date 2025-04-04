// src/services/db/bulkSave.test.ts

import PouchDBAdapterMemory from "pouchdb-adapter-memory";
import PouchDB from "pouchdb-browser";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bulkSaveArticles } from "./articles";
import { articlesDb, initializeDatabase } from "./config";
import type { Article } from "./types";

// Mock the config to use the memory adapter
if (typeof PouchDB.plugin === "function") {
	PouchDB.plugin(PouchDBAdapterMemory);
}

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
	excerpt: `Excerpt for ${title}`,
	savedAt: Date.now() - idNum * 1000,
	status: "inbox",
	isRead: false,
	favorite: false,
	tags: [],
	type: "article",
});

describe("bulkSaveArticles simple test", () => {
	beforeAll(async () => {
		await initializeDatabase();
	});

	beforeEach(async () => {
		// Clear the database before each test
		const allDocs = await articlesDb.allDocs();
		if (allDocs.rows.length > 0) {
			await articlesDb.bulkDocs(
				allDocs.rows.map((row) => ({
					_id: row.id,
					_rev: row.value.rev,
					_deleted: true,
				})) as any[],
			);
		}
	});

	it("should save a single article", async () => {
		const article = createArticleData(1, "http://example.com", "Test Article");
		const results = await bulkSaveArticles([article]);

		expect(results.length).toBe(1);
		expect(results[0]).toHaveProperty("ok", true);
	});
});
