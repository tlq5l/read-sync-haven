import * as cloudSync from "@/services/cloudSync";
import type { Article } from "@/services/db"; // Assuming this path is correct
import * as db from "@/services/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { filterAndSortArticles, runOneTimeFileSync } from "./articleUtils";

// Mock the database and cloud sync modules
vi.mock("@/services/db", () => ({
	getAllArticles: vi.fn(),
	updateArticle: vi.fn(),
}));

vi.mock("@/services/cloudSync", () => ({
	fetchCloudItems: vi.fn(),
	saveItemToCloud: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		clear: vi.fn(() => {
			store = {};
		}),
	};
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Sample articles for testing
const articles: Article[] = [
	{
		_id: "1",
		url: "http://example.com/1",
		title: "Article 1",
		content: "Content 1",
		savedAt: 1700000000000, // Older
		isRead: true,
		favorite: false,
		type: "article",
		userId: "user1",
		excerpt: "",
		tags: [],
	},
	{
		_id: "2",
		url: "http://example.com/2",
		title: "Article 2",
		content: "Content 2",
		savedAt: 1700000002000, // Newer
		isRead: false,
		favorite: true,
		type: "article",
		userId: "user1",
		excerpt: "",
		tags: [],
	},
	{
		_id: "3",
		url: "http://example.com/3",
		title: "Article 3",
		content: "Content 3",
		savedAt: 1700000001000, // Middle
		isRead: false,
		favorite: false,
		type: "article",
		userId: "user1",
		excerpt: "",
		tags: [],
	},
	{
		_id: "4",
		url: "http://example.com/4",
		title: "Article 4",
		content: "Content 4",
		savedAt: 1700000003000, // Newest
		isRead: true,
		favorite: true,
		type: "article",
		userId: "user1",
		excerpt: "",
		tags: [],
	},
];

describe("lib/articleUtils", () => {
	describe("filterAndSortArticles", () => {
		it("should return all articles sorted by savedAt descending when view is 'all'", () => {
			const result = filterAndSortArticles(articles, "all");
			expect(result).toHaveLength(4);
			expect(result.map((a) => a._id)).toEqual(["4", "2", "3", "1"]);
		});

		it("should return only unread articles sorted by savedAt descending when view is 'unread'", () => {
			const result = filterAndSortArticles(articles, "unread");
			expect(result).toHaveLength(2);
			expect(result.map((a) => a._id)).toEqual(["2", "3"]);
		});

		it("should return only favorite articles sorted by savedAt descending when view is 'favorites'", () => {
			const result = filterAndSortArticles(articles, "favorites");
			expect(result).toHaveLength(2);
			expect(result.map((a) => a._id)).toEqual(["4", "2"]);
		});

		it("should return an empty array if no articles match the filter", () => {
			const readArticles = articles.filter((a) => a.isRead);
			const result = filterAndSortArticles(readArticles, "unread");
			expect(result).toHaveLength(0);
		});

		it("should handle an empty input array", () => {
			const result = filterAndSortArticles([], "all");
			expect(result).toHaveLength(0);
		});

		it("should not modify the original array", () => {
			const originalArticles = [...articles]; // Create a shallow copy
			filterAndSortArticles(originalArticles, "unread");
			expect(originalArticles).toEqual(articles); // Ensure original array is unchanged
		});
	});

	describe("runOneTimeFileSync", () => {
		const mockUserId = "testUser123";
		const mockGetToken = vi.fn().mockResolvedValue("test-token");
		// Cast as unknown as UserResource to satisfy TypeScript
		const mockUser = {
			primaryEmailAddress: { emailAddress: "test@example.com" },
		} as unknown as any;

		// Reset mocks before each test
		beforeEach(() => {
			vi.clearAllMocks();
			localStorageMock.clear();
			vi.mocked(db.getAllArticles).mockResolvedValue([]);
			vi.mocked(db.updateArticle).mockResolvedValue({} as Article);
			vi.mocked(cloudSync.fetchCloudItems).mockResolvedValue([]);
			vi.mocked(cloudSync.saveItemToCloud).mockResolvedValue(true);
		});

		it("should exit early if userId is not provided", async () => {
			await runOneTimeFileSync(null, mockGetToken, mockUser);
			expect(db.getAllArticles).not.toHaveBeenCalled();
			expect(localStorage.getItem).not.toHaveBeenCalled();
		});

		it("should exit early if sync flag is already set in localStorage", async () => {
			// Set the flag before running
			localStorage.setItem(`hasSyncedExistingFiles_${mockUserId}`, "true");

			await runOneTimeFileSync(mockUserId, mockGetToken, mockUser);
			expect(db.getAllArticles).not.toHaveBeenCalled();
		});

		it("should migrate EPUBs with content to fileData field and update them", async () => {
			// Create mock EPUB articles with Base64 in content instead of fileData - with longer content
			const mockEpubArticles = [
				{
					_id: "epub1",
					_rev: "rev1",
					url: "local-epub://test.epub",
					title: "EPUB Test 1",
					content: "data:application/epub+zip;base64,ABC123XYZ==".repeat(20), // Long Base64-like string (>100 chars)
					fileData: undefined, // Explicitly set to undefined
					savedAt: 1700000000000,
					isRead: false,
					favorite: false,
					type: "epub",
					userId: mockUserId,
					excerpt: "Test excerpt",
					tags: [],
				},
				{
					_id: "epub2",
					_rev: "rev2",
					url: "local-epub://test2.epub",
					title: "EPUB Test 2",
					content: "data:application/epub+zip;base64,DEF456789==".repeat(20), // Long Base64-like string (>100 chars)
					fileData: undefined, // Explicitly set to undefined
					savedAt: 1700000001000,
					isRead: false,
					favorite: false,
					type: "epub",
					userId: mockUserId,
					excerpt: "Test excerpt 2",
					tags: [],
				},
				{
					_id: "article1",
					url: "http://example.com",
					title: "Regular Article",
					content: "<p>This is regular HTML content</p>",
					savedAt: 1700000002000,
					isRead: false,
					favorite: false,
					type: "article",
					userId: mockUserId,
					excerpt: "HTML excerpt",
					tags: [],
				},
			] as Article[];

			// Mock getAllArticles to return these test articles
			vi.mocked(db.getAllArticles).mockResolvedValue(mockEpubArticles);

			// Run the migration
			await runOneTimeFileSync(mockUserId, mockGetToken, mockUser);

			// Verify updateArticle was called for both EPUBs but not the regular article
			expect(db.updateArticle).toHaveBeenCalledTimes(2);

			// Check the first EPUB was updated correctly
			expect(db.updateArticle).toHaveBeenCalledWith(
				expect.objectContaining({
					_id: "epub1",
					_rev: "rev1",
					fileData: expect.stringContaining(
						"data:application/epub+zip;base64,",
					), // Base64 moved from content to fileData
					content: expect.stringContaining("EPUB content migrated"), // Content replaced with placeholder
				}),
			);

			// Check the second EPUB was updated correctly
			expect(db.updateArticle).toHaveBeenCalledWith(
				expect.objectContaining({
					_id: "epub2",
					_rev: "rev2",
					fileData: expect.stringContaining(
						"data:application/epub+zip;base64,",
					), // Base64 moved from content to fileData
					content: expect.stringContaining("EPUB content migrated"), // Content replaced with placeholder
				}),
			);

			// Verify localStorage flag was set after migration (with no errors)
			expect(localStorage.setItem).toHaveBeenCalledWith(
				`hasSyncedExistingFiles_${mockUserId}`,
				"true",
			);
		});
	});
});
