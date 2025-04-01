/// <reference types="@testing-library/jest-dom" />

import { updateMissingMetadata } from "./migrations";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the articlesDb
vi.mock("./config", () => ({
	articlesDb: {
		allDocs: vi.fn(),
		bulkDocs: vi.fn(),
	},
}));

// Mock the executeWithRetry utility
vi.mock("./utils", () => ({
	executeWithRetry: vi.fn((fn) => fn()), // Just execute the function directly
}));

// Mock PDF and EPUB reading time calculators
vi.mock("@/services/pdf", () => ({
	getEstimatedReadingTime: vi.fn().mockReturnValue(40),
}));

vi.mock("@/services/epub", () => ({
	getEstimatedReadingTime: vi.fn().mockReturnValue(60),
}));

// Import the mocked modules
import { articlesDb } from "./config";
import * as pdfService from "@/services/pdf";
import * as epubService from "@/services/epub";

describe("Database migrations", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should update PDF files missing metadata", async () => {
		// Mock a PDF document missing siteName and estimatedReadTime
		const mockPdfDoc = {
			_id: "article_pdf1",
			_rev: "1-abc123",
			title: "Test PDF",
			content: "test content",
			url: "local-pdf://test.pdf",
			type: "pdf",
			savedAt: Date.now(),
			isRead: false,
			favorite: false,
			tags: [],
			fileSize: 1000000, // 1MB
			pageCount: 20,
		};

		// Setup the mock response
		vi.mocked(articlesDb.allDocs).mockResolvedValue({
			rows: [{ doc: mockPdfDoc }],
		} as any);

		vi.mocked(articlesDb.bulkDocs).mockResolvedValue([
			{ ok: true, id: "article_pdf1", rev: "2-xyz456" },
		] as any);

		// Run the migration
		const updatedCount = await updateMissingMetadata();

		// Verify the results
		expect(updatedCount).toBe(1);
		expect(articlesDb.allDocs).toHaveBeenCalledTimes(1);
		expect(articlesDb.bulkDocs).toHaveBeenCalledTimes(1);

		// Verify the correct data was submitted to bulkDocs
		const bulkDocsArg = vi.mocked(articlesDb.bulkDocs).mock.calls[0][0];
		expect(bulkDocsArg).toHaveLength(1);
		expect(bulkDocsArg[0]).toMatchObject({
			_id: "article_pdf1",
			_rev: "1-abc123",
			type: "pdf",
			siteName: "PDF Document",
			estimatedReadTime: 40, // From our mock PDF service
		});

		// Verify the PDF reading time estimator was called with the right params
		expect(pdfService.getEstimatedReadingTime).toHaveBeenCalledWith(
			1000000,
			20,
		);
	});

	it("should update EPUB files missing metadata", async () => {
		// Mock an EPUB document missing siteName and estimatedReadTime
		const mockEpubDoc = {
			_id: "article_epub1",
			_rev: "1-def456",
			title: "Test EPUB",
			content: "test content",
			url: "local-epub://test.epub",
			type: "epub",
			savedAt: Date.now(),
			isRead: false,
			favorite: false,
			tags: [],
			fileSize: 2000000, // 2MB
		};

		// Setup the mock response
		vi.mocked(articlesDb.allDocs).mockResolvedValue({
			rows: [{ doc: mockEpubDoc }],
		} as any);

		vi.mocked(articlesDb.bulkDocs).mockResolvedValue([
			{ ok: true, id: "article_epub1", rev: "2-ghi789" },
		] as any);

		// Run the migration
		const updatedCount = await updateMissingMetadata();

		// Verify the results
		expect(updatedCount).toBe(1);
		expect(articlesDb.allDocs).toHaveBeenCalledTimes(1);
		expect(articlesDb.bulkDocs).toHaveBeenCalledTimes(1);

		// Verify the correct data was submitted to bulkDocs
		const bulkDocsArg = vi.mocked(articlesDb.bulkDocs).mock.calls[0][0];
		expect(bulkDocsArg).toHaveLength(1);
		expect(bulkDocsArg[0]).toMatchObject({
			_id: "article_epub1",
			_rev: "1-def456",
			type: "epub",
			siteName: "EPUB Book",
			estimatedReadTime: 60, // From our mock EPUB service
		});

		// Verify the EPUB reading time estimator was called with the right params
		expect(epubService.getEstimatedReadingTime).toHaveBeenCalledWith(2000000);
	});

	it("should not update documents that already have metadata", async () => {
		// Mock a PDF that already has metadata
		const mockCompleteDoc = {
			_id: "article_complete1",
			_rev: "1-jkl012",
			title: "Complete PDF",
			content: "test content",
			url: "local-pdf://complete.pdf",
			type: "pdf",
			savedAt: Date.now(),
			isRead: false,
			favorite: false,
			tags: [],
			siteName: "Already Set PDF",
			estimatedReadTime: 30,
		};

		// Setup the mock response
		vi.mocked(articlesDb.allDocs).mockResolvedValue({
			rows: [{ doc: mockCompleteDoc }],
		} as any);

		// Run the migration
		const updatedCount = await updateMissingMetadata();

		// Verify no updates were made
		expect(updatedCount).toBe(0);
		expect(articlesDb.allDocs).toHaveBeenCalledTimes(1);
		expect(articlesDb.bulkDocs).not.toHaveBeenCalled();
	});

	it("should handle errors gracefully", async () => {
		// Mock an error in bulkDocs
		vi.mocked(articlesDb.allDocs).mockResolvedValue({
			rows: [
				{
					doc: {
						_id: "article_error1",
						_rev: "1-mno345",
						type: "pdf",
						content: "test content",
						url: "local-pdf://error.pdf",
						savedAt: Date.now(),
						isRead: false,
						favorite: false,
						tags: [],
					},
				},
			],
		} as any);

		vi.mocked(articlesDb.bulkDocs).mockResolvedValue([
			{ error: true, id: "article_error1", reason: "test error" },
		] as any);

		// Expect the function to throw an error
		await expect(updateMissingMetadata()).rejects.toThrow();

		// Verify the database calls
		expect(articlesDb.allDocs).toHaveBeenCalledTimes(1);
		expect(articlesDb.bulkDocs).toHaveBeenCalledTimes(1);
	});
});
