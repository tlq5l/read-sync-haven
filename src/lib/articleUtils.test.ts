import type { Article } from "@/services/db"; // Assuming this path is correct
import { describe, expect, it } from "vitest";
import { filterAndSortArticles } from "./articleUtils";

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

	// TODO: Add tests for runOneTimeFileSync (will require mocking)
});
