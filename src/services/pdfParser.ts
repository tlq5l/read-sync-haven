import * as pdfjsLib from "pdfjs-dist";
import type { PDFPageProxy, TextItem } from "pdfjs-dist/types/src/display/api"; // Import TextItem type explicitly
import Tesseract from "tesseract.js";

// Configure the worker source using a static public path for pdfjs-dist.
// Assumes the worker file is copied to the root of the public/build output directory.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
// Define a threshold for deciding when to use OCR (e.g., minimum characters extracted by pdfjs)
const MIN_TEXT_THRESHOLD = 10;
// Desired scale for rendering pages to image for OCR
const OCR_RENDER_SCALE = 2.0;

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
			let pageText = "";
			try {
				const textContent = await page.getTextContent();
				const sortedItems = textContent.items
					.filter((item): item is TextItem => "str" in item) // Filter for actual TextItems
					.sort((a, b) => {
						const yDiff = a.transform[5] - b.transform[5];
						const tolerance = 1;
						if (Math.abs(yDiff) > tolerance) {
							return yDiff;
						}
						return a.transform[4] - b.transform[4];
					});

				const extractedText = sortedItems.map((item) => item.str).join(" ");
				const hasSufficientText =
					extractedText.replace(/\s+/g, "").length >= MIN_TEXT_THRESHOLD;

				if (hasSufficientText) {
					// Use text extracted by pdfjs-dist
					pageText = extractedText;
					// console.log(`Page ${i}: Used pdfjs-dist text.`);
				} else {
					// Attempt OCR if text content is insufficient
					// console.log(`Page ${i}: Insufficient text from pdfjs-dist, attempting OCR...`);
					try {
						const ocrText = await performOcrOnPage(page);
						pageText = ocrText;
						// console.log(`Page ${i}: OCR successful.`);
					} catch (ocrError) {
						console.error(`Error performing OCR on page ${i}:`, ocrError);
						pageText = ""; // Fallback to empty string for this page on OCR failure
					}
				}
			} catch (pageError) {
				console.error(`Error processing page ${i}:`, pageError);
				pageText = ""; // Fallback for page processing errors
			}

			// Page text is already assigned in the if/else block above

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

/**
 * Renders a PDF page to a canvas and performs OCR using Tesseract.js.
 * @param page The PDFPageProxy object from pdfjs-dist.
 * @returns Promise resolving with the OCR text.
 */
async function performOcrOnPage(page: PDFPageProxy): Promise<string> {
	const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Could not get 2D context from canvas");
	}

	canvas.height = viewport.height;
	canvas.width = viewport.width;

	const renderContext = {
		canvasContext: context,
		viewport: viewport,
	};

	await page.render(renderContext).promise;

	// Get image data from canvas for Tesseract
	// Using canvas directly is often more efficient if Tesseract supports it
	// const imageDataUrl = canvas.toDataURL(); // Alternative: if Tesseract needs URL/buffer

	const worker = await Tesseract.createWorker("eng", 1, {
		// logger: m => console.log(m) // Optional: for detailed progress
		// Consider adding cache options or specifying worker paths if needed
	});

	try {
		const {
			data: { text },
		} = await worker.recognize(canvas /* or imageDataUrl */);
		return text;
	} finally {
		// Ensure worker terminates even if recognize fails
		await worker.terminate();
		// console.log(`Tesseract worker terminated for page ${page.pageNumber}`);
		// Clean up canvas to free memory
		canvas.width = 0;
		canvas.height = 0;
	}
}
