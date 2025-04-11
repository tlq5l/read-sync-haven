/// <reference types="@testing-library/jest-dom" />

import { authClient } from "@/lib/authClient"; // Import the actual client
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleActions } from "./useArticleActions";

// Mock the imports first, before any tests
vi.mock("@/services/epub", () => {
	return {
		extractEpubMetadata: vi.fn().mockResolvedValue({
			title: "Test EPUB",
			author: "Test Author",
		}),
		isValidEpub: vi.fn(),
		arrayBufferToBase64: vi.fn().mockReturnValue("mock-base64"),
		getEstimatedReadingTime: vi.fn().mockReturnValue(60),
	};
});

vi.mock("@/services/pdf", () => {
	return {
		extractPdfMetadata: vi.fn().mockResolvedValue({
			title: "Test PDF",
			author: "Test Author",
			pageCount: 20,
		}),
		isValidPdf: vi.fn(),
		arrayBufferToBase64: vi.fn().mockReturnValue("mock-base64"),
		getEstimatedReadingTime: vi.fn().mockReturnValue(40),
	};
});

// Mock the DB service
vi.mock("@/services/db", () => ({
	saveArticle: vi.fn().mockImplementation((article) => ({
		...article,
		_id: "mock-id",
		_rev: "mock-rev",
	})),
	updateArticle: vi.fn(),
	deleteArticle: vi.fn(),
	getArticle: vi.fn(),
	removeDuplicateArticles: vi.fn(),
}));

// Mock the parser service
vi.mock("@/services/parser", () => ({
	parseArticle: vi.fn(),
}));

// Mock toast hook
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({
		toast: vi.fn(),
	}),
}));

// Mock cloud sync
vi.mock("@/services/cloudSync", () => ({
	saveItemToCloud: vi.fn().mockResolvedValue(true),
	deleteItemFromCloud: vi.fn().mockResolvedValue("success"), // Mock delete too
}));

// Mock the authClient module
vi.mock("@/lib/authClient", () => ({
	authClient: {
		useSession: vi.fn(),
		// Add mocks for other methods if needed by useArticleActions, e.g., $fetch
	},
}));

// Type assertion for mocked methods
const mockUseSession = authClient.useSession as ReturnType<typeof vi.fn>;

import * as db from "@/services/db"; // Import the mocked db module
// Import the mocked modules AFTER mocks are set up
import * as epubService from "@/services/epub";
import * as pdfService from "@/services/pdf";

// Constants
const MOCK_USER_ID = "test-user-id";
const MOCK_SESSION = { user: { id: MOCK_USER_ID } };

describe("useArticleActions", () => {
	const refreshArticlesMock = vi.fn().mockResolvedValue(undefined);

	beforeEach(() => {
		vi.clearAllMocks();
		// Default mock: authenticated user
		mockUseSession.mockReturnValue({
			data: MOCK_SESSION,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
	});

	it("should add PDF file with proper siteName and estimatedReadTime", async () => {
		vi.mocked(pdfService.isValidPdf).mockReturnValue(true);
		vi.mocked(epubService.isValidEpub).mockReturnValue(false);

		const mockFile = new File(["mock content"], "test.pdf", {
			type: "application/pdf",
		});
		Object.defineProperty(mockFile, "arrayBuffer", {
			value: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
		});

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		const savedArticle = await result.current.addArticleByFile(mockFile);

		expect(savedArticle).not.toBeNull();
		if (savedArticle) {
			expect(savedArticle.type).toBe("pdf");
			expect(savedArticle.userId).toBe(MOCK_USER_ID); // Check userId from mock session
			expect(savedArticle.fileName).toBeDefined();
			expect(savedArticle.fileSize).toBeDefined();
			expect(savedArticle.siteName).toBeDefined();
			expect(savedArticle.estimatedReadTime).toBeDefined();
		}
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	it("should add EPUB file with proper metadata", async () => {
		vi.mocked(epubService.isValidEpub).mockReturnValue(true);
		vi.mocked(pdfService.isValidPdf).mockReturnValue(false);

		const mockFile = new File(["mock content"], "test.epub", {
			type: "application/epub+zip",
		});
		Object.defineProperty(mockFile, "arrayBuffer", {
			value: vi.fn().mockResolvedValue(new ArrayBuffer(2000)),
		});

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		const savedArticle = await result.current.addArticleByFile(mockFile);

		expect(savedArticle).not.toBeNull();
		if (savedArticle) {
			expect(savedArticle.type).toBe("epub");
			expect(savedArticle.userId).toBe(MOCK_USER_ID); // Check userId
			expect(savedArticle.fileName).toBeDefined();
			expect(savedArticle.fileSize).toBeDefined();
			expect(savedArticle.siteName).toBeDefined();
			expect(savedArticle.estimatedReadTime).toBeDefined();
		}
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	it("should not add file if user is not authenticated", async () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		}); // Unauthenticated

		const mockFile = new File(["mock content"], "test.pdf", {
			type: "application/pdf",
		});
		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		const savedArticle = await result.current.addArticleByFile(mockFile);

		expect(savedArticle).toBeNull();
		expect(vi.mocked(db.saveArticle)).not.toHaveBeenCalled();
		expect(refreshArticlesMock).not.toHaveBeenCalled();
	});

	// Add more tests for updateArticleStatus, removeArticle, etc. mocking getArticle as needed
	// Example for removeArticle:
	it("should remove an article if user is authenticated", async () => {
		const articleIdToRemove = "article-to-remove";
		const mockArticle = {
			_id: articleIdToRemove,
			_rev: "1-abc",
			userId: MOCK_USER_ID,
			title: "Test",
			url: "url",
			content: "content",
			type: "article",
			status: "inbox",
		};
		vi.mocked(db.getArticle).mockResolvedValue(mockArticle as any); // Mock fetching the article
		vi.mocked(db.deleteArticle).mockResolvedValue(true); // Mock successful deletion (returns boolean)

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		const success = await result.current.removeArticle(articleIdToRemove);

		expect(success).toBe(true);
		expect(vi.mocked(db.getArticle)).toHaveBeenCalledWith(articleIdToRemove);
		expect(vi.mocked(db.deleteArticle)).toHaveBeenCalledWith(
			articleIdToRemove,
			"1-abc",
		);
		// removeArticle doesn't call refresh itself, caller handles it
		expect(refreshArticlesMock).not.toHaveBeenCalled();
	});

	it("should not remove an article if user is not authenticated", async () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		}); // Unauthenticated

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		const success = await result.current.removeArticle("some-id");

		expect(success).toBe(false);
		expect(vi.mocked(db.getArticle)).not.toHaveBeenCalled();
		expect(vi.mocked(db.deleteArticle)).not.toHaveBeenCalled();
	});

	it("should not remove an article if user does not own it", async () => {
		const articleIdToRemove = "article-to-remove";
		const mockArticle = {
			_id: articleIdToRemove,
			_rev: "1-abc",
			userId: "another-user-id",
			title: "Test",
			url: "url",
			content: "content",
			type: "article",
			status: "inbox",
		};
		vi.mocked(db.getArticle).mockResolvedValue(mockArticle as any);

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		const success = await result.current.removeArticle(articleIdToRemove);

		expect(success).toBe(false); // Failed due to permission error
		expect(vi.mocked(db.getArticle)).toHaveBeenCalledWith(articleIdToRemove);
		expect(vi.mocked(db.deleteArticle)).not.toHaveBeenCalled();
	});
});
