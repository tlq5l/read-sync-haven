import type { Article } from "@/services/db";
import type { ArticleFilters, SortCriteria } from "@/types/articles";
import { describe, expect, it } from "vitest";
import {
	filterArticles,
	getUniqueArticleTypes,
	getUniqueSiteNames,
	sortArticles,
} from "./articleUtils";

// --- Mock Data ---
const mockArticles: Article[] = [
	{
		_id: "1",
		title: "React Basics",
		url: "http://react.com",
		content: "Learn React",
		excerpt: "Fundamental concepts",
		savedAt: 1700000000000, // Older
		isRead: false,
		favorite: true,
		siteName: "react.dev",
		tags: ["tag1", "tag2"],
		estimatedReadTime: 5,
		type: "article",
	},
	{
		_id: "2",
		title: "Advanced TypeScript",
		url: "http://ts.com",
		content: "Deep dive into TS",
		excerpt: "Generics and types",
		savedAt: 1710000000000, // Newer
		isRead: true,
		favorite: false,
		siteName: "typescriptlang.org",
		tags: ["tag2", "tag3"],
		estimatedReadTime: 15,
		type: "article",
	},
	{
		_id: "3",
		title: "CSS Grid Layout",
		url: "http://css.com",
		content: "Mastering CSS Grid",
		excerpt: "Layout techniques",
		savedAt: 1705000000000, // Middle
		isRead: false,
		favorite: false,
		siteName: "css-tricks.com",
		tags: ["tag1"],
		estimatedReadTime: 10,
		type: "article",
	},
	{
		_id: "4",
		title: "My Notes",
		url: "local://notes",
		content: "Some important notes",
		excerpt: "Quick thoughts",
		savedAt: 1708000000000,
		isRead: true,
		favorite: true,
		siteName: undefined, // No site name
		tags: [], // No tags
		estimatedReadTime: undefined, // No read time
		type: "note",
	},
	{
		_id: "5",
		title: "Sample PDF Document",
		url: "local://file.pdf",
		content: "PDF Content Placeholder",
		excerpt: "A sample document",
		savedAt: 1709000000000,
		isRead: false,
		favorite: false,
		siteName: "Local PDF",
		tags: ["tag3"],
		estimatedReadTime: 20,
		type: "pdf",
	},
];

const emptyFilters: ArticleFilters = {
	siteNames: [],
	types: [],
	tags: [],
	searchQuery: "",
};

// --- Tests ---

