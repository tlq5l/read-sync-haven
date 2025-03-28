import { Button } from "@/components/ui/button";
import { base64ToArrayBuffer } from "@/services/epub";
import type { Book, Rendition } from "epubjs";
import ePub from "epubjs";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface EpubReaderProps {
	fileData: string;
	fileName?: string;
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
}

export default function EpubReader({ fileData, fileName }: EpubReaderProps) {
	const [book, setBook] = useState<Book | null>(null);
	const [rendition, setRendition] = useState<ExtendedRendition | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const viewerRef = useRef<HTMLDivElement>(null);
	const [currentLocation, setCurrentLocation] = useState<string | null>(null);
	const [contentRendered, setContentRendered] = useState(false);

	// Initialize the EPUB book
	useEffect(() => {
		if (!fileData || !viewerRef.current) return;

		let epubBook: Book | null = null;

		try {
			setLoading(true);
			setContentRendered(false);

			// Convert base64 to ArrayBuffer
			const arrayBuffer = base64ToArrayBuffer(fileData);

			// Create EPUB book instance
			epubBook = ePub(arrayBuffer);
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
							flow: "scrolled", // Simple scrolled view
							ignoreClass: "annotator-hl",
							spread: "none",
							manager: "continuous", // Add continuous manager for better scrolling
						},
					) as ExtendedRendition;

					// Add CSS to make EPUB content scrollable
					const style = document.createElement("style");
					style.innerHTML = `
						.epub-container {
							min-height: 100%;
							height: auto !important;
						}
						.epub-view {
							height: auto !important;
							min-height: 100vh;
							overflow: auto !important;
						}
						.epub-view iframe {
							height: 100% !important;
							overflow: auto !important;
							border: none !important;
						}
					`;
					document.head.appendChild(style);

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

						// Log book display success
						console.log("EPUB content displayed successfully");

						// Function to apply styles to iframes
						const applyIframeStyles = () => {
							// Apply styles to make content scrollable
							const iframes = viewerRef.current?.querySelectorAll("iframe");
							if (iframes?.length) {
								// Use for...of instead of forEach per linter
								for (const iframe of Array.from(iframes)) {
									// Set iframe styles
									iframe.style.border = "0";
									iframe.style.width = "100%";
									iframe.style.height = "100%";
									iframe.style.minHeight = "600px"; // Ensure tall enough to scroll
									iframe.style.overflow = "auto";

									// Force scroll setting on content document
									try {
										const doc =
											iframe.contentDocument || iframe.contentWindow?.document;
										if (doc?.body) {
											// Set body styles
											doc.body.style.overflow = "auto";
											doc.body.style.height = "auto";
											doc.body.style.minHeight = "100%";
											doc.body.style.width = "100%";
											doc.body.style.maxWidth = "100%";

											// Add listener for document clicks to detect if user is inside iframe
											doc.addEventListener("click", () => {
												console.log("Content document clicked");
											});
										}
									} catch (e) {
										console.warn("Could not access iframe content document", e);
									}
								}
							}
						};

						// Apply styles initially
						applyIframeStyles();

						// And again after a short delay to ensure everything is loaded
						setTimeout(applyIframeStyles, 500);
					});

					// Store rendition for navigation
					setRendition(epubRendition);

					// Track location changes using optional chaining
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

						// Force re-check iframe styles after render
						setTimeout(() => {
							const newIframes = viewerRef.current?.querySelectorAll("iframe");
							if (newIframes?.length) {
								for (const iframe of Array.from(newIframes)) {
									iframe.style.height = "100%";
									iframe.style.overflow = "auto";

									// Check if we can modify iframe content directly
									try {
										if (iframe.contentWindow && iframe.contentDocument?.body) {
											iframe.contentDocument.body.style.overflow = "auto";
										}
									} catch (e) {
										// CORS might prevent access
									}
								}
							}
						}, 200);
					});
				})
				.catch((err) => {
					console.error("Error rendering EPUB:", err);
					setError("Failed to render EPUB file. Please try again.");
					setLoading(false);
				});
		} catch (err) {
			console.error("Error initializing EPUB:", err);
			setError(
				"Failed to initialize EPUB reader. The file might be corrupted.",
			);
			setLoading(false);
		}

		// Cleanup function
		return () => {
			if (epubBook) {
				try {
					epubBook.destroy();
				} catch (err) {
					console.error("Error destroying EPUB book:", err);
				}
			}

			// Remove the style element if it exists
			const epubStyles = document.querySelectorAll("style");
			for (const styleEl of Array.from(epubStyles)) {
				if (styleEl.innerHTML.includes(".epub-container")) {
					styleEl.remove();
				}
			}
		};
	}, [fileData]);

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
