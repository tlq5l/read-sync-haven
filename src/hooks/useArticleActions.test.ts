import type { Article } from "@/services/db/types"; // Correct import path for Article
/// <reference types="@testing-library/jest-dom" />
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleActions } from "./useArticleActions";

// --- Mocks Setup ---

// Hoist the Dexie mock variables and definition
const { mockArticlesTable, mockDbData } = vi.hoisted(() => {
	const _mockDbData: Article[] = []; // In-memory store for articles
	const _mockArticlesTable = {
		// Core Methods
		toArray: vi.fn(async () => structuredClone(mockDbData)), // Return copy
		bulkPut: vi.fn(
			async (items: Article[], keys?: any, options?: { allKeys: boolean }) => {
				const addedIds: string[] = [];
				for (const item of items) {
					if (!item._id)
						throw new Error("Mock Dexie Error: Article must have an _id"); // Check for _id
					const index = mockDbData.findIndex(
						(dbItem) => dbItem._id === item._id,
					); // Use _id for findIndex
					const newItem = structuredClone(item); // Store copy
					if (index !== -1) {
						mockDbData[index] = newItem; // Update
					} else {
						mockDbData.push(newItem); // Add
					}
					addedIds.push(item._id); // Push _id
				}
				// Dexie's bulkPut returns the keys of the added/updated items
				return Promise.resolve(
					options?.allKeys ? addedIds : addedIds[addedIds.length - 1],
				);
			},
		),
		get: vi.fn(async (_id: string) => {
			// Parameter name changed for clarity
			const found = mockDbData.find((item) => item._id === _id); // Use _id for find
			return Promise.resolve(found ? structuredClone(found) : undefined); // Return copy
		}),
		put: vi.fn(async (item: Article, key?: any) => {
			// Use _id
			if (!item._id)
				throw new Error("Mock Dexie Error: Article must have an _id"); // Check for _id
			const index = mockDbData.findIndex((dbItem) => dbItem._id === item._id); // Use _id for findIndex
			const newItem = structuredClone(item); // Store copy
			if (index !== -1) {
				mockDbData[index] = newItem; // Update
			} else {
				mockDbData.push(newItem); // Add
			}
			return Promise.resolve(item._id); // Return _id
		}),
		delete: vi.fn(async (_id: string) => {
			// Parameter name changed for clarity
			const initialLength = _mockDbData.length; // Use internal variable
			// Filter in place: Find index and splice
			const indexToRemove = _mockDbData.findIndex((item) => item._id === _id); // Use internal variable
			if (indexToRemove !== -1) {
				_mockDbData.splice(indexToRemove, 1); // Modify internal array
			}
			return Promise.resolve(initialLength - mockDbData.length); // Dexie delete returns count of deleted items (0 or 1)
		}),
		// Querying Methods (add more as needed by useArticleActions)
		where: vi.fn((index: string) => ({
			equals: vi.fn((value: any) => ({
				toArray: vi.fn(async () => {
					const results = mockDbData.filter(
						(item) => item[index as keyof Article] === value,
					);
					return Promise.resolve(structuredClone(results)); // Return copy
				}),
			})),
		})),
		// Utility methods
		clear: vi.fn(async () => {
			_mockDbData.length = 0; // Clear internal array in place
			return Promise.resolve();
		}),
		// Add other methods if useArticleActions interacts with them
	};
	return { mockArticlesTable: _mockArticlesTable, mockDbData: _mockDbData };
});

// Mock the specific db instance exported from dexie.ts
vi.mock("@/services/db/dexie", () => ({
	db: {
		articles: mockArticlesTable, // Use the hoisted mock
		// Mock other tables if useArticleActions uses them
	},
}));

// Mock external services (EPUB, PDF, Parser) - Keep these
vi.mock("@/services/epub", () => ({
	extractEpubMetadata: vi
		.fn()
		.mockResolvedValue({ title: "Test EPUB", author: "Test Author" }),
	isValidEpub: vi.fn(),
	arrayBufferToBase64: vi.fn().mockReturnValue("mock-base64-epub"),
	getEstimatedReadingTime: vi.fn().mockReturnValue(60),
}));
vi.mock("@/services/pdf", () => ({
	extractPdfMetadata: vi.fn().mockResolvedValue({
		title: "Test PDF",
		author: "Test Author",
		pageCount: 20,
	}),
	isValidPdf: vi.fn(),
	arrayBufferToBase64: vi.fn().mockReturnValue("mock-base64-pdf"),
	getEstimatedReadingTime: vi.fn().mockReturnValue(40),
}));
vi.mock("@/services/parser", () => ({
	parseArticle: vi.fn(),
}));

