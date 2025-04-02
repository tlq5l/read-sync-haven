import { Button } from "@/components/ui/button";
// Removed static import: import { base64ToArrayBuffer } from "@/services/epub";
import type { Book, Rendition } from "epubjs";
import ePub from "epubjs";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react"; // Removed useCallback

interface EpubReaderProps {
	fileData: string;
	fileName?: string;
	onTextExtracted: (text: string | null) => void; // Add callback prop
}

// Define missing types for EPUB.js
interface EpubContents {
	document: Document;
	window: Window;
	// Add other properties as needed
}

// Extend Rendition type to include hooks properly
interface ExtendedRendition extends Rendition {
	hooks: {
		register: (event: string, callback: (event: any) => void) => void;
		content: {
			register: (callback: (contents: EpubContents) => void) => void;
		};
		render: {
			register: (callback: (section: any) => void) => void;
		};
	};
	// Add request type if needed, based on epubjs source/docs
	// request?: (url: string, options?: any) => Promise<ArrayBuffer | string | object>;
}

// Extend Book type if needed for request method
interface ExtendedBook extends Book {
	request?: (
		url: string,
		options?: any,
	) => Promise<ArrayBuffer | string | object>;
}

// Correctly define the component and destructure props ONCE
export default function EpubReader({
	fileData,
	fileName,
	onTextExtracted, // Destructure the callback
}: EpubReaderProps) {
	const [book, setBook] = useState<ExtendedBook | null>(null); // Use ExtendedBook
	const [rendition, setRendition] = useState<ExtendedRendition | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const viewerRef = useRef<HTMLDivElement>(null);
	const [currentLocation, setCurrentLocation] = useState<string | null>(null);
	const [contentRendered, setContentRendered] = useState(false);

	// Initialize the EPUB book
	useEffect(() => {
		if (!fileData || !viewerRef.current) return;

		let epubBook: ExtendedBook | null = null; // Use ExtendedBook

		const initializeBook = async () => {
			try {
				setLoading(true);
				setContentRendered(false);

				// Dynamically import and convert base64 to ArrayBuffer
				const { base64ToArrayBuffer } = await import("@/services/epub");
				const arrayBuffer = base64ToArrayBuffer(fileData);

				// Create EPUB book instance
				epubBook = ePub(arrayBuffer) as ExtendedBook; // Cast to ExtendedBook
				setBook(epubBook);

				// Create rendition when book is ready
				epubBook.ready
					.then(() => {
						if (!viewerRef.current || !epubBook) return;

						// Use scrolled-document mode for better scrolling of content
						const epubRendition = epubBook.renderTo(
							viewerRef.current as HTMLElement,
							{
								width: "100%",
								height: "100%",
								flow: "scrolled-doc", // Use scrolled-doc flow
								ignoreClass: "annotator-hl",
								spread: "none",
								manager: "continuous", // Add continuous manager for better scrolling
							},
						) as ExtendedRendition;

						// Listen for rendering events - use typed content hook
						epubRendition.hooks.content.register((contents: EpubContents) => {
							const body = contents.document.body;
							if (body) {
								// Make document scrollable
								body.style.overflow = "auto";
								body.style.maxWidth = "100%";
							}
						});

						// Display the book from beginning and apply scrolling to content
						epubRendition.display().then(() => {
							setLoading(false);
							setContentRendered(true);
							console.log("EPUB content displayed successfully");

							// Function to apply styles to iframes
							const applyIframeStyles = () => {
								const iframes = viewerRef.current?.querySelectorAll("iframe");
								if (iframes?.length) {
									for (const iframe of Array.from(iframes)) {
										iframe.style.border = "0";
										iframe.style.width = "100%";
										iframe.style.height = "100%";
										iframe.style.overflow = "auto";
									}
								}
							};
							applyIframeStyles();
						});

						// Store rendition for navigation
						setRendition(epubRendition);

						// Track location changes
						epubRendition.on("locationChanged", (loc) => {
							if (loc?.start) {
								setCurrentLocation(loc.start.cfi);
								console.log("EPUB location changed:", loc.start.cfi);
							}
						});

						// Add rendering error handler
						epubRendition.on("rendered", (section) => {
							console.log(
								"EPUB section rendered:",
								section?.href || "unknown section",
							);
						});

						// --- Extract Full Text ---
						epubBook?.ready // Null check
							.then(() => epubBook?.locations.generate(1000)) // Null check
							.then(async () => {
								if (!epubBook) {
									// Null check
									onTextExtracted(null);
									return;
								}
								let fullText = "";
								// Helper to load and extract text from a section
								const loadSectionText = async (sectionHref: string) => {
									if (!epubBook) return ""; // Null check
									try {
										const section = epubBook.spine.get(sectionHref);
										if (section) {
											// Try loading section by passing book's request method
											if (
												epubBook.request &&
												typeof epubBook.request === "function"
											) {
												await section.load(epubBook.request); // Pass the book's request function
												return section.contents?.textContent || "";
											}
											console.warn(
												`epubBook.request method not found or not a function for section ${sectionHref}. Cannot extract text.`,
											);
											return "";
										}
									} catch (loadErr) {
										console.warn(
											`Could not load/extract text from section ${sectionHref}:`,
											loadErr,
										);
									}
									return "";
								};

								// Iterate through spine items sequentially
								if (epubBook?.spine?.items) {
									for (const section of epubBook.spine.items) {
										if (section.href) {
											const sectionText = await loadSectionText(section.href);
											fullText = `${fullText}${sectionText}\n\n`; // Use template literal
										}
									}
								} else {
									console.warn(
										"EPUB spine items not found for text extraction.",
									);
								}
								console.log(
									"EPUB Full Text Extracted (first 200 chars):",
									fullText.substring(0, 200),
								);
								onTextExtracted(fullText.trim()); // Call callback
							})
							.catch((textErr) => {
								console.error("Error extracting EPUB text:", textErr);
								onTextExtracted(null); // Indicate failure
							});
						// --- End Extract Full Text ---
					})
					.catch((err) => {
						console.error("Error rendering EPUB:", err);
						setError("Failed to render EPUB file. Please try again.");
						setLoading(false);
						onTextExtracted(null); // Indicate failure on render error too
					});
			} catch (err) {
				console.error("Error initializing EPUB:", err);
				setError(
					"Failed to initialize EPUB reader. The file might be corrupted.",
				);
				setLoading(false);
				onTextExtracted(null); // Ensure callback on init error
			}
		};
		initializeBook();

		// Cleanup function
		return () => {
			if (epubBook) {
				try {
					epubBook.destroy();
				} catch (err) {
					console.error("Error destroying EPUB book:", err);
				}
			}
		};
	}, [fileData, onTextExtracted]); // Add onTextExtracted to dependency array

	// Navigation handlers
	const handlePrevPage = () => {
		if (rendition) {
			console.log("Navigating to previous page");
			rendition.prev();
		}
	};

	const handleNextPage = () => {
		if (rendition) {
			console.log("Navigating to next page");
			rendition.next();
		}
	};

	// Add keyboard navigation
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (!rendition) return;

			switch (e.key) {
				case "ArrowLeft":
					rendition.prev();
					break;
				case "ArrowRight":
					rendition.next();
					break;
				default:
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [rendition]);

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-4">
				<div className="text-destructive mb-4">{error}</div>
				<div className="text-sm text-muted-foreground">
					Try uploading the file again or use a different EPUB file.
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div
				ref={viewerRef}
				className="flex-1 overflow-auto"
				style={{
					minHeight: "600px",
					position: "relative",
					height: "100%",
					display: "flex",
					flexDirection: "column",
				}}
			>
				{loading && (
					<div className="flex items-center justify-center h-full">
						<Loader2 className="h-8 w-8 animate-spin text-bondwise-500" />
						<span className="ml-2">Loading {fileName || "EPUB file"}...</span>
					</div>
				)}

				{!loading && !contentRendered && (
					<div className="flex items-center justify-center h-full">
						<p className="text-muted-foreground">
							Content failed to load properly. Try reopening the book.
						</p>
					</div>
				)}
			</div>

			<div className="flex items-center justify-between p-4 border-t">
				<Button
					onClick={handlePrevPage}
					variant="outline"
					className="flex items-center gap-2"
				>
					<ArrowLeft className="h-4 w-4" /> Previous
				</Button>

				{book && currentLocation && (
					<span className="text-sm text-muted-foreground">
						{book.package?.metadata?.title || fileName}
					</span>
				)}

				<Button
					onClick={handleNextPage}
					variant="outline"
					className="flex items-center gap-2"
				>
					Next <ArrowRight className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
