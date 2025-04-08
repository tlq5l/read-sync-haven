import * as pdfjsLib from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api"; // Import TextItem type explicitly

// Configure the worker source using a static public path.
// Assumes the worker file is copied to the root of the public/build output directory.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

/**
 * Parses a PDF file buffer/arraybuffer and extracts its text content using pdfjs-dist.
 *
 * @param pdfData The PDF file content as a Buffer or ArrayBuffer.
 * @returns A promise that resolves with the extracted text as a string,
 *          or an empty string if parsing fails.
 */
export async function parsePdf(pdfData: Buffer | ArrayBuffer): Promise<string> {
	try {
		// pdfjs-dist works with Uint8Array, so convert if necessary
		// Ensure Buffer is handled correctly if it's from Node.js context (though aiming for browser)
		const typedArrayData =
			pdfData instanceof ArrayBuffer
				? new Uint8Array(pdfData)
				: new Uint8Array(
						pdfData.buffer,
						pdfData.byteOffset,
						pdfData.byteLength,
					); // Convert Buffer -> Uint8Array

		const pdfDoc = await pdfjsLib.getDocument({ data: typedArrayData }).promise;
		let fullText = "";

		for (let i = 1; i <= pdfDoc.numPages; i++) {
			const page = await pdfDoc.getPage(i);
			const textContent = await page.getTextContent();
			let pageText = "";
			// Removed unused variables lastY and lastHeight after simplifying logic

			// Sort items based on vertical position primarily, then horizontal.
			// pdf.js textContent *should* be in reading order, but explicit sort is safer.
			const sortedItems = textContent.items
				.filter((item): item is TextItem => "str" in item) // Use the imported TextItem type
				.sort((a, b) => {
					// Compare Y first (assuming Y increases downwards in pdf.js coordinate system)
					const yDiff = a.transform[5] - b.transform[5];
					// Use a small tolerance for items considered on the same line
					const tolerance = 1;
					if (Math.abs(yDiff) > tolerance) {
						return yDiff; // Sort by Y primarily
					}
					// If Y is similar, sort by X (left-to-right)
					return a.transform[4] - b.transform[4];
				});

			// Simplified approach: Join all sorted text items with a space.
			// This reverts the complex paragraph logic to fix the regression.
			// Assign directly to pageText declared earlier in the loop scope
			pageText = sortedItems.map((item) => item.str).join(" ");

			// Add a single newline between pages
			fullText += `${pageText.trim()}\n`;
		}

		return fullText.trim(); // Trim leading/trailing whitespace potentially added
	} catch (error) {
		console.error("Error parsing PDF with pdfjs-dist:", error);
		// Return empty string on failure
		return "";
	}
}
