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
import { renderHook } from "@testing-library/react-hooks";

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
}));

// Mock clerk auth
vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => ({
		userId: "test-user-id",
		isSignedIn: true,
	}),
}));

// Import the mocked modules
import * as epubService from "@/services/epub";
import * as pdfService from "@/services/pdf";

import { saveItemToCloud } from "@/services/cloudSync"; // Import mocked cloud sync
import { saveArticle } from "@/services/db"; // Import mocked db function
import { parseArticle } from "@/services/parser"; // Import mocked parser

describe("useArticleActions", () => {
	const refreshArticlesMock = vi.fn().mockResolvedValue(undefined);

	beforeEach(() => {
		vi.clearAllMocks();
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
});
