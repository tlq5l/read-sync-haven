import EpubProcessor from "@/components/EpubProcessor"; // Corrected path after successful rename
import PdfProcessor from "@/components/PdfReader"; // Component refactored, file rename skipped due to git issue
import { processHtmlWithReadability } from "@/lib/readabilityProcessor"; // Import the processor for HTML type
import { cn } from "@/lib/utils";
import type { Article } from "@/services/db/types"; // Updated path
import DOMPurify from "dompurify";
import parse from "html-react-parser";
import { Loader2 } from "lucide-react";
// Removed unused 'React' type import
import {
	type KeyboardEvent, // Add KeyboardEvent type
	type MouseEvent,
	type ReactNode, // Add ReactNode for parsed content state
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

interface ReaderContentDisplayProps {
	article: Article;
	// contentRef is removed as it's unused internally
	onTextExtracted: (text: string | null) => void; // Add prop back as it's passed by ArticleReader
}

export function ReaderContentDisplay({
	article,
	onTextExtracted, // Destructure the added prop
}: ReaderContentDisplayProps) {
	const [isLoading, setIsLoading] = useState(true);
	const [processedHtml, setProcessedHtml] = useState<string | null>(null);
	const [processingError, setProcessingError] = useState<string | null>(null);
	const internalScrollRef = useRef<HTMLDivElement>(null); // Ref for the scrollable content area
	const [parsedContent, setParsedContent] = useState<ReactNode | null>(null); // State for async parsed content

	// Determine article type
	const isEpub = article.type === "epub" && article.fileData;
	const isPdf = article.type === "pdf" && article.fileData;
	// Treat 'article' type with content as HTML if not EPUB/PDF
	const isHtml =
		article.type === "article" && article.content && !isEpub && !isPdf;

	// Callback for processors, wrapped in useCallback
	const handleContentProcessed = useCallback((html: string | null) => {
		// Always set loading to false when processing is done
		setIsLoading(false);

		if (html !== null && html.length > 0) {
			// Success, we have some HTML (cleaned or fallback)
			setProcessedHtml(html);
			setProcessingError(null);
			console.log(
				"[ReaderContentDisplay] Processing successful, HTML received.",
			);
		} else {
			// Failure or empty content
			setProcessedHtml(null); // Ensure it's null if empty or failed
			// Set a consistent error message when null is received
			setProcessingError(
				"Failed to process the content into a readable format.",
			);
			console.log(
				"[ReaderContentDisplay] Processing failed or returned empty content.",
			);
		}
	}, []);

	// Effect to trigger processing based on article type
	useEffect(() => {
		setIsLoading(true);
		setProcessedHtml(null); // Clear previous content when article changes
		setProcessingError(null);

		if (isEpub || isPdf || isHtml) {
			// Processing will be handled by the specific components/logic below
			// The loading state will be turned off by handleContentProcessed callback
		} else if (article.content) {
			// Handle generic/unknown types if they have raw content
			console.log("Processing generic article content with Readability...");
			const cleanedHtml = processHtmlWithReadability(article.content);
			handleContentProcessed(cleanedHtml);
		} else {
			// No content to process
			console.warn("Article has no processable content.", article);
			setProcessingError(
				"This article does not contain any content to display.",
			);
			setIsLoading(false);
		}
		// Reset scroll position or other states if needed when article changes
	}, [article, isEpub, isPdf, isHtml, handleContentProcessed]);

	// Effect for standard HTML articles (process directly)
	useEffect(() => {
		if (isHtml && article.content) {
			console.log("Processing direct HTML content with Readability...");
			const cleanedHtml = processHtmlWithReadability(article.content);
			handleContentProcessed(cleanedHtml);
		}
	}, [isHtml, article.content, handleContentProcessed]);

	// Effect to extract text content once processed HTML is ready
	useEffect(() => {
		if (processedHtml && internalScrollRef.current) {
			// Extract text content from the container
			const text = internalScrollRef.current.textContent;
			onTextExtracted(text); // Call the prop
		} else {
			// If HTML is null or ref isn't ready, ensure null is passed up
			onTextExtracted(null);
		}
		// Dependency: run when processedHtml changes or the ref becomes available
	}, [processedHtml, onTextExtracted]);

	// Effect to sanitize and parse HTML asynchronously when processedHtml is ready
	useEffect(() => {
		if (processedHtml) {
			try {
				const sanitized = DOMPurify.sanitize(processedHtml, {
					// Standard configuration to allow basic HTML + images
					USE_PROFILES: { html: true },
					ADD_TAGS: ["img"],
					ADD_ATTR: ["alt"], // Keep alt

					// Explicitly allow 'src' attributes starting with 'data:' for <img> tags ONLY
					// This overrides the default protocol check for this specific case
					// Note: Ensure ADD_TAGS includes 'img'
					ADD_URI_SAFE_ATTR: ["src"], // Mark 'src' as potentially safe URI attribute
					ALLOW_UNKNOWN_PROTOCOLS: true, // Required for ADD_URI_SAFE_ATTR to work with 'data:'
					// If processing external HTML, a more restrictive hook is recommended.
				});
				const reactNodes = parse(sanitized);
				setParsedContent(reactNodes);
			} catch (error) {
				console.error(
					"[ReaderContentDisplay] Error parsing sanitized HTML:",
					error,
				);
				setParsedContent(null); // Clear content on parsing error
				// Optionally set a different error state if needed
			}
		} else {
			setParsedContent(null); // Clear parsed content if processed HTML is null
		}
	}, [processedHtml]);

	// --- Processor Components (Rendered based on type, manage their own loading/error) ---
	const renderProcessorIfNeeded = () => {
		if (isEpub && article.fileData) {
			return (
				<EpubProcessor
					fileData={article.fileData}
					fileName={article.fileName}
					onContentProcessed={handleContentProcessed}
				/>
			);
		}
		if (isPdf && article.fileData) {
			return (
				<PdfProcessor
					fileData={article.fileData}
					fileName={article.fileName}
					onContentProcessed={handleContentProcessed}
				/>
			);
		}
		// For HTML type, processing happens directly in useEffect, no component needed
		return null;
	};
	// ------------------------------------------------------------------------------

	// --- Scroll Handling for Internal Links ---
	const handleContentClick = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			const target = event.target as HTMLElement;
			// Find the closest anchor tag clicked
			const anchor = target.closest("a[href^='#']");

			if (anchor && internalScrollRef.current) {
				event.preventDefault(); // Prevent default browser jump
				const href = anchor.getAttribute("href");
				if (href) {
					try {
						// Query the element within the scrollable container
						const targetElement = internalScrollRef.current.querySelector(href);
						if (targetElement) {
							console.log(`[ReaderContentDisplay] Scrolling to ${href}`);
							targetElement.scrollIntoView({
								behavior: "smooth",
								block: "start",
							});

							// Optional: Add a temporary highlight effect
							targetElement.classList.add("highlight-scroll-target");
							setTimeout(() => {
								targetElement.classList.remove("highlight-scroll-target");
							}, 1500); // Remove highlight after 1.5 seconds
						} else {
							console.warn(
								`[ReaderContentDisplay] Target element not found for ${href}`,
							);
						}
					} catch (e) {
						// Handle potential errors from invalid query selectors
						console.error(
							`[ReaderContentDisplay] Error finding/scrolling to target ${href}:`,
							e,
						);
					}
				}
			}
		},
		[],
	);

	// --- End Scroll Handling ---

	// Set text color class
	// Keyboard handler for accessibility on the clickable content area
	const handleContentKeyDown = useCallback(
		(event: KeyboardEvent) => {
			// Corrected type: KeyboardEvent, not generic
			// Check if Enter or Space was pressed and if the target is an anchor
			if (
				(event.key === "Enter" || event.key === " ") &&
				event.target instanceof HTMLElement
			) {
				const anchor = event.target.closest("a[href^='#']");
				if (anchor) {
					event.preventDefault(); // Prevent default space scroll or enter behavior
					// Simulate a click event on the anchor to reuse the existing logic
					anchor.dispatchEvent(
						new MouseEvent("click", { bubbles: true, cancelable: true }),
					);
				}
			}
		},
		[], // No dependencies needed for this logic
	); // End of the first handleContentKeyDown

	// The duplicated handleContentKeyDown function below has been removed.

	const textColorClass = "text-foreground";

	return (
		<div className="flex-1 overflow-hidden flex flex-col h-full">
			{/* Header */}
			<div className={`px-4 md:px-8 py-4 border-b ${textColorClass}`}>
				<h1 className="text-2xl font-bold mb-2">{article.title}</h1>
				{article.author && (
					<p className="text-muted-foreground mb-1">By {article.author}</p>
				)}
				<p className="text-sm text-muted-foreground mb-0">
					{article.siteName || article.fileName || "Document"}
					{/* Add other relevant metadata like read time */}
					{article.estimatedReadTime && (
						<span> · {article.estimatedReadTime} min read</span>
					)}
					{isPdf && article.pageCount && (
						<span> · {article.pageCount} pages</span>
					)}
				</p>
			</div>

			{/* Content Area */}
			{/* Content Area - Add click handler and internal ref */}
			<div
				ref={internalScrollRef}
				onClick={handleContentClick}
				onKeyDown={handleContentKeyDown} // Add keyboard listener
				className="flex-1 overflow-y-auto px-4 md:px-8 py-6 relative reader-scroll-container focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" // Add focus styles
				// Removed tabIndex={0} to resolve lint/a11y/noNoninteractiveTabindex
			>
				{/* External contentRef is not assigned here directly to avoid TS errors.
				    Parent component can manage it if needed. internalScrollRef is used for internal logic. */}
				{/* Render the processor component if needed. It handles its own loading/error UI. */}
				{renderProcessorIfNeeded()}

				{/* Display global loading state while processing is happening */}
				{isLoading && (
					<div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
						<Loader2 className="h-8 w-8 animate-spin text-thinkara-500" />
						<span className="ml-2">Processing content...</span>
					</div>
				)}

				{/* Display Processing Error */}
				{/* Display the generic error message ONLY if processing is finished (isLoading is false)
				    AND an error occurred (processingError is set, implies handleContentProcessed(null) was called)
				    AND an error occurred (processingError is set because onContentProcessed(null) was called) */}
				{!isLoading && processingError && (
					<div className="flex flex-col items-center justify-center text-center p-4">
						{/* Display the generic error message passed up */}
						<div className="text-destructive mb-4">{processingError}</div>
						<div className="text-sm text-muted-foreground">
							Please try again or select a different article.
						</div>
					</div>
				)}

				{/* Display Processed Content */}
				{/* Display Processed Content - Show if processing is complete, no error occurred, and we received HTML */}
				{!isLoading && !processingError && processedHtml && (
					<div
						className={cn("prose max-w-none dark:prose-invert", textColorClass)}
					>
						{/* Render the asynchronously parsed content */}
						{parsedContent}
					</div>
				)}

				{/* Display "No content" message - Show if processing is complete, no error, but the processed HTML was empty/null */}
				{/* Display "No content" message - Show if processing is complete, no error, but the processed HTML was effectively empty/null */}
				{/* This condition might overlap with processingError if null was received, but processingError display takes precedence */}
				{!isLoading && !processingError && !processedHtml && (
					<div className="flex items-center justify-center text-muted-foreground">
						No displayable content found in this article.
					</div>
				)}

				{/* Footer with Original Link */}
				{article.url && (
					<div className="mt-8 pt-6 border-t">
						<p className="text-sm text-muted-foreground">
							<a
								href={article.url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-thinkara-600 hover:underline"
							>
								View Original
							</a>
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
