import { Buffer } from "node:buffer";
import pdfParse from "pdf-parse"; // Import to mock
import { type MockedFunction, describe, expect, it, vi } from "vitest"; // Import MockedFunction type
import { parsePdf } from "./pdfParser"; // Import the function to test

// Mock the pdf-parse library
// Mock pdf-parse with an explicit factory returning a mock function
vi.mock("pdf-parse", () => ({
	// Return an object where the 'default' export is a mock function
	default: vi.fn(),
}));

describe("parsePdf", () => {
	it("should correctly parse a valid PDF buffer and return its text", async () => {
		const mockText = "This is sample PDF text.";
		const mockBuffer = Buffer.from("dummy-pdf-content");
		// Cast the mocked default export to the correct type for mocking
		const mockedPdfParse = pdfParse as MockedFunction<typeof pdfParse>;

		// Configure the mock to resolve successfully
		mockedPdfParse.mockResolvedValue({
			numpages: 1,
			numrender: 1,
			info: {}, // Add minimal required info if needed by types
			metadata: null, // Add minimal required metadata if needed by types
			text: mockText,
			version: "v1.10.100", // Correct version format with 'v' prefix
		});

		const result = await parsePdf(mockBuffer);

		expect(result).toBe(mockText);
		expect(mockedPdfParse).toHaveBeenCalledWith(mockBuffer);
	});

	it("should return an empty string if pdf-parse throws an error", async () => {
		const mockError = new Error("Failed to parse PDF");
		const mockBuffer = Buffer.from("invalid-pdf-content");
		const mockedPdfParse = pdfParse as MockedFunction<typeof pdfParse>;

		// Configure the mock to reject with an error
		mockedPdfParse.mockRejectedValue(mockError);

		// Spy on console.error to ensure it's called
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const result = await parsePdf(mockBuffer);

		expect(result).toBe("");
		expect(mockedPdfParse).toHaveBeenCalledWith(mockBuffer);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Error parsing PDF:",
			mockError,
		);

		// Restore the original console.error
		consoleErrorSpy.mockRestore();
	});

	it("should return an empty string if the parsed PDF text is empty", async () => {
		const mockBuffer = Buffer.from("empty-pdf-content");
		const mockedPdfParse = pdfParse as MockedFunction<typeof pdfParse>;

		// Configure the mock to resolve with empty text
		mockedPdfParse.mockResolvedValue({
			numpages: 1,
			numrender: 1,
			info: {},
			metadata: null,
			text: "", // Empty text
			version: "v1.10.100", // Correct version format with 'v' prefix
		});

		const result = await parsePdf(mockBuffer);

		expect(result).toBe("");
		expect(mockedPdfParse).toHaveBeenCalledWith(mockBuffer);
	});
});
