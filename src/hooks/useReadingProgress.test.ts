import type { Article } from "@/services/db";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadingProgress } from "./useReadingProgress";

// --- Mocks Setup ---
const {
	mockGetTokenFn,
	mockSaveItemToCloud,
	mockGetArticle,
	mockUpdateArticle,
} = vi.hoisted(() => {
	return {
		mockGetTokenFn: vi.fn().mockResolvedValue("progress-token"),
		mockSaveItemToCloud: vi.fn().mockResolvedValue("success"),
		mockGetArticle: vi.fn(),
		mockUpdateArticle: vi.fn(),
	};
});

vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => ({
		userId: "progress-user",
		isSignedIn: true,
		getToken: mockGetTokenFn,
	}),
}));

vi.mock("@/services/cloudSync", () => ({
	saveItemToCloud: mockSaveItemToCloud,
}));

vi.mock("@/services/db", () => ({
	getArticle: mockGetArticle,
	updateArticle: mockUpdateArticle,
}));

// Mock debounce to execute immediately for testing or use timers
vi.mock("@/lib/utils", () => ({
	debounce: (fn: (...args: any[]) => void /*, delay: number */) => {
		// Simple immediate execution for testing basic calls
		// For timing tests, we might need vi.useFakeTimers()
		return (...args: any[]) => fn(...args);
	},
}));

// --- Tests ---
describe("useReadingProgress", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetTokenFn.mockClear().mockResolvedValue("progress-token");
		mockSaveItemToCloud.mockClear().mockResolvedValue("success");
		mockGetArticle.mockClear();
		mockUpdateArticle.mockClear();
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
		mockGetArticle.mockResolvedValue(mockExistingArticle);
		mockUpdateArticle.mockImplementation(async (updates) => ({
			...mockExistingArticle,
			...updates,
			_rev: "rev-progress-2", // Simulate new revision
		}));

		const { result } = renderHook(() => useReadingProgress());

		await act(async () => {
			await result.current.updateReadingProgress("article-progress-1", 95);
		});

		expect(mockGetArticle).toHaveBeenCalledWith("article-progress-1");
		expect(mockUpdateArticle).toHaveBeenCalledWith(
			expect.objectContaining({
				_id: "article-progress-1",
				_rev: "rev-progress-1",
				readingProgress: 95,
				isRead: true, // Should be marked as read
				readAt: expect.any(Number), // Should have readAt timestamp
			}),
		);
		// Cloud save check will be in the next test due to debounce mock
	});

	it("should call saveItemToCloud with token after debounce", async () => {
		// This test relies on the immediate execution debounce mock
		const updatedArticleData = {
			...mockExistingArticle,
			readingProgress: 50,
			_rev: "rev-progress-3",
		};
		mockGetArticle.mockResolvedValue(mockExistingArticle);
		mockUpdateArticle.mockResolvedValue(updatedArticleData);

		const { result } = renderHook(() => useReadingProgress());

		await act(async () => {
			await result.current.updateReadingProgress("article-progress-1", 50);
		});

		// Assert local update happened first
		expect(mockUpdateArticle).toHaveBeenCalledWith(
			expect.objectContaining({
				_id: "article-progress-1",
				_rev: "rev-progress-1",
				readingProgress: 50,
			}),
		);

		// Assert cloud save was called (immediately due to mock debounce)
		expect(mockGetTokenFn).toHaveBeenCalledTimes(1);
		expect(mockSaveItemToCloud).toHaveBeenCalledTimes(1);
		expect(mockSaveItemToCloud).toHaveBeenCalledWith(
			updatedArticleData, // Should sync the locally updated article data
			"progress-token", // Should pass the token
		);
	});

	it("should not call saveItemToCloud if getToken returns null", async () => {
		mockGetTokenFn.mockResolvedValueOnce(null); // Mock getToken failure
		mockGetArticle.mockResolvedValue(mockExistingArticle);
		mockUpdateArticle.mockResolvedValue({
			...mockExistingArticle,
			readingProgress: 60,
			_rev: "rev-null-token",
		});

		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { result } = renderHook(() => useReadingProgress());

		await act(async () => {
			await result.current.updateReadingProgress("article-progress-1", 60);
		});

		expect(mockUpdateArticle).toHaveBeenCalled(); // Local update should happen
		expect(mockGetTokenFn).toHaveBeenCalledTimes(1);
		expect(mockSaveItemToCloud).not.toHaveBeenCalled(); // Cloud save should NOT happen
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Cannot sync reading progress: No token available.",
		);
		consoleErrorSpy.mockRestore();
	});

	it("should not call saveItemToCloud if getToken rejects", async () => {
		mockGetTokenFn.mockRejectedValueOnce(new Error("Clerk Error")); // Mock getToken failure
		mockGetArticle.mockResolvedValue(mockExistingArticle);
		mockUpdateArticle.mockResolvedValue({
			...mockExistingArticle,
			readingProgress: 70,
			_rev: "rev-reject-token",
		});

		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { result } = renderHook(() => useReadingProgress());

		await act(async () => {
			await result.current.updateReadingProgress("article-progress-1", 70);
		});

		expect(mockUpdateArticle).toHaveBeenCalled(); // Local update should happen
		expect(mockGetTokenFn).toHaveBeenCalledTimes(1);
		expect(mockSaveItemToCloud).not.toHaveBeenCalled(); // Cloud save should NOT happen
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Error syncing progress update for article-progress-1:",
			expect.any(Error),
		);
		consoleErrorSpy.mockRestore();
	});

	it("should not call updateArticle or saveItemToCloud if progress hasn't changed significantly", async () => {
		mockGetArticle.mockResolvedValue(mockExistingArticle); // readingProgress is 10

		const { result } = renderHook(() => useReadingProgress());

		await act(async () => {
			// Update with a value very close to the original
			await result.current.updateReadingProgress("article-progress-1", 10.5);
		});

		expect(mockGetArticle).toHaveBeenCalledWith("article-progress-1");
		expect(mockUpdateArticle).not.toHaveBeenCalled();
		expect(mockGetTokenFn).not.toHaveBeenCalled();
		expect(mockSaveItemToCloud).not.toHaveBeenCalled();
	});
});
