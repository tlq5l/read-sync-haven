import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleSync } from "./useArticleSync";

// Mock dependencies
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => ({
		userId: "test-user-id",
		isSignedIn: true,
		isLoaded: true,
		getToken: vi.fn().mockResolvedValue("test-token"),
	}),
	useUser: () => ({
		user: {
			primaryEmailAddress: { emailAddress: "test@example.com" },
		},
	}),
}));

vi.mock("@/services/db", () => ({
	getAllArticles: vi.fn(),
	saveArticle: vi.fn((article) => Promise.resolve(article)),
	bulkSaveArticles: vi.fn((articles) => Promise.resolve(articles)), // Add mock
}));

vi.mock("@/services/cloudSync", () => ({
	fetchCloudItems: vi.fn(),
}));

// Import Article type for proper type checking in our mocks
import type { Article } from "@/services/db";

// Mock all dependencies
vi.mock("@/lib/articleUtils", () => {
	return {
		filterAndSortArticles: vi.fn((articles: Article[], view: string) => {
			if (view === "unread") return articles.filter((a: Article) => !a.isRead);
			if (view === "favorites")
				return articles.filter((a: Article) => a.favorite);
			return articles;
		}),
		// deduplicateArticles is no longer in articleUtils, it's internal to the hook
		runOneTimeFileSync: vi.fn(),
	};
});

// Removed unused import: import * as articleUtils from "@/lib/articleUtils";
import * as cloudSync from "@/services/cloudSync";
import * as db from "@/services/db";

describe("useArticleSync", () => {
	const mockArticles: Article[] = [
		{
			_id: "1",
			url: "http://example.com/1",
			title: "Article 1",
			content: "Content 1",
			savedAt: 1000,
			status: "inbox",
			isRead: false,
			favorite: false,
			type: "article" as const, // Use const assertion to specify literal type
			userId: "test-user-id",
			excerpt: "",
			tags: [],
		},
		{
			_id: "2",
			url: "http://example.com/2",
			title: "Article 2",
			content: "Content 2",
			savedAt: 2000,
			status: "inbox",
			isRead: false,
			favorite: false,
			type: "article" as const,
			userId: "test-user-id",
			excerpt: "",
			tags: [],
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(db.getAllArticles).mockResolvedValue([]);
		vi.mocked(cloudSync.fetchCloudItems).mockResolvedValue([]);
	});

	it("should deduplicate articles that have the same ID but different savedAt", async () => {
		// Create a duplicate article with a newer timestamp
		const duplicateArticles: Article[] = [
			...mockArticles,
			{
				_id: "1", // Same ID as the first article
				url: "http://example.com/1",
				title: "Article 1 Updated", // Different title
				content: "Updated content", // Different content
				savedAt: 3000, // Newer timestamp
				status: "inbox",
				isRead: false,
				favorite: true, // Different favorite status
				type: "article" as const,
				userId: "test-user-id",
				excerpt: "",
				tags: [],
			},
		];

		// Mock getAllArticles to return articles with duplicates
		vi.mocked(db.getAllArticles).mockResolvedValue(duplicateArticles);

		// Render the hook
		const { result } = renderHook(
			() => useArticleSync(true, new Set<string>()), // Pass empty set for hidingArticleIds
		);

		// Wait for initial load to complete
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Deduplication is now internal to the hook, we verify the result below

		// Verify we only have 2 articles (not 3)
		expect(result.current.articles.length).toBe(2);

		// Verify the duplicate article has been replaced with the newer version
		const article1 = result.current.articles.find((a) => a._id === "1");
		expect(article1).toBeDefined();
		expect(article1?.title).toBe("Article 1 Updated");
		expect(article1?.content).toBe("Updated content");
		expect(article1?.savedAt).toBe(3000);
		expect(article1?.favorite).toBe(true);
	});

	it("should deduplicate articles received from the cloud", async () => {
		// Mock cached articles (local db)
		vi.mocked(db.getAllArticles).mockResolvedValue(mockArticles);

		// Mock cloud articles with duplicates
		const cloudArticles: Article[] = [
			{
				_id: "1", // Same as in cache but updated
				url: "http://example.com/1",
				title: "Cloud Article 1",
				content: "Cloud Content 1",
				savedAt: 5000, // Newer
				status: "inbox",
				isRead: true,
				favorite: true,
				type: "article" as const,
				userId: "test-user-id",
				excerpt: "",
				tags: [],
			},
			{
				_id: "3", // New article from cloud
				url: "http://example.com/3",
				title: "Cloud Article 3",
				content: "Cloud Content 3",
				savedAt: 4000,
				status: "inbox",
				isRead: false,
				favorite: false,
				type: "article" as const,
				userId: "test-user-id",
				excerpt: "",
				tags: [],
			},
		];

		vi.mocked(cloudSync.fetchCloudItems).mockResolvedValue(cloudArticles);

		// After sync, getAllArticles will be called again and should return
		// the combination of local and cloud articles (with potential duplicates)
		const combinedArticles: Article[] = [...mockArticles, ...cloudArticles];
		// We need to replace the getAllArticles mock to return the combined articles during the second call
		// This will properly simulate the scenario where local and cloud articles are combined
		const getAllArticlesMock = vi.mocked(db.getAllArticles);

		// First call returns the initial mockArticles
		getAllArticlesMock.mockResolvedValueOnce(mockArticles);

		// Second call (after cloud sync) should return combined articles
		getAllArticlesMock.mockResolvedValueOnce(combinedArticles);

		// Subsequent calls should also return the combined articles
		getAllArticlesMock.mockResolvedValue(combinedArticles);

		// Render the hook
		const { result } = renderHook(
			() => useArticleSync(true, new Set<string>()), // Pass empty set for hidingArticleIds
		);

		// Wait for sync to complete
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		// Deduplication is now internal to the hook, we verify the result below

		// We should have 3 articles after deduplication (not 4)
		expect(result.current.articles.length).toBe(3);

		// Verify the duplicate article has been replaced with the cloud (newer) version
		const article1 = result.current.articles.find((a) => a._id === "1");
		expect(article1).toBeDefined();
		expect(article1?.title).toBe("Cloud Article 1");
		expect(article1?.savedAt).toBe(5000);
		expect(article1?.isRead).toBe(true);
		expect(article1?.favorite).toBe(true);

		// Verify the other articles are present
		expect(result.current.articles.some((a) => a._id === "2")).toBe(true);
		expect(result.current.articles.some((a) => a._id === "3")).toBe(true);
	});
});
