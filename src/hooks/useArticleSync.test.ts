import { authClient } from "@/lib/authClient"; // Import the actual client
import * as cloudSync from "@/services/cloudSync";
import type { Article } from "@/services/db"; // Import Article type
import * as db from "@/services/db";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleSync } from "./useArticleSync";

// Mock dependencies
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock the authClient module
vi.mock("@/lib/authClient", () => ({
	authClient: {
		useSession: vi.fn(),
		// Mock other methods if useArticleSync uses them (e.g., $fetch if fetchCloudItems is not mocked externally)
		// $fetch: vi.fn(),
	},
}));

// Type assertion for mocked methods
const mockUseSession = authClient.useSession as ReturnType<typeof vi.fn>;
// const mockFetch = authClient.$fetch as ReturnType<typeof vi.fn>; // If mocking $fetch

// Mock services
vi.mock("@/services/db", () => ({
	getAllArticles: vi.fn(),
	saveArticle: vi.fn((article) => Promise.resolve(article)),
}));

vi.mock("@/services/cloudSync", () => ({
	fetchCloudItems: vi.fn(),
}));

// Mock articleUtils (if still needed, seems unused now)
// vi.mock("@/lib/articleUtils", () => ({ /* ... */ }));

// Constants
const MOCK_USER_ID = "test-user-id";
const MOCK_USER_EMAIL = "test@example.com";
const MOCK_SESSION = {
	user: { id: MOCK_USER_ID, email: MOCK_USER_EMAIL /* other fields */ },
};

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
			type: "article",
			userId: MOCK_USER_ID,
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
			type: "article",
			userId: MOCK_USER_ID,
			excerpt: "",
			tags: [],
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		// Default mocks
		mockUseSession.mockReturnValue({
			data: MOCK_SESSION,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
		vi.mocked(db.getAllArticles).mockResolvedValue([]);
		vi.mocked(cloudSync.fetchCloudItems).mockResolvedValue([]);
	});

	it("should deduplicate articles that have the same ID but different savedAt", async () => {
		const duplicateArticles: Article[] = [
			...mockArticles,
			{
				_id: "1",
				url: "http://example.com/1",
				title: "Article 1 Updated",
				content: "Updated content",
				savedAt: 3000,
				status: "inbox",
				isRead: false,
				favorite: true,
				type: "article",
				userId: MOCK_USER_ID,
				excerpt: "",
				tags: [],
			},
		];
		vi.mocked(db.getAllArticles).mockResolvedValue(duplicateArticles);

		const { result } = renderHook(() => useArticleSync(true));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(result.current.articles.length).toBe(2);
		const article1 = result.current.articles.find((a) => a._id === "1");
		expect(article1).toBeDefined();
		expect(article1?.title).toBe("Article 1 Updated");
		expect(article1?.savedAt).toBe(3000);
		expect(article1?.favorite).toBe(true);
	});

	it("should deduplicate articles received from the cloud", async () => {
		vi.mocked(db.getAllArticles).mockResolvedValueOnce(mockArticles); // Initial cache load

		const cloudArticles: Article[] = [
			{
				_id: "1",
				url: "http://example.com/1",
				title: "Cloud Article 1",
				content: "Cloud Content 1",
				savedAt: 5000,
				status: "inbox",
				isRead: true,
				favorite: true,
				type: "article",
				userId: MOCK_USER_ID,
				excerpt: "",
				tags: [],
			},
			{
				_id: "3",
				url: "http://example.com/3",
				title: "Cloud Article 3",
				content: "Cloud Content 3",
				savedAt: 4000,
				status: "inbox",
				isRead: false,
				favorite: false,
				type: "article",
				userId: MOCK_USER_ID,
				excerpt: "",
				tags: [],
			},
		];
		vi.mocked(cloudSync.fetchCloudItems).mockResolvedValue(cloudArticles);

		// Mock the second getAllArticles call after sync + save
		const combinedArticles: Article[] = [
			// Article 2 from original cache
			mockArticles[1],
			// Article 1 from cloud (updated)
			cloudArticles[0],
			// Article 3 from cloud (new)
			cloudArticles[1],
		];
		// Need to ensure this mock is used *after* the cloud items are "saved"
		vi.mocked(db.getAllArticles).mockResolvedValueOnce(combinedArticles); // Load after sync

		const { result } = renderHook(() => useArticleSync(true));

		await waitFor(() => {
			// Wait for both cache load and cloud sync to finish
			expect(vi.mocked(cloudSync.fetchCloudItems)).toHaveBeenCalledTimes(1);
			expect(vi.mocked(db.saveArticle)).toHaveBeenCalledTimes(
				cloudArticles.length,
			); // Ensure cloud articles were saved
			expect(vi.mocked(db.getAllArticles)).toHaveBeenCalledTimes(2); // Initial load + load after sync
			expect(result.current.isLoading).toBe(false);
			expect(result.current.isRefreshing).toBe(false); // Refresh should complete
		});

		expect(result.current.articles.length).toBe(3); // Should be 3 after deduplication

		const article1 = result.current.articles.find((a) => a._id === "1");
		expect(article1).toBeDefined();
		expect(article1?.title).toBe("Cloud Article 1");
		expect(article1?.savedAt).toBe(5000);
		expect(article1?.isRead).toBe(true);
		expect(article1?.favorite).toBe(true);

		expect(result.current.articles.some((a) => a._id === "2")).toBe(true);
		expect(result.current.articles.some((a) => a._id === "3")).toBe(true);
	});

	it("should not fetch from cloud if not authenticated", async () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		}); // Not authenticated

		const { result } = renderHook(() => useArticleSync(true));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false); // Loading finishes even if not signed in
		});

		expect(vi.mocked(db.getAllArticles)).not.toHaveBeenCalled(); // Shouldn't load cache if not signed in
		expect(vi.mocked(cloudSync.fetchCloudItems)).not.toHaveBeenCalled(); // Shouldn't sync if not signed in
		expect(result.current.articles).toEqual([]); // Articles should be empty
	});

	it("should handle error during cloud sync", async () => {
		const syncError = new Error("Cloud sync failed!");
		vi.mocked(cloudSync.fetchCloudItems).mockRejectedValue(syncError);
		vi.mocked(db.getAllArticles).mockResolvedValueOnce(mockArticles); // Load from cache successfully

		const { result } = renderHook(() => useArticleSync(true));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
			expect(result.current.isRefreshing).toBe(false); // Refreshing should stop on error
			expect(result.current.error).toBe(syncError);
			// Articles should still contain cached data
			expect(result.current.articles.length).toBe(mockArticles.length);
		});

		expect(vi.mocked(db.getAllArticles)).toHaveBeenCalledTimes(1); // Only initial cache load
		expect(vi.mocked(cloudSync.fetchCloudItems)).toHaveBeenCalledTimes(1);
	});
});
