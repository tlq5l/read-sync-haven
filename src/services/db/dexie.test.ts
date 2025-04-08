import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	DexieArticle,
	db,
	initializeDexieDatabase,
	removeDuplicateArticles,
} from "./dexie"; // Assuming DexieArticle is exported

// Mock console methods to prevent test logs from cluttering output
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

// Helper function to create a DexieArticle instance with defaults
const createArticle = (
	id: string,
	url: string | null | undefined,
	savedAt: number,
): DexieArticle => {
	return new DexieArticle(
		id,
		`Title ${id}`,
		url as string, // Cast needed due to constructor signature vs. test intent
		`Content ${id}`,
		`Excerpt ${id}`,
		savedAt,
		false,
		false,
		[],
		"article",
		"inbox",
		"test-user",
	);
};

describe("Dexie DB Functions", () => {
	// Ensure DB is initialized once before tests
	beforeAll(async () => {
		await initializeDexieDatabase();
	});

	// Clear articles before each test
	beforeEach(async () => {
		await db.articles.clear();
	});

	afterEach(() => {
		vi.clearAllMocks(); // Clear mocks after each test
	});

	describe("removeDuplicateArticles", () => {
		it("should remove duplicate articles, keeping the one with the earliest savedAt timestamp", async () => {
			const articlesToSeed: DexieArticle[] = [
				createArticle("1", "http://example.com/a", 100), // Duplicate, later
				createArticle("2", "http://example.com/b", 150), // Unique
				createArticle("3", "http://example.com/a", 50), // Original, earliest
				createArticle("4", "http://example.com/c", 300), // Duplicate, later
				createArticle("5", "http://example.com/a", 200), // Duplicate, latest
				createArticle("6", "http://example.com/c", 250), // Original, earliest
			];
			await db.articles.bulkAdd(articlesToSeed);

			const removedCount = await removeDuplicateArticles();

			expect(removedCount).toBe(3); // Articles 1, 4, 5 removed

			const remainingArticles = await db.articles.orderBy("savedAt").toArray();
			expect(remainingArticles).toHaveLength(3);
			expect(remainingArticles.map((a) => a.id).sort()).toEqual(
				["2", "3", "6"].sort(),
			);

			// Verify the correct articles were kept
			const keptArticleA = remainingArticles.find(
				(a) => a.url === "http://example.com/a",
			);
			const keptArticleB = remainingArticles.find(
				(a) => a.url === "http://example.com/b",
			);
			const keptArticleC = remainingArticles.find(
				(a) => a.url === "http://example.com/c",
			);

			expect(keptArticleA?.id).toBe("3"); // Earliest savedAt for URL A
			expect(keptArticleB?.id).toBe("2"); // Only one for URL B
			expect(keptArticleC?.id).toBe("6"); // Earliest savedAt for URL C
		});

		it("should return 0 if no duplicates are found", async () => {
			const articlesToSeed: DexieArticle[] = [
				createArticle("1", "http://example.com/a", 100),
				createArticle("2", "http://example.com/b", 150),
				createArticle("3", "http://example.com/c", 50),
			];
			await db.articles.bulkAdd(articlesToSeed);

			const removedCount = await removeDuplicateArticles();

			expect(removedCount).toBe(0);
			const remainingArticles = await db.articles.toArray();
			expect(remainingArticles).toHaveLength(3);
		});

		it("should return 0 if there are less than 2 articles", async () => {
			// Test with 1 article
			await db.articles.add(createArticle("1", "http://example.com/a", 100));
			let removedCount = await removeDuplicateArticles();
			expect(removedCount).toBe(0);
			let remainingArticles = await db.articles.toArray();
			expect(remainingArticles).toHaveLength(1);

			// Test with 0 articles
			await db.articles.clear();
			removedCount = await removeDuplicateArticles();
			expect(removedCount).toBe(0);
			remainingArticles = await db.articles.toArray();
			expect(remainingArticles).toHaveLength(0);
		});

		it("should handle articles with null, undefined, or empty string URLs gracefully", async () => {
			const articlesToSeed: DexieArticle[] = [
				createArticle("1", "http://example.com/a", 100), // Duplicate
				createArticle("2", "http://example.com/b", 150), // Unique
				createArticle("3", "http://example.com/a", 50), // Original
				createArticle("4", null, 200), // Invalid URL
				createArticle("5", undefined, 250), // Invalid URL
				createArticle("6", "", 300), // Invalid URL (empty string)
				createArticle("7", "   ", 350), // Invalid URL (whitespace only)
				createArticle("8", "http://example.com/b", 400), // Duplicate
			];
			await db.articles.bulkAdd(articlesToSeed);

			// Expect console.warn to be called for invalid URLs
			const warnSpy = vi.spyOn(console, "warn");

			const removedCount = await removeDuplicateArticles();

			expect(removedCount).toBe(2); // Articles 1 and 8 removed

			const remainingArticles = await db.articles.orderBy("savedAt").toArray();
			expect(remainingArticles).toHaveLength(6); // 3 valid unique + 3 invalid URL articles kept
			expect(remainingArticles.map((a) => a.id).sort()).toEqual(
				["2", "3", "4", "5", "6", "7"].sort(),
			);

			// Verify the correct valid articles were kept
			const keptArticleA = remainingArticles.find(
				(a) => a.url === "http://example.com/a",
			);
			const keptArticleB = remainingArticles.find(
				(a) => a.url === "http://example.com/b",
			);
			expect(keptArticleA?.id).toBe("3");
			expect(keptArticleB?.id).toBe("2"); // Kept the earlier one (ID 2, savedAt 150)

			// Verify invalid URL articles remain
			expect(remainingArticles.some((a) => a.id === "4")).toBe(true);
			expect(remainingArticles.some((a) => a.id === "5")).toBe(true);
			expect(remainingArticles.some((a) => a.id === "6")).toBe(true);
			expect(remainingArticles.some((a) => a.id === "7")).toBe(true);

			// Check that warnings were logged for invalid URLs
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Article with ID 4 has missing or invalid URL"),
			);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Article with ID 5 has missing or invalid URL"),
			);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Article with ID 6 has missing or invalid URL"),
			);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("Article with ID 7 has missing or invalid URL"),
			);
			expect(warnSpy).toHaveBeenCalledTimes(4);
		});

		it("should return -1 and log an error if the database operation fails", async () => {
			// Mock db.articles.toArray to throw an error
			const errorSpy = vi.spyOn(console, "error");
			const toArraySpy = vi
				.spyOn(db.articles, "toArray")
				.mockRejectedValueOnce(new Error("Database read failed"));

			const removedCount = await removeDuplicateArticles();

			expect(removedCount).toBe(-1);
			expect(errorSpy).toHaveBeenCalledWith(
				"Error removing duplicate articles:",
				expect.any(Error),
			);
			expect(errorSpy.mock.calls[0][1].message).toBe("Database read failed");

			toArraySpy.mockRestore(); // Restore original implementation
			errorSpy.mockRestore();
		});

		it("should handle bulkDelete failure", async () => {
			const articlesToSeed: DexieArticle[] = [
				createArticle("1", "http://example.com/a", 100), // Duplicate, later
				createArticle("3", "http://example.com/a", 50), // Original, earliest
			];
			await db.articles.bulkAdd(articlesToSeed);

			// Mock db.articles.bulkDelete to throw an error
			const errorSpy = vi.spyOn(console, "error");
			const bulkDeleteSpy = vi
				.spyOn(db.articles, "bulkDelete")
				.mockRejectedValueOnce(new Error("Database delete failed"));

			const removedCount = await removeDuplicateArticles();

			expect(removedCount).toBe(-1); // Should return -1 on error
			expect(errorSpy).toHaveBeenCalledWith(
				"Error removing duplicate articles:",
				expect.any(Error),
			);
			expect(errorSpy.mock.calls[0][1].message).toBe("Database delete failed");

			bulkDeleteSpy.mockRestore();
			errorSpy.mockRestore();

			// Verify original article still exists as delete failed
			const remainingArticles = await db.articles.toArray();
			expect(remainingArticles).toHaveLength(2);
		});
	});
});
