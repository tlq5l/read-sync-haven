import { Buffer } from "node:buffer";
// Import only what's needed and available
import * as pdfjsLib from "pdfjs-dist";
// Import `beforeEach` and `Mock` type from vitest
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePdf } from "./pdfParser"; // Import the function to test

// Simplified Type helpers using 'any' where specific types cause issues
type MockedPdfPageProxy = {
	getTextContent: Mock<() => Promise<any>>; // Use any for TextContent return
};
type MockedPdfDocumentProxy = {
	numPages: number;
	getPage: Mock<(pageNumber: number) => Promise<any>>; // Use any for PageProxy return
};
type MockedPdfDocumentLoadingTask = {
	promise: Promise<MockedPdfDocumentProxy>;
};

// Define the type for the mocked pdfjsLib object itself
type MockedPdfjsLib = {
	getDocument: Mock<(src: any) => MockedPdfDocumentLoadingTask>; // Use any for src
	GlobalWorkerOptions: { workerSrc: string };
};

// Mock the pdfjs-dist library
vi.mock("pdfjs-dist", async (importOriginal) => {
	const original = await importOriginal<typeof pdfjsLib>();
	return {
		getDocument: vi.fn(),
		GlobalWorkerOptions: (original as any).GlobalWorkerOptions || {
			workerSrc: "",
		},
	};
});

// Cast the mocked library using 'unknown' first
const mockedPdfjsLib = pdfjsLib as unknown as MockedPdfjsLib;

describe("parsePdf", () => {
	const mockBuffer = Buffer.from("dummy-pdf-content");
	const mockArrayBuffer = mockBuffer.buffer.slice(
		mockBuffer.byteOffset,
		mockBuffer.byteOffset + mockBuffer.byteLength,
	);
	const mockUint8Array = new Uint8Array(mockArrayBuffer);

	// Reset mocks before each test
	beforeEach(() => {
		vi.clearAllMocks();
		// Explicitly reset the getDocument mock's implementation/return value if needed
		mockedPdfjsLib.getDocument.mockReset();
	});

	it("should correctly parse a single-page PDF and return its text", async () => {
		const page1Text = "Text from page 1.";
		// Simplify vi.fn calls - remove explicit generics causing issues
		const mockGetTextContent = vi
			.fn()
			.mockResolvedValue({ items: [{ str: page1Text }] }); // Simple structure
		const mockGetPage = vi.fn().mockResolvedValue({
			getTextContent: mockGetTextContent,
		});

		// Return a structure that matches MockedPdfDocumentLoadingTask
		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 1,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask); // Cast the whole return object

		const result = await parsePdf(mockBuffer);

		expect(result).toBe(page1Text);
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		expect(mockGetPage).toHaveBeenCalledWith(1);
		expect(mockGetTextContent).toHaveBeenCalledTimes(1);
	});

	it("should correctly parse a multi-page PDF and return combined text", async () => {
		const page1Text = "Text from page 1.";
		const page2Text = "Text from page 2.";
		const mockGetTextContent1 = vi
			.fn()
			.mockResolvedValue({ items: [{ str: page1Text }] });
		const mockGetTextContent2 = vi
			.fn()
			.mockResolvedValue({ items: [{ str: page2Text }] });
		const mockGetPage = vi
			.fn()
			.mockResolvedValueOnce({ getTextContent: mockGetTextContent1 }) // Page 1
			.mockResolvedValueOnce({ getTextContent: mockGetTextContent2 }); // Page 2

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 2,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockBuffer);

		expect(result).toBe(`${page1Text}\n${page2Text}`);
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		expect(mockGetPage).toHaveBeenCalledWith(1);
		expect(mockGetPage).toHaveBeenCalledWith(2);
		expect(mockGetTextContent1).toHaveBeenCalledTimes(1);
		expect(mockGetTextContent2).toHaveBeenCalledTimes(1);
	});

	it("should return an empty string if getDocument().promise rejects", async () => {
		const mockError = new Error("Failed to load PDF document");
		// Mock rejection
		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.reject(mockError),
		} as MockedPdfDocumentLoadingTask); // Cast necessary for rejection case

		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const result = await parsePdf(mockBuffer);

		expect(result).toBe("");
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Error parsing PDF with pdfjs-dist:",
			mockError,
		);

		consoleErrorSpy.mockRestore();
	});

	it("should return an empty string if getTextContent returns empty items", async () => {
		const mockGetTextContent = vi.fn().mockResolvedValue({ items: [] }); // Empty items
		const mockGetPage = vi
			.fn()
			.mockResolvedValue({ getTextContent: mockGetTextContent });

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 1,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockBuffer);

		expect(result).toBe("");
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		expect(mockGetPage).toHaveBeenCalledWith(1);
		expect(mockGetTextContent).toHaveBeenCalledTimes(1);
	});

	it("should handle ArrayBuffer input correctly", async () => {
		const page1Text = "Text from ArrayBuffer.";
		const mockGetTextContent = vi
			.fn()
			.mockResolvedValue({ items: [{ str: page1Text }] });
		const mockGetPage = vi
			.fn()
			.mockResolvedValue({ getTextContent: mockGetTextContent });

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 1,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockArrayBuffer); // Use ArrayBuffer here

		expect(result).toBe(page1Text);
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array, // Implementation converts ArrayBuffer to Uint8Array
		});
		expect(mockGetPage).toHaveBeenCalledWith(1);
		expect(mockGetTextContent).toHaveBeenCalledTimes(1);
	});
});
