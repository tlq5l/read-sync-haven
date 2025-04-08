import type { Buffer } from "node:buffer"; // Ensure Buffer is explicitly imported if needed in the environment
import pdfParse from "pdf-parse";

/**
 * Parses a PDF file buffer and extracts its text content.
 *
 * @param buffer The PDF file content as a Buffer.
 * @returns A promise that resolves with the extracted text as a string,
 *          or an empty string if parsing fails.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
	try {
		const data = await pdfParse(buffer);
		return data.text;
	} catch (error) {
		console.error("Error parsing PDF:", error);
		// Return empty string on failure as requested
		return "";
	}
}
