/// <reference types="@testing-library/jest-dom" />
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
// Removed outdated renderHook import

// Kept imports from backup-staging-local
import type { Article } from "@/services/db"; // Import Article type
import { renderHook } from "@testing-library/react"; // Use renderHook from @testing-library/react
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
	saveItemToCloud: vi.fn().mockResolvedValue("success"), // Ensure consistent mock return
	deleteItemFromCloud: vi.fn().mockResolvedValue("success"), // Add mock for deleteItemFromCloud
}));

// Mock clerk auth
// Moved the core mock logic outside to allow modification per test
const mockGetTokenFn = vi.fn().mockResolvedValue("mock-test-token");
const mockUseAuthData = {
	userId: "test-user-id",
	isSignedIn: true,
	getToken: mockGetTokenFn,
};
vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => mockUseAuthData,
}));

// Import the mocked modules
import * as epubService from "@/services/epub";
import * as pdfService from "@/services/pdf";

import { deleteItemFromCloud, saveItemToCloud } from "@/services/cloudSync"; // Import mocked cloud sync functions
import { deleteArticle, getArticle, saveArticle } from "@/services/db"; // Import mocked db functions
import { parseArticle } from "@/services/parser"; // Import mocked parser

// Define mock outside describe block for accessibility
const refreshArticlesMock = vi.fn().mockResolvedValue(undefined);