// Mock toast hook - Keep
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock clerk auth - Keep (userId might be added to articles)
const mockGetTokenFn = vi.fn().mockResolvedValue("mock-test-token");
const mockUseAuthData = {
	userId: "test-user-id",
	isSignedIn: true,
	getToken: mockGetTokenFn,
};
vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => mockUseAuthData,
}));

// --- Import Mocks (for spy/assertions if needed) ---
// Note: We no longer import from '@/services/db' or '@/services/cloudSync'
import * as epubService from "@/services/epub";
import { parseArticle } from "@/services/parser";
import * as pdfService from "@/services/pdf";

// --- Test Setup ---
const refreshArticlesMock = vi.fn().mockResolvedValue(undefined); // Keep mock refresh function

// Helper to create base article data for tests (using _id)
const baseMockArticleData = (
	id: string,
	type: Article["type"],
): Partial<Article> => ({
	_id: id,
	url: `http://example.com/${id}`,
	title: `Article ${id}`,
	content: `Content ${id}`,
	savedAt: Date.now(),
	status: "inbox",
	isRead: false,
	favorite: false,
	type: type,
	userId: "test-user-id",
	excerpt: `Excerpt ${id}`,
	tags: [],
	version: 1, // Add default version
	// Add other required fields with default values if necessary
});

