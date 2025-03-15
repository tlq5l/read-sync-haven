/**
 * EPUB parsing utilities
 * Provides functions to extract metadata from EPUB files
 */
import ePub from "epubjs";

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

// Helper function to convert Base64 to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const len = binaryString.length;
	const bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

// Interface for EPUB metadata
export interface EpubMetadata {
	title: string;
	author?: string;
	publisher?: string;
	description?: string;
	cover?: string; // Base64 encoded cover image
	language?: string;
	publishedDate?: string;
}

// Extract metadata from an EPUB file
export async function extractEpubMetadata(
	fileBuffer: ArrayBuffer,
): Promise<EpubMetadata> {
	try {
		// Create a new Book object from epub.js
		const book = ePub(fileBuffer);

		// Wait for the book to be ready
		await book.ready;

		// Extract metadata
		const metadata = book.package.metadata;

		// Extract cover if available
		let coverUrl: string | undefined;
		try {
			coverUrl = await book.coverUrl();
		} catch (e) {
			console.warn("Could not extract cover from EPUB:", e);
		}

		// Return the metadata
		const result: EpubMetadata = {
			title: metadata.title || "Unknown Title",
			author: metadata.creator || "Unknown Author",
			publisher: metadata.publisher,
			description: metadata.description,
			language: metadata.language,
			publishedDate: metadata.published_date || metadata.modified_date,
		};

		// Add cover if available
		if (coverUrl) {
			result.cover = coverUrl;
		}

		// Properly destroy the book instance to free up resources
		book.destroy();

		return result;
	} catch (error) {
		console.error("Error extracting EPUB metadata:", error);
		// Return minimal metadata if extraction fails
		return {
			title: "Unknown Title",
			author: "Unknown Author",
			description: "No description available",
			language: "en",
		};
	}
}

// Function to validate if a file is a valid EPUB
export function isValidEpub(file: File): boolean {
	// Check file extension
	const extension = file.name.split(".").pop()?.toLowerCase();
	if (extension !== "epub") {
		return false;
	}

	// Check MIME type if available
	if (file.type && !file.type.includes("application/epub+zip")) {
		// Some browsers may not report the correct MIME type for EPUB files
		// So we'll be lenient here and rely more on the extension
		console.warn("File has .epub extension but mime type is:", file.type);
	}

	return true;
}

// Get estimated reading time for an EPUB book
export function getEstimatedReadingTime(fileSize: number): number {
	// Very rough estimate - average reading speed is about 250 words per minute
	// Assuming average of 2000 characters per KB of EPUB file
	// And average of 5 characters per word
	const estimatedCharacters = (fileSize / 1024) * 2000;
	const estimatedWords = estimatedCharacters / 5;
	const estimatedMinutes = Math.round(estimatedWords / 250);

	// Return at least 1 minute
	return Math.max(1, estimatedMinutes);
}