describe("useArticleActions", () => {
	// refreshArticlesMock is now defined outside

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset getToken mock before each test
		mockGetTokenFn.mockClear().mockResolvedValue("mock-test-token");
		// Reset cloud sync mocks (ensure saveItemToCloud was mocked)
		vi.mocked(saveItemToCloud).mockClear().mockResolvedValue("success");
		// Import and mock deleteItemFromCloud if not already done
		// deleteItemFromCloud is now mocked via vi.mock, access it directly
		vi.mocked(deleteItemFromCloud).mockClear().mockResolvedValue("success");
	});

	it("should add PDF file with proper siteName and estimatedReadTime", async () => {
		// Set up mocks for this test
		vi.mocked(pdfService.isValidPdf).mockReturnValue(true);
		vi.mocked(epubService.isValidEpub).mockReturnValue(false);

		// Mock File implementation
		const mockFile = new File(["mock content"], "test.pdf", {
			type: "application/pdf",
		});

		// Mock ArrayBuffer
		Object.defineProperty(mockFile, "arrayBuffer", {
			value: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
		});

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));

		const savedArticle = await result.current.addArticleByFile(mockFile);

		expect(savedArticle).not.toBeNull();
		if (savedArticle) {
			expect(savedArticle.type).toBe("pdf");
			expect(savedArticle.fileName).toBeDefined();
			expect(savedArticle.fileSize).toBeDefined();
			expect(savedArticle.siteName).toBeDefined();
			expect(savedArticle.estimatedReadTime).toBeDefined();
		}
	});

	it("should add EPUB file with proper metadata", async () => {
		// Set up mocks for this test
		vi.mocked(epubService.isValidEpub).mockReturnValue(true);
		vi.mocked(pdfService.isValidPdf).mockReturnValue(false);

		// Mock File implementation
		const mockFile = new File(["mock content"], "test.epub", {
			type: "application/epub+zip",
		});

		// Mock ArrayBuffer
		Object.defineProperty(mockFile, "arrayBuffer", {
			value: vi.fn().mockResolvedValue(new ArrayBuffer(2000)),
		});

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));

		const savedArticle = await result.current.addArticleByFile(mockFile);

		expect(savedArticle).not.toBeNull();
		if (savedArticle) {
			expect(savedArticle.type).toBe("epub");
			expect(savedArticle.fileName).toBeDefined();
			expect(savedArticle.fileSize).toBeDefined();
			expect(savedArticle.siteName).toBeDefined();
			expect(savedArticle.estimatedReadTime).toBeDefined();
		}
	});

	it("should add article by URL", async () => {
		// Mock parseArticle response
		const mockParsedData = {
			title: "Test URL Article",
			content: "<p>URL Content</p>",
			excerpt: "URL Excerpt",
			author: "URL Author",
			siteName: "url-example.com",
			estimatedReadTime: 4,
			type: "article" as const,
			url: "https://url-example.com/test", // Ensure URL is included
			status: "inbox" as const, // Correct type
			version: 1, // Add missing version
		};
		vi.mocked(parseArticle).mockResolvedValue(mockParsedData);

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		const testUrl = "https://url-example.com/test";

		const savedArticle = await result.current.addArticleByUrl(testUrl);

		// Assertions
		expect(parseArticle).toHaveBeenCalledWith(testUrl);
		expect(saveArticle).toHaveBeenCalledTimes(1);
		const savedData = vi.mocked(saveArticle).mock.calls[0][0];
		expect(savedData).toMatchObject({
			...mockParsedData,
			userId: "test-user-id", // From mock auth
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			readingProgress: 0,
		});
		expect(savedData.savedAt).toBeDefined(); // Check timestamp was added
		expect(saveItemToCloud).toHaveBeenCalledTimes(1); // Check cloud sync call
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1); // Check refresh call
		expect(savedArticle).not.toBeNull();
		expect(savedArticle?._id).toBe("mock-id"); // From saveArticle mock
		expect(savedArticle?.title).toBe("Test URL Article");
	});
	// Moved new tests inside the describe block

	it("should not call saveItemToCloud if getToken returns null when adding URL", async () => {
		mockGetTokenFn.mockResolvedValueOnce(null); // Mock getToken returning null
		// Complete the mockParsedData object
		const mockParsedData = {
			title: "Test URL Null Token",
			content: "<p>Null token content</p>",
			excerpt: "Null excerpt",
			author: "Null Author",
			siteName: "null-token.com",
			estimatedReadTime: 1,
			type: "article" as const,
			url: "http://null-token.com",
			status: "inbox" as const,
			version: 1,
		};
		vi.mocked(parseArticle).mockResolvedValue(mockParsedData);

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		await result.current.addArticleByUrl("http://null-token.com");

		expect(saveArticle).toHaveBeenCalled(); // Local save should still happen
		expect(mockGetTokenFn).toHaveBeenCalledTimes(1);
		expect(saveItemToCloud).not.toHaveBeenCalled(); // Cloud save should NOT happen
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	it("should not call saveItemToCloud if getToken rejects when adding File", async () => {
		mockGetTokenFn.mockRejectedValueOnce(new Error("Token fetch failed")); // Mock getToken rejecting
		vi.mocked(pdfService.isValidPdf).mockReturnValue(true);
		const mockFile = new File(["mock"], "reject.pdf", {
			type: "application/pdf",
		});
		Object.defineProperty(mockFile, "arrayBuffer", {
			value: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
		});
		// Spy on console.error
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		await result.current.addArticleByFile(mockFile);

		expect(saveArticle).toHaveBeenCalled(); // Local save should still happen
		expect(mockGetTokenFn).toHaveBeenCalledTimes(1);
		expect(saveItemToCloud).not.toHaveBeenCalled(); // Cloud save should NOT happen
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
		// Check that the token fetch error was logged
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Error fetching token for cloud sync:",
			expect.any(Error), // Expect an error object
		);
		consoleErrorSpy.mockRestore(); // Clean up spy
	});

	// deleteItemFromCloud is imported at the top (line 80)

	it("should not call deleteItemFromCloud if getToken returns null when removing article", async () => {
		mockGetTokenFn.mockResolvedValueOnce(null); // Mock getToken returning null
		// Mock getArticle to return something deletable
		// Use the imported getArticle mock
		// Complete the mock Article object with required fields
		vi.mocked(getArticle).mockResolvedValue({
			_id: "delete-id",
			_rev: "rev",
			userId: "test-user-id",
			title: "Delete Test",
			url: "http://delete.test",
			content: "Delete content",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			type: "article",
			version: 1,
			excerpt: "Delete excerpt",
			tags: [],
		} as Article);

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		await result.current.removeArticle("delete-id");

		// Use the imported deleteArticle mock
		expect(deleteArticle).toHaveBeenCalledWith("delete-id"); // Local delete should still happen
		expect(mockGetTokenFn).toHaveBeenCalledTimes(1);
		expect(deleteItemFromCloud).not.toHaveBeenCalled(); // Cloud delete should NOT happen
	});
}); // This is the correct closing brace for the main describe block
// Removed the extra closing brace that was causing syntax error
