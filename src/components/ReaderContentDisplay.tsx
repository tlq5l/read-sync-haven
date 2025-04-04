import EpubReader from "@/components/EpubReader";
import PdfReader from "@/components/PdfReader";
import { cn } from "@/lib/utils";
import type { Article } from "@/services/db"; // Use import type
import DOMPurify from "dompurify";
import parse from "html-react-parser";
import type React from "react"; // Use import type for default
import { useEffect, useRef } from "react"; // Keep named imports separate

interface ReaderContentDisplayProps {
	article: Article;
	contentRef: React.RefObject<HTMLDivElement>; // For HTML content scroll tracking
	onTextExtracted: (text: string | null) => void;
}

export function ReaderContentDisplay({
	article,
	contentRef,
	onTextExtracted,
}: ReaderContentDisplayProps) {
	const internalContentRef = useRef<HTMLDivElement | null>(null); // Ref for HTML content div

	// Determine article type
	const isEpub = article.type === "epub" && article.fileData;
	const isPdf = article.type === "pdf" && article.fileData;

	// Effect to extract text from HTML content once it's rendered
	useEffect(() => {
		if (!isEpub && !isPdf && internalContentRef.current) {
			// Extract text only for HTML articles after render
			onTextExtracted(internalContentRef.current.textContent);
		}
		// Run only when article type changes or ref becomes available
	}, [isEpub, isPdf, onTextExtracted]);

	// Set text color class (assuming this might be needed later or passed down)
	const textColorClass = "text-foreground";

	if (isEpub && article.fileData) {
		// Render EPUB Reader
		return (
			<div
				className="flex-1 overflow-hidden flex flex-col" // Removed inline style for height calculation
			>
				<div className={`px-4 md:px-8 py-4 border-b ${textColorClass}`}>
					<h1 className="text-2xl font-bold mb-2">{article.title}</h1>
					{article.author && (
						<p className="text-muted-foreground mb-1">By {article.author}</p>
					)}
					<p className="text-sm text-muted-foreground mb-0">
						{article.fileName || "EPUB Book"}
						{article.estimatedReadTime && (
							<span> · {article.estimatedReadTime} min read</span>
						)}
					</p>
				</div>
				<div className="flex-1 overflow-hidden relative">
					<EpubReader
						fileData={article.fileData}
						fileName={article.fileName}
						onTextExtracted={onTextExtracted} // Pass callback
					/>
				</div>
			</div>
		);
	}

	if (isPdf && article.fileData) {
		// Render PDF Reader
		return (
			<div
				className="flex-1 overflow-hidden flex flex-col" // Removed inline style for height calculation
			>
				<div className={`px-4 md:px-8 py-4 border-b ${textColorClass}`}>
					<h1 className="text-2xl font-bold mb-2">{article.title}</h1>
					{article.author && (
						<p className="text-muted-foreground mb-1">By {article.author}</p>
					)}
					<p className="text-sm text-muted-foreground mb-0">
						{article.fileName || "PDF Document"}
						{article.pageCount && <span> · {article.pageCount} pages</span>}
						{article.estimatedReadTime && (
							<span> · {article.estimatedReadTime} min read</span>
						)}
					</p>
				</div>
				<div className="flex-1 overflow-hidden relative">
					<PdfReader
						fileData={article.fileData}
						fileName={article.fileName}
						onTextExtracted={onTextExtracted} // Pass callback
					/>
				</div>
			</div>
		);
	}

	// Render standard HTML content
	return (
		<div
			ref={(node) => {
				// Assign to both refs: one for scroll tracking, one for text extraction
				if (contentRef) {
					(
						contentRef as React.MutableRefObject<HTMLDivElement | null>
					).current = node;
				}
				internalContentRef.current = node;
			}}
			className={cn(
				"flex-1 overflow-y-auto px-4 md:px-8 py-6", // Use regular string
				textColorClass,
			)}
		>
			<div className="reader-content">
				<h1 className="text-3xl font-bold mb-4">{article.title}</h1>
				{article.author && (
					<p className="text-muted-foreground mb-1">By {article.author}</p>
				)}
				<p className="text-sm text-muted-foreground mb-6">
					{article.siteName}
					{article.estimatedReadTime && (
						<span> · {article.estimatedReadTime} min read</span>
					)}
				</p>

				<div className="prose max-w-none dark:prose-invert">
					{/* Ensure content exists before parsing */}
					{article.content && parse(DOMPurify.sanitize(article.content))}
				</div>

				<div className="mt-8 pt-6 border-t">
					<p className="text-sm text-muted-foreground">
						<a
							href={article.url}
							target="_blank"
							rel="noopener noreferrer"
							className="text-bondwise-600 hover:underline"
						>
							View Original
						</a>
					</p>
				</div>
			</div>
		</div>
	);
}
