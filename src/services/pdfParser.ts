import * as pdfjsLib from "pdfjs-dist";

// Essential: Configure the worker source for pdf.js
// This ensures it works correctly in environments like Vite that bundle modules.
// It needs to resolve the path to the worker script relative to the built output.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.js",
	import.meta.url,
).toString();

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
			// Concatenate text items on the page, ensuring item is TextItem
			const pageText = textContent.items
				.map((item) => ("str" in item ? item.str : ""))
				.join(" ");
			fullText += `${pageText}\n`; // Add newline between pages for readability
		}

		return fullText.trim(); // Trim trailing newline
	} catch (error) {
		console.error("Error parsing PDF with pdfjs-dist:", error);
		// Return empty string on failure
		return "";
	}
}
