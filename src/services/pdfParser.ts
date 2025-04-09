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

// Define the type for extracted form fields
interface FormField {
	fieldName: string | null; // Name of the field
	fieldType: string; // Type (e.g., 'Tx' for text, 'Btn' for button/checkbox/radio)
	fieldValue: any; // Current value of the field
	isReadOnly: boolean; // Is the field read-only?
	rect: number[]; // Position rectangle [x1, y1, x2, y2]
	pageNum: number; // Page number the field is on
}

// Define the structure for the parser's output
interface PdfParseResult {
	text: string;
	forms: FormField[];
	tables: Table[];
	status: "success" | "error" | "password_required"; // Add status field
}

/**
 * Parses a PDF file buffer/arraybuffer and extracts its text content and form field data.
 *
 * @param pdfData The PDF file content as a Buffer or ArrayBuffer.
 * @returns A promise that resolves with an object containing extracted text and form fields,
 *          or an object with empty values if parsing fails.
 */
export async function parsePdf(
	pdfData: Buffer | ArrayBuffer,
): Promise<PdfParseResult> {
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
		let allForms: FormField[] = [];
		let allTables: Table[] = [];

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
				// --- Basic Table Detection ---
				// Apply the heuristic table detection function to the sorted items
				// Note: This happens *before* deciding whether to use OCR text for the page's full text,
				// as table structure relies on coordinate data from pdfjs-dist.
				const pageTables = detectTablesFromTextItems(sortedItems); // Ensure only one argument is passed
				if (pageTables.length > 0) {
					allTables = allTables.concat(pageTables);
					// console.log(`Page ${i}: Found ${pageTables.length} potential table(s).`);
				}
				// --- End Basic Table Detection ---

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
			// --- Form Field Extraction ---
			try {
				const annotations = await page.getAnnotations();
				const formFields = annotations
					.filter((anno) => anno.subtype === "Widget") // Filter for form field annotations
					.map(
						(anno): FormField => ({
							// Extract relevant properties (adjust based on pdfjs-dist annotation structure)
							fieldName: anno.fieldName || null,
							fieldType: anno.fieldType || "Unknown",
							fieldValue: anno.fieldValue ?? "", // Use nullish coalescing for default
							isReadOnly: !!anno.readOnly, // Ensure boolean
							rect: [...anno.rect], // Copy array
							pageNum: i,
						}),
					);
				allForms = allForms.concat(formFields);
				// console.log(`Page ${i}: Found ${formFields.length} form fields.`);
			} catch (annotationError) {
				console.error(
					`Error getting annotations for page ${i}:`,
					annotationError,
				);
				// Continue processing other pages even if annotations fail
			}
			// --- End Form Field Extraction ---

			// Page text is already assigned in the if/else block above

			// Add a single newline between pages
			fullText += `${pageText.trim()}\n`;
		}

		return {
			text: fullText.trim(),
			forms: allForms,
			tables: allTables,
			status: "success", // Add success status
		};
	} catch (error) {
		console.error("Error parsing PDF with pdfjs-dist:", error);
		// Check for password error specifically
		// Use 'as any' for type assertion as error structure isn't strictly typed
		const errorName = (error as any)?.name;
		if (
			errorName === "PasswordException" ||
			errorName === "NeedPasswordError"
		) {
			console.log("PDF requires a password.");
			return {
				text: "",
				forms: [],
				tables: [],
				status: "password_required",
			};
		}
		// Return generic error status for other failures
		return { text: "", forms: [], tables: [], status: "error" };
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
// --- Helper Functions ---

// Define a simple type for extracted tables
type Table = string[][]; // Array of rows, where each row is an array of cell strings

// Helper function for basic table detection (will be rough)
function detectTablesFromTextItems(items: TextItem[]): Table[] {
	// Remove pageNum parameter
	// Implementation Note: This is a very basic heuristic and will likely need refinement.
	// It groups items by vertical position (rows) and then horizontal position (columns).
	// Does not handle merged cells, complex layouts, or image-based tables well.

	if (items.length < 3) return []; // Heuristic: Need at least a few items

	const yTolerance = 5; // Vertical distance tolerance for items in the same row
	const xTolerance = 10; // Horizontal distance tolerance for items in the same column

	// Group items by approximate Y coordinate (potential rows)
	const potentialRows: Map<number, TextItem[]> = new Map();
	for (const item of items) {
		const y = item.transform[5]; // Bottom-left Y in PDF coordinate space (origin bottom-left)
		let foundRow = false;
		for (const [rowY] of potentialRows) {
			if (Math.abs(y - rowY) < yTolerance) {
				potentialRows.get(rowY)?.push(item);
				foundRow = true;
				break;
			}
		}
		if (!foundRow) {
			potentialRows.set(y, [item]);
		}
	}

	// Convert map to sorted array of rows (top to bottom on page means decreasing Y in PDF space)
	const sortedRows = Array.from(potentialRows.values())
		.filter((rowItems) => rowItems.length > 0) // Ensure row not empty
		.sort((a, b) => b[0].transform[5] - a[0].transform[5]); // Sort rows top-to-bottom

	const detectedTables: Table[] = [];
	let currentTable: Table | null = null;

	for (const rowItems of sortedRows) {
		// Sort items within the row by X coordinate (left-to-right)
		rowItems.sort((a, b) => a.transform[4] - b.transform[4]);

		const rowCells: string[] = [];
		let lastItemEndX = Number.NEGATIVE_INFINITY; // Use Number namespace

		// Attempt to identify columns within the row
		for (const item of rowItems) {
			const itemStartX = item.transform[4];
			// If start of current item is far enough from end of last item, start new cell
			if (itemStartX - lastItemEndX > xTolerance || rowCells.length === 0) {
				rowCells.push(item.str.trim());
			} else {
				// Otherwise, append to the last cell (handle items close together)
				if (rowCells.length > 0) {
					// Add space only if last cell doesn't already end with space
					rowCells[rowCells.length - 1] +=
						(rowCells[rowCells.length - 1].endsWith(" ") ? "" : " ") +
						item.str.trim();
				} else {
					// Should not happen if rowCells.length === 0 condition above works, but defensively add
					rowCells.push(item.str.trim());
				}
			}
			// PDF coordinates give bottom-left, width is in item.width
			// transform[0] is scaling factor if needed, assume 1 for simplicity here
			lastItemEndX = itemStartX + item.width;
		}

		// Heuristic: If we identified more than one cell, consider it part of a table
		if (rowCells.length > 1) {
			if (!currentTable) {
				currentTable = []; // Start a new table
				detectedTables.push(currentTable);
			}
			currentTable.push(rowCells); // Add the row to the current table
		} else {
			currentTable = null; // If a row doesn't look like a table row, break the current table
		}
	}

	// Filter out "tables" that only have one row, as they are likely not tables
	return detectedTables.filter((table) => table.length > 1);
}
