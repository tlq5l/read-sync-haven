import { base64ToArrayBuffer } from "@/services/epub";
import type { Book } from "epubjs";
import ePub from "epubjs";
import JSZip from "jszip"; // Re-import JSZip
import { Loader2 } from "lucide-react";
import parse from "node-html-parser"; // Import parser
import { dirname, join, normalize } from "path-browserify"; // Keep for path logic
import { useEffect, useState } from "react";

// --- Interfaces ---
// EpubResource and EpubResources interfaces removed as they are no longer needed

interface EpubArchive {
	getText: (url: string) => Promise<string | undefined>;
}
interface ExtendedBook extends Book {
	archive?: EpubArchive;
	// resources property removed from ExtendedBook
	// packaging?: any; // Avoid relying on internal structure if possible
}
// --- End Interfaces ---

// Removed unused arrayBufferToBase64 function

// --- Helper Functions ---
function getMimeType(filename: string): string | null {
	const extension = filename.split(".").pop()?.toLowerCase();
	switch (extension) {
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "png":
			return "image/png";
		case "gif":
			return "image/gif";
		case "webp":
			return "image/webp";
		case "svg":
			return "image/svg+xml";
		default:
			return null;
	}
}
// --- End Helper Functions ---

// --- Main Component ---
interface EpubProcessorProps {
	fileData: string;
	fileName?: string;
	onContentProcessed: (processedHtml: string | null) => void;
}
export default function EpubProcessor({
	fileData,
	fileName,
	onContentProcessed,
}: EpubProcessorProps) {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!fileData) {
			setError("No EPUB data provided.");
			onContentProcessed(null);
			setLoading(false);
			return;
		}

		let epubBook: ExtendedBook | null = null;

		const processEpubHybrid = async () => {
			setLoading(true);
			setError(null);
			console.log("[EpubProcessor] Starting hybrid epubjs/jszip processing...");

			try {
				const arrayBuffer = base64ToArrayBuffer(fileData);
				// Load with both libraries
				epubBook = ePub(arrayBuffer) as ExtendedBook;
				const zip = await JSZip.loadAsync(arrayBuffer); // Reload zip instance
				console.log("[EpubProcessor] Epub book initialized (epubjs & jszip).");

				await epubBook.ready;
				console.log("[EpubProcessor] Epub book ready.");
				if (!epubBook?.spine?.items || !epubBook?.archive) {
					throw new Error(
						"Failed to load EPUB structure (spine/archive missing).",
					);
				}

				console.log(
					`[EpubProcessor] Processing ${epubBook.spine.items.length} spine items...`,
				);
				// Map spine items to promises resolving to processed HTML with embedded images
				const sectionPromises = epubBook.spine.items.map(async (item) => {
					// Removed unused 'index' parameter
					let sectionPath = ""; // Define for error logging
					try {
						// Use item.href directly (usually synchronous) instead of awaiting item.url
						sectionPath = item.href ? normalize(item.href) : "";
						if (!sectionPath || !epubBook?.archive) {
							console.warn(
								`[EpubProcessor] Missing section path or archive for item ${item.idref}.`,
							);
							return "";
						}

						const sectionHtml = await epubBook.archive.getText(sectionPath);
						if (typeof sectionHtml !== "string" || sectionHtml.length === 0) {
							console.warn(
								`[EpubProcessor] Section ${sectionPath} content is not a string or empty.`,
							);
							return "";
						}

						// --- Process HTML to embed images using JSZip ---
						const root = parse(sectionHtml);
						// console.log(`[EpubProcessor DEBUG] Section ${sectionPath}: Successfully parsed HTML.`);
						const sectionDir = dirname(sectionPath);
						// console.log(`[EpubProcessor DEBUG] Section ${sectionPath}: About to query for image elements.`);
						const imageElements = root.querySelectorAll("img");
						// console.log(`[EpubProcessor DEBUG] Section ${sectionPath}: Found ${imageElements.length} image elements.`); // Use basic log below if needed
						// console.log(`[EpubProcessor] Found ${imageElements.length} images in ${sectionPath}`);
						for (const img of imageElements) {
							const originalSrc = img.getAttribute("src");
							// console.log(`\t[Epub Img DEBUG] Processing img tag with original src: "${originalSrc}"`);
							// console.log(`\t[Epub Img] Processing img src: "${originalSrc}"`);
							if (originalSrc && !originalSrc.startsWith("data:")) {
								let imagePath: string | undefined;
								try {
									// Improved path resolution for JSZip
									if (originalSrc.startsWith("/")) {
										// Path is absolute from EPUB root
										imagePath = normalize(originalSrc.substring(1));
										// console.log(`\t[Epub Img DEBUG] Calculated absolute image path: "${imagePath}"`);
									} else {
										// Path is relative to the section directory
										imagePath = normalize(join(sectionDir, originalSrc));
										// console.log(`\t[Epub Img DEBUG] Calculated relative image path: "${imagePath}" (from sectionDir: "${sectionDir}", originalSrc: "${originalSrc}")`);
									}

									// console.log(`\t[Epub Img] Attempting to load image path: "${imagePath}" using JSZip`);
									const imageFile = zip.file(imagePath); // Find file using JSZip

									if (imageFile) {
										// console.log(`\t[Epub Img DEBUG] Found file in JSZip for path: "${imagePath}"`);
										const base64Data = await imageFile.async("base64"); // Get base64 from JSZip
										// console.log(`\t[Epub Img DEBUG] JSZip base64 result length: ${base64Data?.length ?? 'undefined'} for "${imagePath}"`);
										if (base64Data) {
											const mimeType = getMimeType(imagePath); // Determine MIME from path
											// console.log(`\t[Epub Img DEBUG] Determined MIME type: "${mimeType}" for "${imagePath}"`);
											if (mimeType) {
												img.setAttribute(
													"src",
													`data:${mimeType};base64,${base64Data}`,
												);
												// console.log(`\t[Epub Img] SUCCESS: Embedded image "${imagePath}" using JSZip`);
											} else {
												console.warn(
													`\t[Epub Img] FAIL: Could not determine MIME type for "${imagePath}"`,
												);
												img.removeAttribute("src");
											}
										} else {
											console.warn(
												`\t[Epub Img] FAIL: JSZip returned no data for "${imagePath}"`,
											);
											img.removeAttribute("src");
										}
									} else {
										console.warn(
											`\t[Epub Img] FAIL: Image file not found in JSZip archive at "${imagePath}"`,
										);
										img.removeAttribute("src");
									}
								} catch (imgErr) {
									console.error(
										`\t[Epub Img] FAIL: Error processing image src "${originalSrc}" (resolved: "${imagePath}") with JSZip:`,
										imgErr,
									);
									img.removeAttribute("src");
								}
							}
						} // End image loop

						// Return the modified HTML (prefer body content)
						const body = root.querySelector("body");
						return body ? body.innerHTML : root.toString();
						// --- End image embedding ---
					} catch (sectionErr: any) {
						// Add type 'any' for detailed logging
						console.error(
							`[EpubProcessor] Error processing section (href: ${item.href || sectionPath}):`,
							sectionErr, // Reverted logging
						);
						return ""; // Return empty string on error
					}
				}); // End sectionPromises map

				const sectionHtmlArray = await Promise.all(sectionPromises).catch(
					(err) => {
						// Catch errors specifically from Promise.all, often epubjs internal errors
						console.error(
							// Reverted logging
							"[EpubProcessor] Error during Promise.all execution:",
							err,
						);
						if (
							err instanceof TypeError &&
							err.message.includes("Cannot read properties of undefined")
						) {
							setError(
								"Error processing EPUB: This file might have an incompatible internal structure that the current EPUB reader cannot handle.",
							);
							console.error(
								"[EpubProcessor] Detected likely epubjs internal parsing error during section processing.",
							);
						} else {
							// Re-throw other errors to be caught by the main try-catch
							throw err;
						}
						return null; // Return null to indicate failure
					},
				);

				// If Promise.all failed and returned null, stop further processing
				if (sectionHtmlArray === null) {
					onContentProcessed(null);
					setLoading(false);
					return; // Exit the function
				}

				const combinedHtml = sectionHtmlArray
					.filter(Boolean)
					.join("\n\n<hr/>\n\n"); // Filter out empty strings and join

				// Check if ALL sections failed (resulted in empty strings)
				if (!combinedHtml && sectionHtmlArray.every((s) => s === "")) {
					// If all sections failed (likely caught by individual section catch blocks, but logs might be missing)
					// Removed specific "CONDITION MET" log
					setError(
						"Error processing EPUB: Could not extract content from any section. The file might be corrupted or incompatible.",
					);
					console.error(
						// Keep original log too
						"[EpubProcessor] Details: Failed to extract content from any spine section, likely due to internal errors during processing.",
					);
					onContentProcessed(null);
					setLoading(false);
					return; // Stop processing
				}
				// Removed useless 'else' because the previous 'if' block returns
				if (!combinedHtml) {
					// If some sections processed but result is still empty (e.g., only empty sections)
					console.warn(
						"[EpubProcessor] Extracted content resulted in an empty document.",
					);
					// Allow processing to continue but result will likely be "No displayable content"
				}

				// Wrap combined content (only if combinedHtml is not empty or some sections succeeded)
				const finalHtml = `<!DOCTYPE html><html><head><title>${fileName || "EPUB Content"}</title></head><body>
          <div class="epub-content">${combinedHtml}</div>
        </body></html>`;

				console.log("[EpubProcessor] Final combined HTML ready.");
				onContentProcessed(finalHtml);
				setLoading(false);
			} catch (err: any) {
				console.error(
					// Reverted logging
					"Detailed error during hybrid epubjs/jszip processing:",
					err,
				);
				// Check if it's the specific epubjs internal TypeError
				if (
					err instanceof TypeError &&
					err.message.includes("Cannot read properties of undefined")
				) {
					setError(
						"Error processing EPUB: This file might have an incompatible internal structure that the current EPUB reader cannot handle.",
					);
					console.error(
						"[EpubProcessor] Detected likely epubjs internal parsing error.",
					);
				} else {
					setError(`Error processing EPUB: ${err.message || "Unknown error"}`);
				}
				onContentProcessed(null);
				setLoading(false);
			} finally {
				if (epubBook) epubBook.destroy();
			}
		};

		processEpubHybrid(); // Call the updated function name
	}, [fileData, fileName, onContentProcessed]);

	// --- Render loading/error states ---
	if (loading)
		return (
			<div className="flex items-center justify-center h-full p-4">
				<Loader2 className="h-8 w-8 animate-spin text-bondwise-500" />
				<span className="ml-2">Processing {fileName || "EPUB file"}...</span>
			</div>
		);
	if (error)
		return (
			<div className="flex flex-col items-center justify-center h-full p-4">
				<div className="text-destructive mb-4 text-center">{error}</div>
				<div className="text-sm text-muted-foreground">
					Please try uploading the file again or use a different file.
				</div>
			</div>
		);
	return null; // Component only processes
}