// --- Tests ---
describe("useArticleActions (Dexie)", () => {
	beforeEach(() => {
		// Clear all mocks
		vi.clearAllMocks();

		// Reset Dexie mock data and function calls
		mockDbData.length = 0; // Clear the hoisted array in place
		for (const mockFn of Object.values(mockArticlesTable)) {
			if (vi.isMockFunction(mockFn)) {
				mockFn.mockClear();
			} else if (typeof mockFn === "object" && mockFn !== null) {
				for (const nestedMock of Object.values(mockFn)) {
					if (vi.isMockFunction(nestedMock)) {
						nestedMock.mockClear();
					} else if (typeof nestedMock === "object" && nestedMock !== null) {
						for (const deepMock of Object.values(nestedMock)) {
							if (vi.isMockFunction(deepMock)) deepMock.mockClear();
							if (deepMock?.toArray && vi.isMockFunction(deepMock.toArray))
								deepMock.toArray.mockClear();
							if (deepMock?.equals && vi.isMockFunction(deepMock.equals))
								deepMock.equals.mockClear();
						}
					}
				}
			}
		}
		// Reset default implementations
		mockArticlesTable.toArray.mockImplementation(
			async () => structuredClone(mockDbData), // Use hoisted array
		);
		mockArticlesTable.get.mockImplementation(async (_id: string) => {
			const found = mockDbData.find((item) => item._id === _id); // Use hoisted array
			return Promise.resolve(found ? structuredClone(found) : undefined);
		});
		mockArticlesTable.where.mockImplementation((index: string) => ({
			equals: vi.fn((value: any) => ({
				toArray: vi.fn(async () => {
					const results = mockDbData.filter(
						// Use hoisted array
						(item) => item[index as keyof Article] === value,
					);
					return Promise.resolve(structuredClone(results));
				}),
			})),
		}));
		mockArticlesTable.put.mockImplementation(
			async (item: Article, key?: any) => {
				if (!item._id)
					throw new Error("Mock Dexie Error: Article must have an _id");
				const index = mockDbData.findIndex((dbItem) => dbItem._id === item._id); // Use hoisted array
				const newItem = structuredClone(item);
				if (index !== -1)
					mockDbData[index] = newItem; // Use hoisted array
				else mockDbData.push(newItem); // Use hoisted array
				return Promise.resolve(item._id);
			},
		);
		mockArticlesTable.delete.mockImplementation(async (_id: string) => {
			const initialLength = mockDbData.length; // Use hoisted array
			// Filter in place: Find index and splice
			const indexToRemove = mockDbData.findIndex((item) => item._id === _id); // Use hoisted array
			if (indexToRemove !== -1) {
				mockDbData.splice(indexToRemove, 1); // Modify hoisted array
			}
			return Promise.resolve(initialLength - mockDbData.length);
		});

		// Reset Clerk getToken mock
		mockGetTokenFn.mockClear().mockResolvedValue("mock-test-token");

		// Reset other service mocks
		vi.mocked(parseArticle).mockClear();
		vi.mocked(epubService.extractEpubMetadata)
			.mockClear()
			.mockResolvedValue({ title: "Test EPUB", author: "Test Author" });
		vi.mocked(epubService.isValidEpub).mockClear();
		vi.mocked(epubService.arrayBufferToBase64)
			.mockClear()
			.mockReturnValue("mock-base64-epub");
		vi.mocked(epubService.getEstimatedReadingTime)
			.mockClear()
			.mockReturnValue(60);
		vi.mocked(pdfService.extractPdfMetadata).mockClear().mockResolvedValue({
			title: "Test PDF",
			author: "Test Author",
			pageCount: 20,
		});
		vi.mocked(pdfService.isValidPdf).mockClear();
		vi.mocked(pdfService.arrayBufferToBase64)
			.mockClear()
			.mockReturnValue("mock-base64-pdf");
		vi.mocked(pdfService.getEstimatedReadingTime)
			.mockClear()
			.mockReturnValue(40);

		// Reset refresh mock
		refreshArticlesMock.mockClear();
	});

	afterEach(() => {
		cleanup();
	});

	it("should add PDF file via addArticleByFile", async () => {
		vi.mocked(pdfService.isValidPdf).mockReturnValue(true);
		vi.mocked(epubService.isValidEpub).mockReturnValue(false);
		const mockFile = new File(["mock content"], "test.pdf", {
			type: "application/pdf",
		});
		Object.defineProperty(mockFile, "arrayBuffer", {
			value: vi.fn().mockResolvedValue(new ArrayBuffer(1000)),
		});

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));

		let savedArticle: Article | null = null;
		await act(async () => {
			savedArticle = await result.current.addArticleByFile(mockFile);
		});

		// Assertions against Dexie mock
		expect(mockArticlesTable.put).toHaveBeenCalledTimes(1);
		const savedData = vi.mocked(mockArticlesTable.put).mock.calls[0][0];

		expect(savedData).toBeDefined();
		expect(savedData._id).toBeDefined(); // Dexie generates ID if not provided, hook might generate one
		expect(savedData.type).toBe("pdf");
		expect(savedData.fileName).toBe("test.pdf");
		expect(savedData.title).toBe("Test PDF"); // From metadata mock
		expect(savedData.author).toBe("Test Author"); // From metadata mock
		expect(savedData.fileSize).toBe(1000);
		expect(savedData.siteName).toBe("PDF Document"); // Default for PDF
		expect(savedData.estimatedReadTime).toBe(40); // From mock
		expect(savedData.userId).toBe("test-user-id");
		expect(savedData.fileData).toBe("mock-base64-pdf"); // From mock
		expect(savedData.pageCount).toBe(20); // From mock
		expect(savedArticle).toEqual(savedData); // Check return value matches saved data
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	it("should add EPUB file via addArticleByFile", async () => {
		vi.mocked(epubService.isValidEpub).mockReturnValue(true);
		vi.mocked(pdfService.isValidPdf).mockReturnValue(false);
		const mockFile = new File(["mock content"], "test.epub", {
			type: "application/epub+zip",
		});
		Object.defineProperty(mockFile, "arrayBuffer", {
			value: vi.fn().mockResolvedValue(new ArrayBuffer(2000)),
		});

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));

		let savedArticle: Article | null = null;
		await act(async () => {
			savedArticle = await result.current.addArticleByFile(mockFile);
		});

		expect(mockArticlesTable.put).toHaveBeenCalledTimes(1);
		const savedData = vi.mocked(mockArticlesTable.put).mock.calls[0][0];

		expect(savedData).toBeDefined();
		expect(savedData._id).toBeDefined();
		expect(savedData.type).toBe("epub");
		expect(savedData.fileName).toBe("test.epub");
		expect(savedData.title).toBe("Test EPUB"); // From metadata mock
		expect(savedData.author).toBe("Test Author"); // From metadata mock
		expect(savedData.fileSize).toBe(2000);
		expect(savedData.siteName).toBe("EPUB Document"); // Default for EPUB
		expect(savedData.estimatedReadTime).toBe(60); // From mock
		expect(savedData.userId).toBe("test-user-id");
		expect(savedData.fileData).toBe("mock-base64-epub"); // From mock
		expect(savedArticle).toEqual(savedData);
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	it("should add article by URL via addArticleByUrl", async () => {
		const mockParsedData: Partial<Article> = {
			// Use Partial as hook fills defaults
			title: "Test URL Article",
			content: "<p>URL Content</p>",
			excerpt: "URL Excerpt",
			author: "URL Author",
			siteName: "url-example.com",
			estimatedReadTime: 4,
			type: "article" as const,
			url: "https://url-example.com/test",
			version: 1,
		};
		vi.mocked(parseArticle).mockResolvedValue(mockParsedData as Article); // Cast for mock

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		const testUrl = "https://url-example.com/test";

		let savedArticle: Article | null = null;
		await act(async () => {
			savedArticle = await result.current.addArticleByUrl(testUrl);
		});

		expect(parseArticle).toHaveBeenCalledWith(testUrl);
		expect(mockArticlesTable.put).toHaveBeenCalledTimes(1);
		const savedData = vi.mocked(mockArticlesTable.put).mock.calls[0][0];

		expect(savedData).toBeDefined();
		expect(savedData._id).toBeDefined();
		expect(savedData.url).toBe(testUrl);
		expect(savedData.title).toBe(mockParsedData.title);
		expect(savedData.content).toBe(mockParsedData.content);
		expect(savedData.userId).toBe("test-user-id");
		expect(savedData.status).toBe("inbox"); // Check default status
		expect(savedData.isRead).toBe(false); // Check default
		expect(savedData.favorite).toBe(false); // Check default
		expect(savedData.tags).toEqual([]); // Check default
		expect(savedData.savedAt).toBeDefined(); // Check timestamp
		expect(savedArticle).toEqual(savedData);
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	it("should remove article via removeArticle", async () => {
		// Arrange: Add an article to the mock DB first
		const articleToDelete = baseMockArticleData("delete-me", "article");
		mockDbData.length = 0; // Clear hoisted array
		mockDbData.push(articleToDelete as Article); // Add to hoisted array

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));

		// Act
		await act(async () => {
			await result.current.removeArticle("delete-me");
		});

		// Assert
		expect(mockArticlesTable.delete).toHaveBeenCalledTimes(1);
		expect(mockArticlesTable.delete).toHaveBeenCalledWith("delete-me");
		expect(mockDbData.find((a) => a._id === "delete-me")).toBeUndefined(); // Check it's removed from hoisted mock data
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	it("should update article status via updateArticleStatus", async () => {
		// Renamed test
		// Arrange: Add an initial article
		const initialArticle = {
			...baseMockArticleData("update-me", "article"),
			title: "Initial Title",
			isRead: false,
			favorite: false,
			tags: [],
		} as Article;
		mockDbData.length = 0; // Clear hoisted array
		mockDbData.push(initialArticle); // Add to hoisted array

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));
		// Only update fields supported by updateArticleStatus
		const updates: Partial<Article> = {
			isRead: true,
			favorite: true,
			// title and tags cannot be updated via updateArticleStatus
		};

		// Act
		await act(async () => {
			// Call the correct function
			await result.current.updateArticleStatus("update-me", {
				isRead: updates.isRead,
				favorite: updates.favorite,
			});
		});

		// Assert
		expect(mockArticlesTable.put).toHaveBeenCalledTimes(1);
		const updatedData = vi.mocked(mockArticlesTable.put).mock.calls[0][0];

		// Assert only the fields updated by updateArticleStatus
		expect(updatedData._id).toBe("update-me");
		// expect(updatedData.title).toBe("Updated Title"); // Title not updated by this func
		expect(updatedData.isRead).toBe(true);
		expect(updatedData.favorite).toBe(true);
		// expect(updatedData.tags).toEqual(["tag1"]); // Tags not updated by this func
		// expect(updatedData.updatedAt).toBeGreaterThanOrEqual(initialArticle.savedAt); // updatedAt does not exist on Article type
		// Check other fields remain unchanged (example)
		expect(updatedData.content).toBe(initialArticle.content);

		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	// Keep tests checking token handling if actions still involve optional cloud interaction
	// If cloud sync is completely removed from useArticleActions, these tests can be removed.
	it("should NOT attempt cloud sync if getToken returns null (example: add URL)", async () => {
		mockGetTokenFn.mockResolvedValueOnce(null); // Mock getToken returning null
		const mockParsedData: Partial<Article> = {
			title: "No Token Test",
			url: "http://no.token",
			type: "article",
			content: "c",
		};
		vi.mocked(parseArticle).mockResolvedValue(mockParsedData as Article);

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));

		await act(async () => {
			await result.current.addArticleByUrl("http://no.token");
		});

		expect(mockArticlesTable.put).toHaveBeenCalledTimes(1); // Local save should still happen
		expect(mockGetTokenFn).toHaveBeenCalledTimes(1);
		// Remove assertions for saveItemToCloud
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});

	it("should NOT attempt cloud sync if getToken returns null (example: remove article)", async () => {
		mockGetTokenFn.mockResolvedValueOnce(null);
		const articleToDelete = baseMockArticleData("delete-no-token", "article");
		mockDbData.length = 0; // Clear hoisted array
		mockDbData.push(articleToDelete as Article); // Add to hoisted array

		const { result } = renderHook(() => useArticleActions(refreshArticlesMock));

		await act(async () => {
			await result.current.removeArticle("delete-no-token");
		});

		expect(mockArticlesTable.delete).toHaveBeenCalledWith("delete-no-token"); // Local delete should happen
		expect(mockGetTokenFn).toHaveBeenCalledTimes(1);
		// Remove assertions for deleteItemFromCloud
		expect(refreshArticlesMock).toHaveBeenCalledTimes(1);
	});
});
