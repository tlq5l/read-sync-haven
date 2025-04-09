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
	status: "success" | "error" | "password_required"; // Overall document status
}

// Define structure for single-page results used by the callback
interface PageParseResult {
	pageNum: number;
	text: string;
	forms: FormField[];
	tables: Table[];
	status: "success" | "error"; // Page status
}

// Define options for the parsePdf function
interface ParsePdfOptions {
	onPageProcessed?: (pageResult: PageParseResult) => void;
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
	options?: ParsePdfOptions, // Add optional options parameter
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

		// Create an array of promises for processing each page
		const pagePromises = Array.from({ length: pdfDoc.numPages }, (_, i) => {
			const pageNum = i + 1;
			return pdfDoc
				.getPage(pageNum)
				.then((page) => processSinglePage(page, pageNum));
			// Note: Could add a .catch here to handle getPage errors,
			// but processSinglePage already has internal error handling.
		});

		// Execute all page processing promises concurrently
		const pageResultsSettled = await Promise.allSettled(pagePromises);

		// Process the results, maintaining page order for text
		const pageResultsMap: Map<number, PageParseResult> = new Map();
		let overallStatus: PdfParseResult["status"] = "success";
		let maxProcessedPageNum = 0;

		for (const result of pageResultsSettled) {
			if (result.status === "fulfilled") {
				const pageResult = result.value;
				pageResultsMap.set(pageResult.pageNum, pageResult); // Store result by page number

				// Accumulate forms and tables directly
				allForms = allForms.concat(pageResult.forms);
				allTables = allTables.concat(pageResult.tables);

				// Track max page number processed successfully or with error
				maxProcessedPageNum = Math.max(maxProcessedPageNum, pageResult.pageNum);

				// If any page resulted in an error, mark the overall status as error
				if (pageResult.status === "error") {
					overallStatus = "error";
				}

				// Call page processed callback if provided
				try {
					options?.onPageProcessed?.(pageResult);
				} catch (callbackError) {
					console.error(
						`Error executing onPageProcessed callback for page ${pageResult.pageNum}:`,
						callbackError,
					);
					// Don't let callback errors stop the main parsing process
				}
			} else {
				// Promise rejected (e.g., getPage failed critically)
				console.error(
					"Critical error getting/processing PDF page:",
					result.reason,
				);
				overallStatus = "error";
				// We don't know which page failed here without modifying promise creation
				// Callback cannot be reliably called for the failed page in this case
			}
		}

		// Combine text in the correct page order
		const textParts: string[] = [];
		for (let i = 1; i <= maxProcessedPageNum; i++) {
			const pageResult = pageResultsMap.get(i);
			// Only include text if the page was successfully processed or exists in the map
			if (pageResult) {
				textParts.push(pageResult.text); // Already trimmed in processSinglePage
			} else {
				// Potentially handle missing pages if getPage failed, though less likely with allSettled
				console.warn(`Result for page ${i} not found in map.`);
			}
		}
		fullText = textParts.join("\n");

