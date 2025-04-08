import { base64ToArrayBuffer } from "@/services/epub";
import type { Book } from "epubjs";
import ePub from "epubjs";
import JSZip from "jszip"; // Re-import JSZip
import { Loader2 } from "lucide-react";
import parse from "node-html-parser"; // Import parser
import { dirname, join, normalize } from "path-browserify"; // Keep for path logic
import { useEffect, useState } from "react";

// --- Interfaces ---
interface EpubArchive {
	getText: (url: string) => Promise<string | undefined>;
}
interface EpubResource {
	buffer: ArrayBuffer;
	mimeType: string;
	// Add other relevant properties if needed based on epubjs Resource definition
}
interface EpubResources {
	get: (href: string) => Promise<EpubResource | undefined>; // Define the 'get' method
	// Add other relevant methods if needed
}
interface ExtendedBook extends Book {
	archive?: EpubArchive;
	resources: EpubResources; // Add the resources property with the correct type
	// Remove incorrect 'load' method addition from previous attempts
	packaging: {
		// Ensure packaging and opfPath are typed
		opfPath: string;
		// Include other packaging properties if needed
	};
}
// --- End Interfaces ---

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
}: EpubProcessorProps): React.ReactNode {
	// Explicitly add return type
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
				epubBook = ePub(arrayBuffer) as ExtendedBook; // Keep epubjs for structure
				const zip = await JSZip.loadAsync(arrayBuffer); // Reload zip instance
				console.log("[EpubProcessor] Epub book initialized (epubjs & jszip).");

				// --- Case-Insensitive Path Mapping ---
				const actualFilePaths = Object.keys(zip.files);
				const pathMap: Record<string, string> = {};
				for (const path of actualFilePaths) {
					pathMap[path.toLowerCase()] = path;
				}
				console.log(
					`[EpubProcessor] Created path map with ${Object.keys(pathMap).length} entries for case-insensitive lookup.`,
				);
				// --- End Case-Insensitive Path Mapping ---

				await epubBook.ready;
				console.log("[EpubProcessor] Epub book ready.");
				// Check if epubBook is initialized and ready, and has necessary components
				// Check only for essential structure needed before proceeding
				if (!epubBook || !epubBook.spine?.items) {
					throw new Error(
						"Failed to initialize EPUB book structure or spine items.",
					);
				}
				// Determine the base path relative to the zip root
				// Determine the base path using epubjs's path property, falling back if needed
				const opfPath = epubBook.packaging?.opfPath; // Keep for logging context
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				let basePath = (epubBook as any).path?.directory ?? ""; // Cast to any to access potential runtime property 'path'
				if (!basePath && opfPath && typeof opfPath === "string") { // Fallback if path.directory is missing
					basePath = dirname(opfPath);
				}
				console.log(
					`[EpubProcessor] Determined EPUB base path: "${basePath}" (using epubjs path property, fallback OPF: "${opfPath || "Not found"}")`,
				);

				console.log(
					`[EpubProcessor] Processing ${epubBook.spine.items.length} spine items...`,
				);
				console.log(
					"[EpubProcessor] Spine item hrefs:",
					epubBook.spine.items.map((i) => i.href),
				);
				// Map spine items to promises resolving to processed HTML with embedded images
				const sectionPromises = epubBook.spine.items.map(async (item) => {
					// 'item' is a Section object
					console.log(
						`[EpubProcessor] Attempting to process section: ${item.href}`,
					);
					let fullSectionPath = ""; // Define for error logging scope
					try {
						const relativeSectionPath = item.href ? normalize(item.href) : "";
						if (!relativeSectionPath) {
							console.warn(
								`[EpubProcessor] Missing section href for item ${item.idref}. Skipping.`,
							);
							return "";
						}

						// Construct the full path within the zip archive using the basePath
						fullSectionPath =
							basePath && basePath !== "."
								? join(basePath, relativeSectionPath)
								: relativeSectionPath;
						fullSectionPath = normalize(fullSectionPath); // Normalize after potential join

						// console.log( // Removed DEBUG log
						// 	`\t[DEBUG] Section ${item.href}: Relative path = "${relativeSectionPath}", Base path = "${basePath}", Calculated Full path = "${fullSectionPath}"`
						// );

						// --- Use JSZip to get raw section HTML (case-insensitive using calculated full path) ---
						const actualSectionPath = pathMap[fullSectionPath.toLowerCase()];
						const sectionFile = actualSectionPath
							? zip.file(actualSectionPath)
							: null;

						// console.log( // Removed DEBUG log
						// 	`\t[DEBUG] Section ${item.href}: Looked for full path "${fullSectionPath}". Found actual path in zip: "${actualSectionPath || "NOT FOUND"}"`,
						// );

						if (!sectionFile) {
							console.warn(
								`[EpubProcessor] FAIL: Section file not found in zip for href "${item.href}" (searched full path: ${fullSectionPath}). Skipping.`,
							);
							return ""; // Skip section if file not found
						}
						const sectionHtml = await sectionFile.async("string");
						// --- End JSZip HTML extraction ---

						if (typeof sectionHtml !== "string" || sectionHtml.length === 0) {
							console.warn(
								`[EpubProcessor] FAIL: Section content is not a string or empty for href "${item.href}" (path: ${actualSectionPath}). Skipping.`,
							);
							return "";
						}
						console.log(
							`[EpubProcessor] SUCCESS: Extracted raw HTML for section: ${item.href} (path: ${actualSectionPath})`,
						);
						// console.log(`\t[DEBUG] Section ${item.href}: HTML content length: ${sectionHtml?.length}`); // Removed DEBUG log

						// --- Process HTML (Parse and embed images using JSZip and basePath) ---
						// console.log(`\t[DEBUG] Section ${item.href}: Preparing to parse HTML.`); // Removed DEBUG log
						const root = parse(sectionHtml); // Parse the loaded HTML
						// console.log(`\t[DEBUG] Section ${item.href}: HTML parsing completed.`); // Removed DEBUG log
						// console.log(`\t[DEBUG] Section ${item.href}: Querying for image elements.`); // Removed DEBUG log
						const imageElements = root.querySelectorAll("img");
						// console.log(`\t[DEBUG] Section ${item.href}: Found ${imageElements.length} image elements. Starting image loop.`); // Removed DEBUG log

						for (const img of imageElements) {
							const originalSrc = img.getAttribute("src");
							// Use JSZip for images, resolving paths relative to the OPF base path
							if (originalSrc && !originalSrc.startsWith("data:")) {
								let imagePath: string | undefined; // Full path in zip
								try {
									// Determine if image src is absolute (from zip root) or relative (to OPF base path)
									const isAbsolute = originalSrc.startsWith("/"); // Check if path starts from root
									let relativeImagePath = originalSrc;
									if (isAbsolute) {
										relativeImagePath = relativeImagePath.substring(1); // Remove leading '/'
										// If absolute path, treat it as relative to the zip root, potentially adjusted by basePath
										imagePath =
											basePath && basePath !== "."
												? join(basePath, relativeImagePath)
												: relativeImagePath;
									} else {
										// If relative path, join with the OPF base path
										imagePath =
											basePath && basePath !== "."
												? join(basePath, relativeImagePath)
												: relativeImagePath;
									}
									imagePath = normalize(imagePath); // Normalize the final path

									// console.log( // Removed DEBUG log
									// 	`\t[Epub Img DEBUG] Orig src: "${originalSrc}", IsAbsolute: ${isAbsolute}, Base path: "${basePath}", Resolved zip path: "${imagePath}"`
									// );

									// Look up in zip using case-insensitive map
									const actualImagePath = imagePath
										? pathMap[imagePath.toLowerCase()]
										: undefined;
									const imageFile = actualImagePath
										? zip.file(actualImagePath)
										: null;

									if (imageFile) {
										const base64Data = await imageFile.async("base64");
										if (base64Data && actualImagePath) {
											const mimeType = getMimeType(actualImagePath);
											if (mimeType) {
												img.setAttribute(
													"src",
													`data:${mimeType};base64,${base64Data}`,
												);
												console.log(
													`\t[Epub Img] SUCCESS: Embedded image "${actualImagePath}" using JSZip`,
												);
											} else {
												console.warn(
													`\t[Epub Img] FAIL: Could not get MIME type for "${actualImagePath}"`,
												);
												img.removeAttribute("src");
											}
										} else {
											console.warn(
												`\t[Epub Img] FAIL: JSZip returned no base64 data for "${actualImagePath}"`,
											);
											img.removeAttribute("src");
										}
									} else {
										console.warn(
											`\t[Epub Img] FAIL: Image file not found in zip at resolved path "${imagePath}" (looked for actual path "${actualImagePath || "NOT FOUND"}")`,
										);
										img.removeAttribute("src");
									}
								} catch (imgErr: any) {
									console.error(
										`\t[Epub Img] FAIL: Error processing image src "${originalSrc}" (resolved path: "${imagePath ?? "unknown"}"):`,
										imgErr?.message || imgErr,
										imgErr,
									);
									img.removeAttribute("src");
								}
							}
						} // End image loop
						// console.log(`\t[DEBUG] Section ${item.href}: Finished image loop.`); // Removed DEBUG log
						console.log(`\t[DEBUG] Section ${item.href}: Finished image loop.`); // Log after image loop

						// Return the modified HTML (prefer body content)
						const body = root.querySelector("body");
						const processedContent = body ? body.innerHTML : root.toString();
						// console.log(`\t[DEBUG] Section ${item.href}: Processing complete. Returning content length: ${processedContent?.length}`); // Removed DEBUG log
						return processedContent;
					} catch (sectionErr: any) {
						// Restore simpler error logging
						console.error(
							`[EpubProcessor] FAIL: Error processing section href: ${item.href} (searched full path: ${fullSectionPath}):`,
							sectionErr?.message || sectionErr,
							sectionErr,
						);
						return ""; // Return empty string on error
					}
				}); // End sectionPromises map

				const sectionHtmlArray = await Promise.all(sectionPromises).catch(
					(err) => {
						// Catch errors specifically from Promise.all, often epubjs internal errors
						console.error(
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

				console.log(
					`[EpubProcessor] Final check: Was any content extracted? ${!!combinedHtml}`,
				);
				// Check if ALL sections failed (resulted in empty strings)
				if (!combinedHtml && sectionHtmlArray.every((s) => s === "")) {
					// If all sections failed (likely caught by individual section catch blocks, but logs might be missing)
					console.error(
						`[EpubProcessor] All ${sectionHtmlArray.length} sections failed content extraction.`,
					);
					setError(
						"Error processing EPUB: Could not extract content from any section. The file might be corrupted or incompatible.",
					);
					console.error(
						"[EpubProcessor] FINAL FAIL: Failed to extract content from ANY spine section, likely due to errors during processing.", // Enhanced log
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
