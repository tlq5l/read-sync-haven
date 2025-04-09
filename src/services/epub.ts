/**
 * EPUB parsing utilities
 * Provides functions to extract metadata from EPUB files
 */
import ePub from "epubjs";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
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
		throw new Error(
			"Failed to convert EPUB data. The file might be corrupted.",
		);
	}
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
		// let coverUrl: string | undefined; // Removed unused variable
		let coverBase64: string | undefined;
		try {
			// Try getting cover using epubjs first
			const coverBlobUrl = await book.coverUrl();
			if (coverBlobUrl) {
				// Convert blob URL to base64
				const response = await fetch(coverBlobUrl);
				const blob = await response.blob();
				coverBase64 = await new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onloadend = () => resolve(reader.result as string);
					reader.onerror = reject;
					reader.readAsDataURL(blob);
				});
				URL.revokeObjectURL(coverBlobUrl); // Clean up blob URL
			}
		} catch (epubjsCoverError) {
			console.warn(
				"epubjs failed to get coverUrl, attempting fallback via JSZip:",
				epubjsCoverError,
			);
			// Fallback using JSZip and OPF parsing
			try {
				const zip = await JSZip.loadAsync(fileBuffer);
				const containerFile = zip.file("META-INF/container.xml");
				if (!containerFile) {
					throw new Error("META-INF/container.xml not found in EPUB.");
				}
				const containerXml = await containerFile.async("string");
				const parser = new XMLParser({ ignoreAttributes: false });
				const containerData = parser.parse(containerXml);

				const rootfilePath =
					containerData?.container?.rootfiles?.rootfile?.["@_full-path"];
				if (!rootfilePath) {
					throw new Error("Could not find rootfile path in container.xml.");
				}

				const opfFile = zip.file(rootfilePath);
				if (!opfFile) {
					throw new Error(`OPF file not found at path: ${rootfilePath}`);
				}
				const opfXml = await opfFile.async("string");
				const opfData = parser.parse(opfXml);

				const metadata = opfData?.package?.metadata;
				const manifest = opfData?.package?.manifest?.item;

				let coverItemId: string | undefined;
				if (metadata?.meta && Array.isArray(metadata.meta)) {
					coverItemId = metadata.meta.find(
						(meta: any) => meta["@_name"] === "cover",
					)?.["@_content"];
				} else if (metadata?.meta?.["@_name"] === "cover") {
					coverItemId = metadata.meta["@_content"];
				}

				if (coverItemId && manifest) {
					const coverManifestItem = (
						Array.isArray(manifest) ? manifest : [manifest]
					).find((item: any) => item["@_id"] === coverItemId);

					if (coverManifestItem?.["@_href"]) {
						const coverPath = coverManifestItem["@_href"];
						// Resolve cover path relative to OPF file
						const opfDir = rootfilePath.substring(
							0,
							rootfilePath.lastIndexOf("/"),
						);
						const absoluteCoverPath = opfDir
							? `${opfDir}/${coverPath}`
							: coverPath;

						const coverFile = zip.file(absoluteCoverPath);
						if (coverFile) {
							const coverBuffer = await coverFile.async("arraybuffer");
							const mimeType =
								coverManifestItem["@_media-type"] || "image/jpeg"; // Default fallback
							coverBase64 = `data:${mimeType};base64,${arrayBufferToBase64(coverBuffer)}`;
							console.log("Successfully extracted cover using JSZip fallback.");
						} else {
							console.warn(
								`Cover image file not found at resolved path: ${absoluteCoverPath}`,
							);
						}
					} else {
						console.warn("Cover item found in manifest, but href is missing.");
					}
				} else {
					console.warn("Could not find cover meta tag or manifest in OPF.");
				}
			} catch (fallbackError) {
				console.error("Error during JSZip cover fallback:", fallbackError);
			}
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

		// Add cover if extracted (either via epubjs or fallback)
		if (coverBase64) {
			result.cover = coverBase64;
		}

		// Properly destroy the book instance to free up resources
		book.destroy();

		return result;
	} catch (error) {
		// Add more detailed logging to capture the specific epubjs error
		const errorMessage = error instanceof Error ? error.message : String(error);
		console.error(
			`Error extracting EPUB metadata (epubjs): ${errorMessage}`,
			error,
		);
		// Propagate the error to the caller
		// Remove the 'cause' property as it's causing a TS error in this environment
		throw new Error(`EPUB Parsing Failed: ${errorMessage}`); // Re-throw with more context
	}
}

// Function to validate if a buffer contains a valid EPUB structure
export async function isValidEpub(fileBuffer: ArrayBuffer): Promise<boolean> {
	try {
		const zip = await JSZip.loadAsync(fileBuffer);

		// 1. Check for mimetype file existence and content
		const mimetypeFile = zip.file("mimetype");
		if (!mimetypeFile) {
			console.error("EPUB Validation Error: 'mimetype' file not found.");
			return false;
		}
		const mimetypeContent = await mimetypeFile.async("string");
		if (mimetypeContent.trim() !== "application/epub+zip") {
			console.error(
				`EPUB Validation Error: Invalid content in 'mimetype' file: "${mimetypeContent.trim()}"`,
			);
			return false;
		}

		// 2. Check for META-INF/container.xml existence
		const containerFile = zip.file("META-INF/container.xml");
		if (!containerFile) {
			console.error(
				"EPUB Validation Error: 'META-INF/container.xml' file not found.",
			);
			return false;
		}

		// Basic structure checks passed
		return true;
	} catch (error) {
		console.error("EPUB Validation Error: Could not load zip file.", error);
		return false; // Failed to load as zip, likely not a valid EPUB
	}
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
