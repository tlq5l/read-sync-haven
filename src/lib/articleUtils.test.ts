import { fetchCloudItems, saveItemToCloud } from "@/services/cloudSync";
// import type PouchDB from "pouchdb-core"; // Import PouchDB types - Not needed
import { getAllArticles, updateArticle } from "@/services/db";
import type { Article } from "@/services/db";
import { articlesDb } from "@/services/db/config"; // Import for bulkDocs mock
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	deduplicateArticles,
	filterAndSortArticles,
	runOneTimeFileSync,
} from "./articleUtils";

// Mock required dependencies
vi.mock("@/services/db", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/services/db")>();
	return {
		...original, // Keep original implementations unless mocked
		getAllArticles: vi.fn(),
		updateArticle: vi.fn(),
		// We don't mock articlesDb directly here, but its methods if needed
	};
});

// Mock articlesDb specifically for bulkDocs
vi.mock("@/services/db/config", () => ({
	articlesDb: {
		bulkDocs: vi.fn(),
		// Add other methods if needed by tests
	},
}));

vi.mock("@/services/cloudSync", () => ({
	fetchCloudItems: vi.fn(),
	saveItemToCloud: vi.fn(),
}));

// Local storage mock
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => {
			return store[key] || null;
		}),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value.toString();
		}),
		clear: vi.fn(() => {
			store = {};
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
	};
})();

Object.defineProperty(window, "localStorage", {
	value: localStorageMock,
});

