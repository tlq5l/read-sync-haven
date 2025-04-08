import type { Article } from "@/services/db/types"; // Correct type import path
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadingProgress } from "./useReadingProgress";

// --- Mocks Setup ---
// Hoist mocks for Dexie functions
const { mockDexieGetArticle, mockDexieUpdateArticle } = vi.hoisted(() => {
	return {
		mockDexieGetArticle: vi.fn(),
		mockDexieUpdateArticle: vi.fn(),
	};
});

// Mock useAuth without getToken, as it's not used in the hook anymore
vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => ({
		userId: "progress-user",
		isSignedIn: true,
		// getToken: mockGetTokenFn, // Removed
	}),
}));

// Remove cloudSync mock as it's not used
// vi.mock("@/services/cloudSync", () => ({
//  saveItemToCloud: mockSaveItemToCloud,
// }));

// Mock the actual Dexie db object and its methods used by the hook
vi.mock("@/services/db/dexie", () => ({
	db: {
		articles: {
			get: mockDexieGetArticle,
			update: mockDexieUpdateArticle,
		},
	},
}));

// Remove debounce mock as it's not used
// vi.mock("@/lib/utils", () => ({
//  debounce: (fn: (...args: any[]) => void /*, delay: number */) => {
//      return (...args: any[]) => fn(...args);
//  },
// }));

// --- Tests ---
describe("useReadingProgress", () => {
	beforeEach(() => {
		// Clear only relevant mocks
		vi.clearAllMocks();
		// mockGetTokenFn.mockClear().mockResolvedValue("progress-token"); // Removed
		// mockSaveItemToCloud.mockClear().mockResolvedValue("success"); // Removed
		mockDexieGetArticle.mockClear();
		mockDexieUpdateArticle.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const mockExistingArticle: Article = {
		_id: "article-progress-1",
		_rev: "rev-progress-1",
		userId: "progress-user",
		title: "Progress Test",
		url: "http://progress.test",
		content: "Progress content",
		savedAt: Date.now() - 10000,
		status: "inbox",
		isRead: false,
		favorite: false,
		type: "article",
		version: 1,
		excerpt: "Progress excerpt",
		tags: [],
		readingProgress: 10, // Initial progress
	};

	it("should update local article progress and mark as read if >= 90%", async () => {
		mockDexieGetArticle.mockResolvedValue(mockExistingArticle);
		// Dexie's update method returns the number of updated records (usually 1)
		mockDexieUpdateArticle.mockResolvedValue(1);

		const { result } = renderHook(() => useReadingProgress());

		await act(async () => {
			await result.current.updateReadingProgress("article-progress-1", 95);
		});

		expect(mockDexieGetArticle).toHaveBeenCalledWith("article-progress-1");
		// Dexie's update method is called with the ID and a partial update object
		expect(mockDexieUpdateArticle).toHaveBeenCalledWith(
			"article-progress-1",
			expect.objectContaining({
				readingProgress: 95,
				isRead: true, // Should be marked as read
				readAt: expect.any(Number), // Should have readAt timestamp
			}),
		);
		// Cloud sync is removed, no need for separate test
	});

	// Remove test for cloud sync as it's no longer part of the hook
	// it("should call saveItemToCloud with token after debounce", async () => { ... });

	// Remove test related to getToken returning null, as getToken is not called
	// it("should not call saveItemToCloud if getToken returns null", async () => { ... });

	// Remove test related to getToken rejecting, as getToken is not called
	// it("should not call saveItemToCloud if getToken rejects", async () => { ... });

	it("should not call updateArticle or saveItemToCloud if progress hasn't changed significantly", async () => {
		mockDexieGetArticle.mockResolvedValue(mockExistingArticle); // readingProgress is 10

		const { result } = renderHook(() => useReadingProgress());

		await act(async () => {
			// Update with a value very close to the original
			await result.current.updateReadingProgress("article-progress-1", 10.5);
		});

		expect(mockDexieGetArticle).toHaveBeenCalledWith("article-progress-1");
		expect(mockDexieUpdateArticle).not.toHaveBeenCalled();
		// expect(mockGetTokenFn).not.toHaveBeenCalled(); // Removed check
		// expect(mockSaveItemToCloud).not.toHaveBeenCalled(); // Removed check as cloud sync is removed
	});
});
