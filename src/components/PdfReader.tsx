import { base64ToArrayBuffer } from "@/services/pdf"; // Assuming this service exists
import { Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import type {
	PDFDocumentProxy,
	TextItem,
} from "pdfjs-dist/types/src/display/api"; // Import necessary types
import { useEffect, useState } from "react";

// Configure the worker source for pdfjs-dist
// Note: This path might need adjustment depending on your build setup and how static assets are served.
// It expects the worker file to be available relative to the final built output.
// Common setup: copy the worker from node_modules/pdfjs-dist/build/pdf.worker.mjs to your public/static folder.
try {
	pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
		"pdfjs-dist/build/pdf.worker.mjs",
		import.meta.url,
	).toString();
	// For Vite/dev environments, using import.meta.url works well.
	// For other bundlers/production, you might need a different approach:
	// pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.mjs`; // If copied to public root
} catch (e) {
	console.error(
		"Failed to set pdfjs worker source dynamically. Ensure pdf.worker.mjs is available.",
		e,
	);
	// Fallback path - adjust if needed
	pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
}

interface PdfProcessorProps {
	fileData: string;
	fileName?: string;
	onContentProcessed: (processedHtml: string | null) => void; // Consistent callback name
}

/**
 * Processes a base64-encoded PDF file, extracts its text content, formats it into simple HTML paragraphs, and invokes a callback with the result.
 *
 * @remark
 * If the PDF is password-protected or invalid, the callback is invoked with `null` and an error message is displayed. The component does not render the PDF content itself.
 */
export default function PdfProcessor({
	fileData,
	fileName,
	onContentProcessed,
}: PdfProcessorProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!fileData) {
			setError("No PDF data provided");
			onContentProcessed(null);
			setLoading(false);
			return;
		}

		let pdfDoc: PDFDocumentProxy | null = null;

		const processPdf = async () => {
			try {
				setLoading(true);
				setError(null);

				// const { base64ToArrayBuffer } = await import("@/services/pdf"); // Statically imported
				const arrayBuffer = base64ToArrayBuffer(fileData);

				// Load the PDF document
				const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
				pdfDoc = await loadingTask.promise;

				let fullTextContent = "";
				const numPages = pdfDoc.numPages;

				// Extract text from each page
				for (let i = 1; i <= numPages; i++) {
					const page = await pdfDoc.getPage(i);
					const textContent = await page.getTextContent();
					// Join text items
					let pageText = "";
					for (const item of textContent.items) {
						// Ensure item is a TextItem before accessing str
						if ("str" in item) {
							pageText = `${pageText}${(item as TextItem).str} `; // Use template literal and add space
						}
					}
					// Replace multiple spaces/newlines possibly introduced
					pageText = pageText.replace(/\s+/g, " ").trim(); // Keep this cleanup
					// Add text with paragraph breaks between pages
					fullTextContent = `${fullTextContent}${pageText}\n\n`; // Use template literal
					page.cleanup(); // Clean up page resources
				}

				// Format the extracted text as simple HTML
				const paragraphs = fullTextContent
					.split(/\n\s*\n/) // Split into paragraphs based on double newlines
					.map((p) => p.trim())
					.filter((p) => p.length > 0); // Remove empty paragraphs

				const simpleHtml = paragraphs.map((p) => `<p>${p}</p>`).join("");

				console.log("PDF text extracted and formatted to HTML.");
				onContentProcessed(simpleHtml);
				setLoading(false);
			} catch (err: any) {
				console.error("Error processing PDF:", err);
				let errorMessage = `Failed to process PDF file ${
					fileName || ""
				}. It might be corrupted or password-protected.`;
				// Check for specific PDF.js errors
				if (err.name === "PasswordException") {
					errorMessage = `PDF file ${
						fileName || ""
					} is password-protected and cannot be processed.`;
				} else if (err.name === "InvalidPDFException") {
					errorMessage = `The file ${
						fileName || ""
					} is not a valid PDF or is corrupted.`;
				}
				setError(errorMessage);
				setLoading(false);
				onContentProcessed(null);
			} finally {
				// Ensure PDF document is destroyed if it exists
				if (pdfDoc) {
					pdfDoc.destroy().catch((destroyError) => {
						console.error("Error destroying PDF document:", destroyError);
					});
				}
			}
		};

		processPdf();

		// Cleanup function (though destruction is now in finally block)
		return () => {
			// Cleanup is handled in the finally block of processPdf
			// We can remove this potentially redundant check
		};
	}, [fileData, fileName, onContentProcessed]);

	// Render loading/error states
	if (loading) {
		return (
			<div className="flex items-center justify-center h-full p-4">
				<Loader2 className="h-8 w-8 animate-spin text-thinkara-500" />
				<span className="ml-2">Processing {fileName || "PDF file"}...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-4">
				<div className="text-destructive mb-4 text-center">{error}</div>
				<div className="text-sm text-muted-foreground">
					Please try uploading the file again or use a different file.
				</div>
			</div>
		);
	}

	return null; // Component only processes, doesn't render content
}