describe("lib/articleUtils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorageMock.clear();
	});

	describe("filterAndSortArticles", () => {
		it("should return all articles sorted by date when view is 'all'", () => {
			const articles = [
				{
					_id: "1",
					savedAt: 1000,
					isRead: false,
					favorite: false,
				},
				{
					_id: "2",
					savedAt: 3000,
					isRead: true,
					favorite: false,
				},
				{
					_id: "3",
					savedAt: 2000,
					isRead: false,
					favorite: true,
				},
			] as Article[];

			const result = filterAndSortArticles(articles, "all");
			expect(result).toHaveLength(3);
			expect(result[0]._id).toBe("2"); // Most recent first
			expect(result[1]._id).toBe("3");
			expect(result[2]._id).toBe("1");
		});

		it("should return only unread articles when view is 'unread'", () => {
			const articles = [
				{
					_id: "1",
					savedAt: 1000,
					isRead: false,
					favorite: false,
				},
				{
					_id: "2",
					savedAt: 3000,
					isRead: true,
					favorite: false,
				},
				{
					_id: "3",
					savedAt: 2000,
					isRead: false,
					favorite: true,
				},
			] as Article[];

			const result = filterAndSortArticles(articles, "unread");
			expect(result).toHaveLength(2);
			expect(result[0]._id).toBe("3"); // Unread and more recent first
			expect(result[1]._id).toBe("1");
		});

		it("should return only favorited articles when view is 'favorites'", () => {
			const articles = [
				{
					_id: "1",
					savedAt: 1000,
					isRead: false,
					favorite: false,
				},
				{
					_id: "2",
					savedAt: 3000,
					isRead: true,
					favorite: true,
				},
				{
					_id: "3",
					savedAt: 2000,
					isRead: false,
					favorite: true,
				},
			] as Article[];

			const result = filterAndSortArticles(articles, "favorites");
			expect(result).toHaveLength(2);
			expect(result[0]._id).toBe("2"); // Favorite and more recent first
			expect(result[1]._id).toBe("3");
		});
	});

	describe("deduplicateArticles", () => {
		it("should deduplicate articles with the same ID, keeping only the most recent version", () => {
			// Create test data with duplicate articles
			const articles: Article[] = [
				{
					_id: "1",
					url: "http://example.com/1",
					title: "Original Article 1",
					content: "Original Content 1",
					savedAt: 1000,
					isRead: false,
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
					savedAt: 2000,
					isRead: false,
					favorite: false,
					type: "article",
					userId: "user1",
					excerpt: "",
					tags: [],
				},
				// Duplicate of article 1 with newer timestamp
				{
					_id: "1",
					url: "http://example.com/1",
					title: "Updated Article 1",
					content: "Updated Content 1",
					savedAt: 3000, // Newer timestamp
					isRead: true, // Different read status
					favorite: true, // Different favorite status
					type: "article",
					userId: "user1",
					excerpt: "New excerpt",
					tags: ["tag1"],
				},
				// Another article with unique ID
				{
					_id: "3",
					url: "http://example.com/3",
					title: "Article 3",
					content: "Content 3",
					savedAt: 4000,
					isRead: false,
					favorite: false,
					type: "article",
					userId: "user1",
					excerpt: "",
					tags: [],
				},
			];

			// Call the function
			const result = deduplicateArticles(articles);

			// Verify results
			expect(result.length).toBe(3); // Should have 3 unique articles

			// Find article with _id "1"
			const article1 = result.find((a) => a._id === "1");
			expect(article1).toBeDefined();
			expect(article1?.title).toBe("Updated Article 1"); // Should keep newer version
			expect(article1?.savedAt).toBe(3000);
			expect(article1?.isRead).toBe(true);
			expect(article1?.favorite).toBe(true);

			// Make sure the other articles are present
			expect(result.some((a) => a._id === "2")).toBe(true);
			expect(result.some((a) => a._id === "3")).toBe(true);
		});

		it("should handle articles without _id by not including them in the output", () => {
			// Create test data including articles without _id
			const articles: Article[] = [
				{
					_id: "1",
					url: "http://example.com/1",
					title: "Article 1",
					content: "Content 1",
					savedAt: 1000,
					isRead: false,
					favorite: false,
					type: "article",
					userId: "user1",
					excerpt: "",
					tags: [],
				},
				{
					// Missing _id
					url: "http://example.com/invalid",
					title: "Invalid Article",
					content: "Invalid Content",
					savedAt: 5000,
					isRead: false,
					favorite: false,
					type: "article",
					userId: "user1",
					excerpt: "",
					tags: [],
				} as unknown as Article,
			];

			// Call the function
			const result = deduplicateArticles(articles);

			// Verify results
			expect(result.length).toBe(1); // Only the article with _id should be included
			expect(result[0]._id).toBe("1");
		});

		it("should handle articles with same content but different IDs as separate articles", () => {
			// Create test data with same content but different IDs
			const articles: Article[] = [
				{
					_id: "1",
					url: "http://example.com/same",
					title: "Same Content",
					content: "Duplicate Content",
					savedAt: 1000,
					isRead: false,
					favorite: false,
					type: "article",
					userId: "user1",
					excerpt: "",
					tags: [],
				},
				{
					_id: "2", // Different ID
					url: "http://example.com/same", // Same URL
					title: "Same Content", // Same title
					content: "Duplicate Content", // Same content
					savedAt: 1000, // Same timestamp
					isRead: false,
					favorite: false,
					type: "article",
					userId: "user1",
					excerpt: "",
					tags: [],
				},
			];

			// Call the function
			const result = deduplicateArticles(articles);

			// Verify results
			expect(result.length).toBe(2); // Should keep both articles since they have different IDs
			expect(result.some((a) => a._id === "1")).toBe(true);
			expect(result.some((a) => a._id === "2")).toBe(true);
		});

		it("should handle an empty array input", () => {
			const result = deduplicateArticles([]);
			expect(result).toEqual([]);
			expect(result.length).toBe(0);
		});
	});

	describe("runOneTimeFileSync", () => {
		it("should exit early if sync flag is already set in localStorage", async () => {
			localStorageMock.setItem("hasSyncedExistingFiles_user123", "true");

			await runOneTimeFileSync("user123", async () => "mock-token", {
				primaryEmailAddress: { emailAddress: "test@example.com" },
			} as any);

			expect(vi.mocked(updateArticle)).not.toHaveBeenCalled();
			expect(vi.mocked(saveItemToCloud)).not.toHaveBeenCalled();
		});

		it("should migrate EPUBs with content to fileData field and update them", async () => {
			// Mock getAllArticles to return EPUBs needing migration
			const mockEpubs = [
				{
					_id: "epub1",
					_rev: "rev1",
					type: "epub",
					content: "base64content1".repeat(10), // Make content > 100 chars
					userId: "user123",
				},
				{
					_id: "epub2",
					_rev: "rev2",
					type: "epub",
					content: "base64content2".repeat(10), // Make content > 100 chars
					userId: "user123",
				},
			] as unknown as Article[];

			// EPUB with fileData and PDF will be synced to cloud
			vi.mocked(updateArticle).mockResolvedValue({} as any);
			vi.mocked(fetchCloudItems).mockResolvedValue([]);
			vi.mocked(saveItemToCloud).mockResolvedValue(true);

			vi.mocked(getAllArticles).mockResolvedValue(mockEpubs);

			await runOneTimeFileSync("user123", async () => "mock-token", {
				primaryEmailAddress: { emailAddress: "test@example.com" },
			} as any);

			// Verify updates were made
			expect(vi.mocked(updateArticle)).toHaveBeenCalledTimes(2);
			expect(vi.mocked(updateArticle)).toHaveBeenCalledWith({
				_id: "epub1",
				_rev: "rev1",
				fileData: "base64content1".repeat(10), // Expect repeated string
				content: "EPUB content migrated locally.",
			});
			expect(vi.mocked(updateArticle)).toHaveBeenCalledWith({
				_id: "epub2",
				_rev: "rev2",
				fileData: "base64content2".repeat(10), // Expect repeated string
				content: "EPUB content migrated locally.",
			});

			// Verify sync was attempted
			expect(vi.mocked(saveItemToCloud)).toHaveBeenCalledTimes(2);

			// Verify localStorage flag was set
			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				"hasSyncedExistingFiles_user123",
				"true",
			);
		});

		it("should perform one-time duplicate cleanup if flag is not set", async () => {
			const mockUserId = "cleanupUser";
			const cleanupFlagKey = `hasCleanedUpDuplicates_v1_${mockUserId}`;
			const syncFlagKey = `hasSyncedExistingFiles_${mockUserId}`; // For the later part of the function

			// Mock localStorage: cleanup not done, sync not done
			localStorageMock.getItem.mockImplementation((key: string) => {
				if (key === cleanupFlagKey) return null;
				if (key === syncFlagKey) return null; // Assume file sync also needs to run
				return null;
			});

			// Mock getAllArticles to return duplicates
			const duplicateArticles: Article[] = [
				{
					_id: "dup1",
					_rev: "1-aaa",
					savedAt: 1000,
					title: "A",
					url: "u",
					content: "c",
					userId: mockUserId,
					isRead: false,
					favorite: false,
					type: "article",
					excerpt: "",
					tags: [],
				}, // Keep
				{
					_id: "dup1",
					_rev: "1-bbb",
					savedAt: 500,
					title: "A",
					url: "u",
					content: "c",
					userId: mockUserId,
					isRead: false,
					favorite: false,
					type: "article",
					excerpt: "",
					tags: [],
				}, // Delete
				{
					_id: "dup2",
					_rev: "1-ccc",
					savedAt: 2000,
					title: "B",
					url: "u",
					content: "c",
					userId: mockUserId,
					isRead: false,
					favorite: false,
					type: "article",
					excerpt: "",
					tags: [],
				}, // Keep
				{
					_id: "dup3",
					_rev: "1-ddd",
					savedAt: 3000,
					title: "C",
					url: "u",
					content: "c",
					userId: mockUserId,
					isRead: false,
					favorite: false,
					type: "article",
					excerpt: "",
					tags: [],
				}, // Keep (no duplicate)
				{
					_id: "dup1",
					_rev: "1-eee",
					savedAt: 800,
					title: "A",
					url: "u",
					content: "c",
					userId: mockUserId,
					isRead: false,
					favorite: false,
					type: "article",
					excerpt: "",
					tags: [],
				}, // Delete
			];
			vi.mocked(getAllArticles).mockResolvedValue(duplicateArticles);

			// Mock bulkDocs response
			const mockBulkResult: PouchDB.Core.Response[] = [
				{ ok: true, id: "dup1", rev: "2-xxx" }, // Corresponds to deleting 1-bbb
				{ ok: true, id: "dup1", rev: "2-yyy" }, // Corresponds to deleting 1-eee
			]; // Close mockBulkResult array definition

			vi.mocked(articlesDb.bulkDocs).mockResolvedValue(mockBulkResult as any); // Cast as any if type mismatch

			// Mock other functions called later in runOneTimeFileSync
			vi.mocked(fetchCloudItems).mockResolvedValue([]);
			vi.mocked(saveItemToCloud).mockResolvedValue(true);
			vi.mocked(updateArticle).mockResolvedValue({} as any); // For EPUB migration part

			// Run the function
			await runOneTimeFileSync(mockUserId, async () => "token", {} as any);

			// Assertions for cleanup part
			expect(localStorageMock.getItem).toHaveBeenCalledWith(cleanupFlagKey);
			expect(vi.mocked(getAllArticles)).toHaveBeenCalledWith({
				userIds: [mockUserId],
			}); // Called for cleanup
			expect(vi.mocked(articlesDb.bulkDocs)).toHaveBeenCalledTimes(1);
			expect(vi.mocked(articlesDb.bulkDocs)).toHaveBeenCalledWith([
				expect.objectContaining({ _id: "dup1", _rev: "1-eee", _deleted: true }), // Delete 800
				expect.objectContaining({ _id: "dup1", _rev: "1-bbb", _deleted: true }), // Delete 500
			]);
			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				cleanupFlagKey,
				"true",
			);

			// Assertions for the subsequent file sync part (ensure it still runs)
			expect(localStorageMock.getItem).toHaveBeenCalledWith(syncFlagKey);
			// getAllArticles is called again for file sync part
			expect(vi.mocked(getAllArticles)).toHaveBeenCalledTimes(2);
			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				syncFlagKey,
				"true",
			); // Assuming no files needed sync
		}); // Close the first test case ('should perform one-time duplicate cleanup...')

		it("should skip duplicate cleanup if flag is already set", async () => {
			const mockUserId = "cleanupUserDone";
			const cleanupFlagKey = `hasCleanedUpDuplicates_v1_${mockUserId}`;
			const syncFlagKey = `hasSyncedExistingFiles_${mockUserId}`; // For the later part

			// Mock localStorage: cleanup DONE, sync not done
			localStorageMock.getItem.mockImplementation((key: string) => {
				if (key === cleanupFlagKey) return "true";
				if (key === syncFlagKey) return null;
				return null;
			});

			// Mock functions that might be called later
			vi.mocked(getAllArticles).mockResolvedValue([]); // For file sync part
			vi.mocked(fetchCloudItems).mockResolvedValue([]);
			vi.mocked(saveItemToCloud).mockResolvedValue(true);

			// Run the function
			await runOneTimeFileSync(mockUserId, async () => "token", {} as any);

			// Assertions for cleanup part
			expect(localStorageMock.getItem).toHaveBeenCalledWith(cleanupFlagKey);
			// getAllArticles should only be called ONCE (for the file sync part), not for cleanup
			expect(vi.mocked(getAllArticles)).toHaveBeenCalledTimes(1);
			expect(vi.mocked(articlesDb.bulkDocs)).not.toHaveBeenCalled();
			// setItem should NOT be called for cleanup flag again
			expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
				cleanupFlagKey,
				"true",
			);

			// Assertions for the subsequent file sync part (ensure it still runs)
			expect(localStorageMock.getItem).toHaveBeenCalledWith(syncFlagKey);
			expect(localStorageMock.setItem).toHaveBeenCalledWith(
				syncFlagKey,
				"true",
			); // Assuming no files needed sync
		});
	});
});
