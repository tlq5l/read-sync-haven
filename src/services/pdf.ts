/**
 * PDF parsing utilities
 * Provides functions to extract metadata from PDF files
 */

// Helper function to convert ArrayBuffer to Base64
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

// Helper function to convert Base64 to ArrayBuffer with error handling
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
	try {
		// Remove any data URL prefix if present
		const base64Data = base64.replace(/^data:[^;]+;base64,/, "");

		// Decode base64 to binary string
		const binaryString = atob(base64Data);
		const len = binaryString.length;

		// Create array buffer and view
		const bytes = new Uint8Array(len);

		// Fill array buffer
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		return bytes.buffer;
	} catch (error) {
		console.error("Error converting base64 to ArrayBuffer:", error);
		throw new Error("Failed to convert PDF data. The file might be corrupted.");
	}
}

// Interface for PDF metadata
export interface PdfMetadata {
	title: string;
	author?: string;
	pageCount?: number;
	description?: string;
	language?: string;
	publishedDate?: string;
}

// Extract basic metadata from a PDF file
// Note: This is a simple implementation that extracts basic info from the filename
// In a real implementation, you might use a PDF.js or similar library to extract actual metadata
export async function extractPdfMetadata(
	file: File,
	_fileBuffer: ArrayBuffer, // Renamed to indicate it's unused
): Promise<PdfMetadata> {
	try {
		// For now, we'll just extract basic info from the filename
		// In a real implementation, you would use PDF.js to parse the PDF and extract metadata
		const fileName = file.name;
		const title = fileName.replace(/\.pdf$/i, "");

		// Estimate page count based on file size
		// This is a very rough estimate - 100KB per page
		const pageCount = Math.max(1, Math.floor(file.size / 100000));

		return {
			title: title,
			author: "Unknown",
			pageCount: pageCount,
			description: `PDF Document: ${title}`,
			language: "en",
		};
	} catch (error) {
		console.error("Error extracting PDF metadata:", error);
		// Return minimal metadata if extraction fails
		return {
			title: file.name.replace(/\.pdf$/i, ""),
			author: "Unknown",
			description: "No description available",
			language: "en",
		};
	}
}

// Function to validate if a file is a valid PDF
export function isValidPdf(file: File): boolean {
	// Check file extension
	const extension = file.name.split(".").pop()?.toLowerCase();
	if (extension !== "pdf") {
		return false;
	}

	// Check MIME type if available
	if (file.type && !file.type.includes("application/pdf")) {
		// Some browsers may not report the correct MIME type for PDF files
		// So we'll be lenient here and rely more on the extension
		console.warn("File has .pdf extension but mime type is:", file.type);
	}

	return true;
}

// Get estimated reading time for a PDF document
export function getEstimatedReadingTime(
	fileSize: number,
	pageCount?: number,
): number {
	if (pageCount) {
		// Average reading speed is about 2 minutes per page
		return Math.max(1, pageCount * 2);
	}
	
	// Estimate page count based on file size (100KB per page)
	// and then calculate reading time
	const estimatedPages = Math.max(1, Math.floor(fileSize / 100000));
	return Math.max(1, estimatedPages * 2);
}
