/// <reference types="@testing-library/jest-dom" />

import { useArticleActions } from "./useArticleActions";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

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
});
