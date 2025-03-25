import { base64ToArrayBuffer } from "@/services/pdf";
import {
	ChevronLeft,
	ChevronRight,
	Loader2,
	Search,
	ZoomIn,
	ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

// Note: In a real implementation, you would use a PDF library like react-pdf
// For now, we'll create a simple viewer that displays the PDF using browser's built-in PDF viewer

interface PdfReaderProps {
	fileData: string;
	fileName?: string;
}

export default function PdfReader({ fileData, fileName }: PdfReaderProps) {
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [objectUrl, setObjectUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!fileData) {
			setError("No PDF data provided");
			setIsLoading(false);
			return undefined;
		}

		try {
			// Convert base64 to ArrayBuffer
			const arrayBuffer = base64ToArrayBuffer(fileData);

			// Create a Blob from the ArrayBuffer
			const blob = new Blob([arrayBuffer], { type: "application/pdf" });

			// Create an object URL for the Blob
			const url = URL.createObjectURL(blob);
			setObjectUrl(url);
			setIsLoading(false);

			// Clean up the URL when the component unmounts
			return () => {
				if (url) URL.revokeObjectURL(url);
			};
		} catch (err) {
			console.error("Error processing PDF:", err);
			setError("Failed to load PDF file");
			setIsLoading(false);
			return undefined;
		}
	}, [fileData]);

	// Handle iframe load event
	const handleIframeLoad = () => {
		setIsLoading(false);
	};

	// Handle iframe error event
	const handleIframeError = () => {
		setError("Failed to load PDF viewer");
		setIsLoading(false);
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<Loader2 className="h-8 w-8 animate-spin text-bondwise-500" />
				<span className="ml-2">Loading PDF...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-full">
				<div className="text-red-500 mb-4">{error}</div>
				<p className="text-muted-foreground mb-4">
					There was a problem loading this PDF file.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			{/* PDF viewer controls */}
			<div className="flex items-center justify-between p-2 border-b bg-muted/30">
				<div className="flex items-center space-x-2">
					<Button variant="ghost" size="icon" title="Previous page">
						<ChevronLeft className="h-4 w-4" />
					</Button>
					<Button variant="ghost" size="icon" title="Next page">
						<ChevronRight className="h-4 w-4" />
					</Button>
				</div>
				<div className="flex items-center space-x-2">
					<Button variant="ghost" size="icon" title="Zoom out">
						<ZoomOut className="h-4 w-4" />
					</Button>
					<Button variant="ghost" size="icon" title="Zoom in">
						<ZoomIn className="h-4 w-4" />
					</Button>
					<Button variant="ghost" size="icon" title="Search">
						<Search className="h-4 w-4" />
					</Button>
				</div>
			</div>

			{/* PDF content */}
			<div className="flex-1 overflow-hidden">
				{objectUrl && (
					<iframe
						ref={iframeRef}
						src={objectUrl}
						className="w-full h-full border-0"
						title={fileName || "PDF Document"}
						onLoad={handleIframeLoad}
						onError={handleIframeError}
					/>
				)}
			</div>
		</div>
	);
}