describe("articleUtils", () => {
	describe("filterArticles", () => {
		it("should return all articles with empty filters", () => {
			const result = filterArticles(mockArticles, emptyFilters);
			expect(result).toHaveLength(mockArticles.length);
			expect(result).toEqual(mockArticles);
		});

		it("should filter by search query (title)", () => {
			const filters: ArticleFilters = { ...emptyFilters, searchQuery: "react" };
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe("1");
		});

		it("should filter by search query (excerpt)", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				searchQuery: "generics",
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe("2");
		});

		it("should filter by search query (siteName)", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				searchQuery: "css-tricks",
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe("3");
		});

		it("should filter by search query (case-insensitive)", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				searchQuery: "TYPESCRIPT",
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe("2");
		});

		it("should return empty array if search query matches nothing", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				searchQuery: "nomatch",
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(0);
		});

		it("should filter by single siteName", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				siteNames: ["react.dev"],
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe("1");
		});

		it("should filter by multiple siteNames", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				siteNames: ["react.dev", "css-tricks.com"],
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(2);
			expect(result.map((a) => a._id)).toEqual(
				expect.arrayContaining(["1", "3"]),
			);
		});

		it("should filter by single type", () => {
			const filters: ArticleFilters = { ...emptyFilters, types: ["pdf"] };
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe("5");
		});

		it("should filter by multiple types", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				types: ["note", "pdf"],
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(2);
			expect(result.map((a) => a._id)).toEqual(
				expect.arrayContaining(["4", "5"]),
			);
		});

		it("should filter by single tag", () => {
			const filters: ArticleFilters = { ...emptyFilters, tags: ["tag1"] };
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(2); // Articles 1 and 3 have tag1
			expect(result.map((a) => a._id)).toEqual(
				expect.arrayContaining(["1", "3"]),
			);
		});

		it("should filter by multiple tags (OR logic)", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				tags: ["tag1", "tag3"],
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(4); // Articles 1, 2, 3, 5 have tag1 or tag3
			expect(result.map((a) => a._id)).toEqual(
				expect.arrayContaining(["1", "2", "3", "5"]),
			);
		});

		it("should filter by tag excluding articles with no tags", () => {
			const filters: ArticleFilters = { ...emptyFilters, tags: ["tag2"] };
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(2); // Articles 1, 2 have tag2
			expect(result.map((a) => a._id)).toEqual(
				expect.arrayContaining(["1", "2"]),
			);
		});

		it("should combine multiple filters (search query and type)", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				searchQuery: "sample",
				types: ["pdf"],
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe("5");
		});

		it("should combine multiple filters (siteName and tag)", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				siteNames: ["typescriptlang.org"],
				tags: ["tag3"],
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(1);
			expect(result[0]._id).toBe("2");
		});

		it("should return empty array if combined filters match nothing", () => {
			const filters: ArticleFilters = {
				...emptyFilters,
				types: ["note"],
				tags: ["tag1"],
			};
			const result = filterArticles(mockArticles, filters);
			expect(result).toHaveLength(0);
		});

		it("should handle empty article list", () => {
			const result = filterArticles([], emptyFilters);
			expect(result).toHaveLength(0);
		});
	});

	describe("sortArticles", () => {
		it("should sort by savedAt descending by default", () => {
			const criteria: SortCriteria = { field: "savedAt", direction: "desc" };
			const result = sortArticles(mockArticles, criteria);
			expect(result.map((a) => a._id)).toEqual(["2", "5", "4", "3", "1"]);
		});

		it("should sort by savedAt ascending", () => {
			const criteria: SortCriteria = { field: "savedAt", direction: "asc" };
			const result = sortArticles(mockArticles, criteria);
			expect(result.map((a) => a._id)).toEqual(["1", "3", "4", "5", "2"]);
		});

		it("should sort by title ascending", () => {
			const criteria: SortCriteria = { field: "title", direction: "asc" };
			const result = sortArticles(mockArticles, criteria);
			expect(result.map((a) => a.title)).toEqual([
				"Advanced TypeScript",
				"CSS Grid Layout",
				"My Notes",
				"React Basics",
				"Sample PDF Document",
			]);
		});

		it("should sort by title descending", () => {
			const criteria: SortCriteria = { field: "title", direction: "desc" };
			const result = sortArticles(mockArticles, criteria);
			expect(result.map((a) => a.title)).toEqual([
				"Sample PDF Document",
				"React Basics",
				"My Notes",
				"CSS Grid Layout",
				"Advanced TypeScript",
			]);
		});

		it("should sort by siteName ascending (nulls last)", () => {
			const criteria: SortCriteria = { field: "siteName", direction: "asc" };
			const result = sortArticles(mockArticles, criteria);
			expect(result.map((a) => a.siteName)).toEqual([
				"css-tricks.com",
				"Local PDF",
				"react.dev",
				"typescriptlang.org",
				undefined,
			]);
		});

		it("should sort by siteName descending (nulls last)", () => {
			const criteria: SortCriteria = { field: "siteName", direction: "desc" };
			const result = sortArticles(mockArticles, criteria);
			expect(result.map((a) => a.siteName)).toEqual([
				"typescriptlang.org",
				"react.dev",
				"Local PDF",
				"css-tricks.com",
				undefined,
			]);
		});

		it("should sort by estimatedReadTime ascending (nulls last)", () => {
			const criteria: SortCriteria = {
				field: "estimatedReadTime",
				direction: "asc",
			};
			const result = sortArticles(mockArticles, criteria);
			expect(result.map((a) => a.estimatedReadTime)).toEqual([
				5,
				10,
				15,
				20,
				undefined,
			]);
		});

		it("should sort by estimatedReadTime descending (nulls last)", () => {
			const criteria: SortCriteria = {
				field: "estimatedReadTime",
				direction: "desc",
			};
			const result = sortArticles(mockArticles, criteria);
			expect(result.map((a) => a.estimatedReadTime)).toEqual([
				20,
				15,
				10,
				5,
				undefined,
			]);
		});

		it("should handle empty article list", () => {
			const criteria: SortCriteria = { field: "savedAt", direction: "desc" };
			const result = sortArticles([], criteria);
			expect(result).toHaveLength(0);
		});
	});

	describe("getUniqueSiteNames", () => {
		it("should return unique, sorted site names", () => {
			const result = getUniqueSiteNames(mockArticles);
			expect(result).toEqual([
				"css-tricks.com",
				"Local PDF",
				"react.dev",
				"typescriptlang.org",
			]);
		});

		it("should handle empty article list", () => {
			const result = getUniqueSiteNames([]);
			expect(result).toEqual([]);
		});
	});

	describe("getUniqueArticleTypes", () => {
		it("should return unique types in canonical order", () => {
			const result = getUniqueArticleTypes(mockArticles);
			expect(result).toEqual(["article", "pdf", "note"]); // epub not present
		});

		it("should handle empty article list", () => {
			const result = getUniqueArticleTypes([]);
			expect(result).toEqual([]);
		});
	});
});
