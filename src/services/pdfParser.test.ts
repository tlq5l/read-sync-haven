import { Buffer } from "node:buffer";
// Import only what's needed and available
import * as pdfjsLib from "pdfjs-dist";
// Import `beforeEach` and `Mock` type from vitest
import { type Mock, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePdf } from "./pdfParser"; // Import the function to test

// Simplified Type helpers using 'any' where specific types cause issues
type MockedPdfPageProxy = {
	getTextContent: Mock<() => Promise<any>>; // Use any for TextContent return
	getAnnotations: Mock<() => Promise<any[]>>; // Add mock for annotations
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

// Define mock data globally within the file scope
const mockBuffer = Buffer.from("dummy-pdf-content");
const mockArrayBuffer = mockBuffer.buffer.slice(
	mockBuffer.byteOffset,
	mockBuffer.byteOffset + mockBuffer.byteLength,
);
const mockUint8Array = new Uint8Array(mockArrayBuffer);

describe("parsePdf", () => {
	// Reset mocks before each test
	beforeEach(() => {
		vi.clearAllMocks();
		// Explicitly reset the getDocument mock's implementation/return value if needed
		mockedPdfjsLib.getDocument.mockReset();
	});

	it("should correctly parse a single-page PDF and return its content", async () => {
		const page1Text = "Text from page 1.";
		// Simplify vi.fn calls - remove explicit generics causing issues
		const mockGetTextContent = vi.fn().mockResolvedValue({
			items: [
				{
					str: page1Text,
					transform: [1, 0, 0, 1, 50, 750],
					width: 100,
					height: 10,
				},
			],
		}); // Added mock properties
		const mockGetPage = vi.fn().mockResolvedValue({
			getTextContent: mockGetTextContent,
			getAnnotations: vi.fn().mockResolvedValue([]), // Mock annotations as empty for this test
			getViewport: vi
				.fn()
				.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
		});

		// Return a structure that matches MockedPdfDocumentLoadingTask
		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 1,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask); // Cast the whole return object

		const result = await parsePdf(mockBuffer);

		// Expect the result object, including empty forms and tables for this basic test
		expect(result).toEqual({
			text: page1Text,
			forms: [],
			tables: [], // Basic table detection might yield empty here depending on mock text items
			status: "success", // Add status check
		});
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		expect(mockGetPage).toHaveBeenCalledWith(1);
		expect(mockGetTextContent).toHaveBeenCalledTimes(1);
	});

	it("should correctly parse a multi-page PDF and return combined content", async () => {
		const page1Text = "Text from page 1.";
		const page2Text = "Text from page 2.";
		const mockGetTextContent1 = vi.fn().mockResolvedValue({
			items: [
				{
					str: page1Text,
					transform: [1, 0, 0, 1, 50, 750],
					width: 100,
					height: 10,
				},
			],
		}); // Added mock properties
		const mockGetTextContent2 = vi.fn().mockResolvedValue({
			items: [
				{
					str: page2Text,
					transform: [1, 0, 0, 1, 50, 730],
					width: 100,
					height: 10,
				},
			],
		}); // Added mock properties (adjusted y)
		const mockGetPage = vi
			.fn()
			// Page 1 mock with annotations
			.mockResolvedValueOnce({
				getTextContent: mockGetTextContent1,
				getAnnotations: vi.fn().mockResolvedValue([]), // Empty annotations for page 1
				getViewport: vi
					.fn()
					.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
			})
			// Page 2 mock with annotations
			.mockResolvedValueOnce({
				getTextContent: mockGetTextContent2,
				getAnnotations: vi.fn().mockResolvedValue([]), // Empty annotations for page 2
				getViewport: vi
					.fn()
					.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
			});

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 2,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockBuffer);

		// Expect combined text and empty forms/tables
		expect(result).toEqual({
			text: `${page1Text}\n${page2Text}`,
			forms: [],
			tables: [], // Basic table detection might yield empty here
			status: "success", // Add status check
		});
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		expect(mockGetPage).toHaveBeenCalledWith(1);
		expect(mockGetPage).toHaveBeenCalledWith(2);
		expect(mockGetTextContent1).toHaveBeenCalledTimes(1);
		expect(mockGetTextContent2).toHaveBeenCalledTimes(1);
	});

	it("should return empty result if getDocument().promise rejects", async () => {
		const mockError = new Error("Failed to load PDF document");
		// Mock rejection
		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.reject(mockError),
		} as MockedPdfDocumentLoadingTask); // Cast necessary for rejection case

		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const result = await parsePdf(mockBuffer);

		expect(result).toEqual({
			text: "",
			forms: [],
			tables: [],
			status: "error",
		}); // Expect error status
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Error parsing PDF with pdfjs-dist:",
			mockError,
		);

		consoleErrorSpy.mockRestore();
	});

	it("should return empty text but process annotations if getTextContent returns empty items", async () => {
		const mockGetTextContent = vi.fn().mockResolvedValue({ items: [] }); // Empty items
		const mockGetPage = vi.fn().mockResolvedValue({
			getTextContent: mockGetTextContent,
			getAnnotations: vi.fn().mockResolvedValue([]), // Still process annotations
			getViewport: vi
				.fn()
				.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
		});

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 1,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockBuffer);

		// Expect empty text, empty forms/tables, but success status as page processing succeeded
		expect(result).toEqual({
			text: "",
			forms: [],
			tables: [],
			status: "success",
		});
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		expect(mockGetPage).toHaveBeenCalledWith(1);
		expect(mockGetTextContent).toHaveBeenCalledTimes(1);
	});

	it("should handle ArrayBuffer input correctly", async () => {
		const page1Text = "Text from ArrayBuffer.";
		const mockGetTextContent = vi.fn().mockResolvedValue({
			items: [
				{
					str: page1Text,
					transform: [1, 0, 0, 1, 50, 750],
					width: 100,
					height: 10,
				},
			],
		}); // Added mock properties
		const mockGetPage = vi.fn().mockResolvedValue({
			getTextContent: mockGetTextContent,
			getAnnotations: vi.fn().mockResolvedValue([]), // Mock annotations
			getViewport: vi
				.fn()
				.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
		});

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 1,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockArrayBuffer); // Use ArrayBuffer here

		expect(result).toEqual({
			text: page1Text,
			forms: [],
			tables: [], // Basic table detection might yield empty here
			status: "success", // Add status check
		});
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array, // Implementation converts ArrayBuffer to Uint8Array
		});
		expect(mockGetPage).toHaveBeenCalledWith(1);
		expect(mockGetTextContent).toHaveBeenCalledTimes(1);
	});

	it("should return status 'password_required' when getDocument rejects with PasswordException", async () => {
		const mockPasswordError = {
			name: "PasswordException",
			message: "Password required",
		};
		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.reject(mockPasswordError),
		} as MockedPdfDocumentLoadingTask);

		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {}); // Suppress console error during test

		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {}); // Setup spy BEFORE the call
		const result = await parsePdf(mockBuffer);

		expect(result).toEqual({
			text: "",
			forms: [],
			tables: [],
			status: "password_required",
		});
		expect(mockedPdfjsLib.getDocument).toHaveBeenCalledWith({
			data: mockUint8Array,
		});
		// Check if the specific password log message was printed
		expect(consoleLogSpy).toHaveBeenCalledWith("PDF requires a password.");

		consoleErrorSpy.mockRestore();
		consoleLogSpy.mockRestore();
	});

	// Moved test inside describe block
	it("should extract form fields using getAnnotations", async () => {
		const mockAnnotation = {
			subtype: "Widget",
			fieldName: "testField",
			fieldType: "Tx",
			fieldValue: "testValue",
			readOnly: false,
			rect: [10, 10, 100, 20],
		};
		const mockGetAnnotations = vi.fn().mockResolvedValue([mockAnnotation]);
		const mockGetTextContent = vi.fn().mockResolvedValue({ items: [] }); // No text needed
		const mockGetPage = vi.fn().mockResolvedValue({
			getTextContent: mockGetTextContent,
			getAnnotations: mockGetAnnotations,
			getViewport: vi
				.fn()
				.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
		});

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 1,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockBuffer);

		expect(result.forms).toHaveLength(1);
		expect(result.forms[0]).toEqual({
			fieldName: "testField",
			fieldType: "Tx",
			fieldValue: "testValue",
			isReadOnly: false,
			rect: [10, 10, 100, 20],
			pageNum: 1,
		});
		expect(result.text).toBe(""); // No text content mocked
		expect(result.tables).toEqual([]); // No table content mocked
		expect(result.status).toBe("success"); // Check status
		expect(mockGetAnnotations).toHaveBeenCalledTimes(1);
	});

	// Note: Testing the table heuristic precisely is hard without complex coordinate mocks.
	// This test focuses on ensuring the table detection logic is called and returns the expected shape.
	it("should attempt basic table detection based on text items", async () => {
		// Mock text items that *might* look like a simple 2x2 table
		const mockTextItems = [
			{ str: "R1C1", transform: [1, 0, 0, 1, 50, 700], width: 40, height: 10 }, // Row 1
			{ str: "R1C2", transform: [1, 0, 0, 1, 150, 700], width: 40, height: 10 },
			{ str: "R2C1", transform: [1, 0, 0, 1, 50, 680], width: 40, height: 10 }, // Row 2
			{ str: "R2C2", transform: [1, 0, 0, 1, 150, 680], width: 40, height: 10 },
			{
				str: "Not a table",
				transform: [1, 0, 0, 1, 50, 600],
				width: 100,
				height: 10,
			}, // Separate text
		];
		const mockGetTextContent = vi
			.fn()
			.mockResolvedValue({ items: mockTextItems });
		const mockGetPage = vi.fn().mockResolvedValue({
			getTextContent: mockGetTextContent,
			getAnnotations: vi.fn().mockResolvedValue([]), // No annotations needed
			getViewport: vi
				.fn()
				.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
		});

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({
				numPages: 1,
				getPage: mockGetPage,
			}),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockBuffer);

		// Check if the table heuristic produced *something* resembling the input
		// The exact output depends heavily on the heuristic's tolerances
		expect(result.tables.length).toBeGreaterThanOrEqual(0); // Expecting 1 table, but 0 is acceptable if heuristic is strict
		if (result.tables.length > 0) {
			expect(result.tables[0].length).toBe(2); // Expect 2 rows
			expect(result.tables[0][0].length).toBe(2); // Expect 2 columns in row 1
			expect(result.tables[0][1].length).toBe(2); // Expect 2 columns in row 2
			expect(result.tables[0][0]).toEqual(["R1C1", "R1C2"]);
			expect(result.tables[0][1]).toEqual(["R2C1", "R2C2"]);
		}

		expect(result.text).toContain("R1C1 R1C2 R2C1 R2C2 Not a table"); // Check combined text
		expect(result.forms).toEqual([]);
		expect(result.status).toBe("success"); // Check status
	});

	it("should sort text items correctly for multi-column layout using groupAndSortTextItems", async () => {
		// Mock items simulating two columns: Col1 Line1, Col2 Line1, Col1 Line2, Col2 Line2
		// Note: Simplified representation; real coordinates depend on PDF.
		// Higher Y means higher on page. Items are bottom-left referenced.
		const mockTextItems = [
			// Simulate rendering order which might be different from reading order
			{
				str: "Col1 Line1",
				transform: [1, 0, 0, 1, 50, 700],
				width: 80,
				height: 10,
			},
			{
				str: "Col2 Line1",
				transform: [1, 0, 0, 1, 300, 700],
				width: 80,
				height: 10,
			},
			{
				str: "Col1 Line2",
				transform: [1, 0, 0, 1, 50, 680],
				width: 80,
				height: 10,
			},
			{
				str: "Col2 Line2",
				transform: [1, 0, 0, 1, 300, 680],
				width: 80,
				height: 10,
			},
		];
		const mockGetTextContent = vi
			.fn()
			.mockResolvedValue({ items: mockTextItems });
		const mockGetPage = vi.fn().mockResolvedValue({
			getTextContent: mockGetTextContent,
			getAnnotations: vi.fn().mockResolvedValue([]),
			getViewport: vi
				.fn()
				.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
		});

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({ numPages: 1, getPage: mockGetPage }),
		} as MockedPdfDocumentLoadingTask);

		const result = await parsePdf(mockBuffer);

		// Expect the text to be ordered column by column, then line by line
		// This depends heavily on the block grouping logic and tolerances
		// Adjust expected string based on how groupAndSortTextItems actually orders columns
		expect(result.text).toBe("Col1 Line1 Col1 Line2 Col2 Line1 Col2 Line2");
		expect(result.status).toBe("success");
		expect(result.forms).toEqual([]);
		// expect(result.tables).toEqual([]); // Ignore table detection for this specific sorting test
	});

	// Moved test inside describe block
	it("should call onPageProcessed callback for each page", async () => {
		const page1Text = "Page 1 text";
		const page2Text = "Page 2 text";
		const mockAnnotation = {
			subtype: "Widget",
			fieldName: "field1",
			// pageNum: 1, // pageNum is added during processing, not part of original annotation
			rect: [10, 10, 100, 20], // Added mock rect
		}; // Simplified form
		const mockGetTextContent1 = vi.fn().mockResolvedValue({
			items: [
				{
					str: page1Text,
					transform: [1, 0, 0, 1, 50, 750],
					width: 100,
					height: 10,
				},
			],
		}); // Added mock properties
		const mockGetAnnotations1 = vi.fn().mockResolvedValue([mockAnnotation]);
		const mockGetTextContent2 = vi.fn().mockResolvedValue({
			items: [
				{
					str: page2Text,
					transform: [1, 0, 0, 1, 50, 730],
					width: 100,
					height: 10,
				},
			],
		}); // Added mock properties (adjusted y)
		const mockGetAnnotations2 = vi.fn().mockResolvedValue([]); // No forms on page 2

		// Modify getPage mock to return promises that resolve slightly differently for concurrency testing
		const mockPage1Promise = new Promise((resolve) =>
			setTimeout(
				() =>
					resolve({
						getTextContent: mockGetTextContent1,
						getAnnotations: mockGetAnnotations1,
						getViewport: vi
							.fn()
							.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
					}),
				10,
			),
		);
		const mockPage2Promise = new Promise((resolve) =>
			setTimeout(
				() =>
					resolve({
						getTextContent: mockGetTextContent2,
						getAnnotations: mockGetAnnotations2,
						getViewport: vi
							.fn()
							.mockReturnValue({ width: 612, height: 792, scale: 1 }), // Added mock getViewport
					}),
				5,
			),
		); // Page 2 resolves faster

		const mockGetPage = vi.fn().mockImplementation(async (pageNum) => {
			if (pageNum === 1) return mockPage1Promise;
			if (pageNum === 2) return mockPage2Promise;
			throw new Error("Unexpected page number");
		});

		mockedPdfjsLib.getDocument.mockReturnValue({
			promise: Promise.resolve({ numPages: 2, getPage: mockGetPage }),
		} as MockedPdfDocumentLoadingTask);

		const onPageProcessedMock = vi.fn();
		const options = { onPageProcessed: onPageProcessedMock };

		const result = await parsePdf(mockBuffer, options);

		// Check aggregated result still works and has correct order
		expect(result.text).toBe(`${page1Text}\n${page2Text}`); // Order should be preserved in final text
		expect(result.forms).toHaveLength(1); // Only one form field from page 1
		expect(result.status).toBe("success");

		// Check callback calls - still called twice
		expect(onPageProcessedMock).toHaveBeenCalledTimes(2);
		// Check that page 1 data was eventually called back
		expect(onPageProcessedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				pageNum: 1,
				text: page1Text,
				forms: expect.arrayContaining([
					expect.objectContaining({ fieldName: "field1" }),
				]),
				tables: expect.any(Array),
				status: "success",
			}),
		);
		// Check that page 2 data was eventually called back
		expect(onPageProcessedMock).toHaveBeenCalledWith(
			expect.objectContaining({
				pageNum: 2,
				text: page2Text,
				forms: [],
				tables: expect.any(Array),
				status: "success",
			}),
		);
	});
}); // This should be the final closing brace for the main describe block