		return {
			text: fullText.trim(),
			forms: allForms,
			tables: allTables,
			status: overallStatus, // Use calculated overall status
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

// Helper function to process a single page
async function processSinglePage(
	page: PDFPageProxy,
	pageNum: number,
): Promise<PageParseResult> {
	let pageText = "";
	let pageForms: FormField[] = [];
	let pageTables: Table[] = [];
	let pageStatus: "success" | "error" = "success";

	try {
		// Text Extraction and Sorting
		const textContent = await page.getTextContent();
		const textItems = textContent.items.filter(
			(item): item is TextItem => "str" in item,
		);
		const sortedItems = groupAndSortTextItems(textItems); // Use improved sorting

		// Table Detection (from sorted items)
		pageTables = detectTablesFromTextItems(sortedItems);

		// Determine if OCR is needed
		const extractedText = sortedItems.map((item) => item.str).join(" ");
		const hasSufficientText =
			extractedText.replace(/\s+/g, "").length >= MIN_TEXT_THRESHOLD;

		// Skip OCR attempt in test environment to avoid canvas errors
		if (hasSufficientText || process.env.VITEST) {
			pageText = extractedText;
		} else {
			// Attempt OCR
			try {
				pageText = await performOcrOnPage(page);
			} catch (ocrError) {
				console.error(`Error performing OCR on page ${pageNum}:`, ocrError);
				pageText = ""; // Fallback to empty string on OCR failure
				// Consider if OCR failure should mark the page status as error
				// pageStatus = "error";
			}
		}

		// Form Field Extraction
		try {
			const annotations = await page.getAnnotations();
			pageForms = annotations
				.filter((anno) => anno.subtype === "Widget")
				.map(
					(anno): FormField => ({
						fieldName: anno.fieldName || null,
						fieldType: anno.fieldType || "Unknown",
						fieldValue: anno.fieldValue ?? "",
						isReadOnly: !!anno.readOnly,
						rect: [...anno.rect],
						pageNum: pageNum,
					}),
				);
		} catch (annotationError) {
			console.error(
				`Error getting annotations for page ${pageNum}:`,
				annotationError,
			);
			// Continue, but potentially incomplete data for this page
		}
	} catch (pageProcessingError) {
		console.error(`Error processing page ${pageNum}:`, pageProcessingError);
		pageText = "";
		pageForms = [];
		pageTables = [];
		pageStatus = "error";
	}

	return {
		pageNum,
		text: pageText.trim(), // Trim text here before returning
		forms: pageForms,
		tables: pageTables,
		status: pageStatus,
	};
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
// --- Text Ordering Helper ---

// Helper type for a block of text items
interface TextBlock {
	items: TextItem[];
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

// Function to group and sort text items, aiming for better reading order
function groupAndSortTextItems(items: TextItem[]): TextItem[] {
	if (!items || items.length === 0) {
		return [];
	}

	// --- 1. Initial Sort (Primarily for block formation) ---
	// Sort primarily by vertical position (top-down, using highest Y), then horizontal (left-right)
	// Note: transform[5] is often bottom-left Y. So item top Y is roughly transform[5] + height.
	// Sorting by bottom-left Y (descending) approximates top-down page flow.
	const initialSortedItems = [...items].sort((a, b) => {
		const yDiff = b.transform[5] - a.transform[5]; // Top-down sort (higher Y first)
		if (Math.abs(yDiff) > 1) {
			// Use a small tolerance
			return yDiff;
		}
		return a.transform[4] - b.transform[4]; // Left-to-right sort
	});

	// --- 2. Group into Blocks ---
	const blocks: TextBlock[] = [];
	const maxVerticalGap = 10; // Max vertical distance to consider items part of the same block (adjust based on font size?)
	const maxHorizontalGapRatio = 1.5; // Max horizontal gap relative to prev item width to join block

	for (const item of initialSortedItems) {
		const itemY = item.transform[5];
		const itemX = item.transform[4];
		const itemHeight = item.height;
		const itemWidth = item.width;
		const itemTopY = itemY + itemHeight; // Approximate top Y

		let addedToBlock = false;
		// Iterate blocks in reverse to check most recent/nearby first
		for (let j = blocks.length - 1; j >= 0; j--) {
			const block = blocks[j];
			// Check vertical proximity (is item within or just below the block's vertical span?)
			const isVerticallyClose =
				itemTopY <= block.maxY + maxVerticalGap &&
				itemY >= block.minY - maxVerticalGap;

			if (isVerticallyClose) {
				// Check horizontal proximity (does item overlap or sit closely to the right?)
				// More complex check might be needed for multi-column within block detection
				const isHorizontallyClose =
					itemX <= block.maxX + itemWidth * maxHorizontalGapRatio && // Item starts not too far right of block end
					itemX + itemWidth >= block.minX - itemWidth * maxHorizontalGapRatio; // Item ends not too far left of block start

				if (isHorizontallyClose) {
					block.items.push(item);
					// Update block bounds
					block.minX = Math.min(block.minX, itemX);
					block.maxX = Math.max(block.maxX, itemX + itemWidth);
					block.minY = Math.min(block.minY, itemY);
					block.maxY = Math.max(block.maxY, itemTopY);
					addedToBlock = true;
					break; // Added to a block, move to next item
				}
			}
		}

		if (!addedToBlock) {
			// Start a new block
			blocks.push({
				items: [item],
				minX: itemX,
				maxX: itemX + itemWidth,
				minY: itemY,
				maxY: itemTopY,
			});
		}
	}

	// --- 3. Sort Blocks ---
	// Sort blocks left-to-right (column first), then top-down
	blocks.sort((a, b) => {
		const xDiff = a.minX - b.minX; // Prioritize left-most block (column)
		const xTolerance = 5; // Tolerance for considering blocks in the same column
		if (Math.abs(xDiff) > xTolerance) {
			return xDiff;
		}
		// If blocks are in the same column (or close), sort top-down
		return b.minY - a.minY; // Higher minY first (closer to top of page)
	});

	// --- 4. Sort Items within each Block ---
	// Sort primarily top-down, then left-to-right within each block
	for (const block of blocks) {
		block.items.sort((a, b) => {
			const yDiff = b.transform[5] - a.transform[5]; // Top-down sort
			if (Math.abs(yDiff) > 1) {
				// Tolerance for y-coordinate comparison
				return yDiff;
			}
			return a.transform[4] - b.transform[4]; // Left-to-right sort
		});
	}

	// --- 5. Flatten Blocks into Final Sorted List ---
	const finalSortedItems: TextItem[] = blocks.flatMap((block) => block.items);

	return finalSortedItems;
}
