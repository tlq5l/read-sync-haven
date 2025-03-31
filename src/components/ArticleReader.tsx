import { ReaderContentDisplay } from "@/components/ReaderContentDisplay";
import { ReaderToolbar } from "@/components/ReaderToolbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArticles } from "@/context/ArticleContext";
import { useArticleData } from "@/hooks/useArticleData";
import { useChat } from "@/hooks/useChat";
import { useSummarize } from "@/hooks/useSummarize";
import { cn } from "@/lib/utils";
import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function ArticleReader() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { updateArticleStatus, updateReadingProgress } = useArticles();

	// --- Core Article Data ---
	const { article, loading, error, setArticle } = useArticleData(id);

	// --- UI State ---
	const [fullscreen, setFullscreen] = useState(false);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [fullTextContent, setFullTextContent] = useState<string | null>(null); // Extracted text for features
	const contentRef = useRef<HTMLDivElement>(null); // Ref for scroll tracking HTML content

	// --- Feature Hooks ---
	const { summarize, isSummarizing, summary, summaryError } = useSummarize();
	const {
		chatHistory,
		chatInput,
		setChatInput,
		isChatting,
		chatError,
		handleChatSubmit,
		chatScrollAreaRef,
	} = useChat(fullTextContent); // Pass extracted content to chat hook

	// --- Callbacks ---
	const handleTextExtracted = useCallback((text: string | null) => {
		console.log(
			"Text extracted in ArticleReader:",
			text ? `${text.substring(0, 100)}...` : "null",
		);
		setFullTextContent(text);
	}, []);

	const toggleFavorite = useCallback(() => {
		if (article && id) {
			const newFavoriteStatus = !article.favorite;
			updateArticleStatus(id, true, newFavoriteStatus); // Update in DB via context
			setArticle(
				(
					prev, // Update local state immediately
				) => (prev ? { ...prev, favorite: newFavoriteStatus } : null),
			);
		}
	}, [article, id, updateArticleStatus, setArticle]);

	const toggleFullscreen = useCallback(() => {
		setFullscreen((prev) => !prev);
	}, []);

	const goBack = useCallback(() => {
		navigate(-1);
	}, [navigate]);

	const toggleSidebar = useCallback((open: boolean) => {
		setIsSidebarOpen(open);
	}, []);

	// --- Effects ---
	// Track reading progress for HTML content
	useEffect(() => {
		if (!article || !contentRef.current || article.type !== "article") return; // Only track scroll for standard 'article' type

		const trackProgress = () => {
			if (!contentRef.current) return;

			const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
			// Avoid division by zero or NaN if scrollHeight equals clientHeight
			const scrollableHeight = scrollHeight - clientHeight;
			if (scrollableHeight <= 0) return; // Nothing to scroll

			const progress = Math.min(
				100,
				Math.max(0, Math.floor((scrollTop / scrollableHeight) * 100)), // Ensure progress is between 0 and 100
			);

			// Debounce or throttle this update if performance becomes an issue
			updateReadingProgress(article._id, progress);
		};

		const ref = contentRef.current;
		ref.addEventListener("scroll", trackProgress, { passive: true });

		return () => {
			ref.removeEventListener("scroll", trackProgress);
		};
	}, [article, updateReadingProgress]); // Rerun if article changes

	// --- Render Logic ---
	if (loading) {
		return (
			<div className="container py-8">
				<Skeleton className="h-8 w-3/4 mb-4" />
				<Skeleton className="h-4 w-1/4 mb-8" />
				<div className="space-y-4">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			</div>
		);
	}

	if (error || !article) {
		return (
			<div className="container py-8 text-center">
				<Card className="p-8">
					<h2 className="text-xl font-bold mb-4">Error</h2>
					<p className="mb-6">{error || "Failed to load article"}</p>
					<Button onClick={goBack}>Go Back</Button>
				</Card>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"flex flex-col h-full transition-all",
				fullscreen && "fixed inset-0 z-50 bg-background",
			)}
		>
			<ReaderToolbar
				isFavorite={article.favorite ?? false}
				isFullscreen={fullscreen}
				isSidebarOpen={isSidebarOpen}
				onGoBack={goBack}
				onToggleFavorite={toggleFavorite}
				onToggleFullscreen={toggleFullscreen}
				onToggleSidebar={toggleSidebar}
			/>

			{/* Content Display Area */}
			<ReaderContentDisplay
				article={article}
				contentRef={contentRef} // Pass ref for HTML scroll tracking
				onTextExtracted={handleTextExtracted}
			/>

			{/* Sidebar Sheet */}
			<Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
				<SheetContent side="right" className="w-[400px] sm:w-[540px]">
					<SheetHeader>
						<SheetTitle>Article Details</SheetTitle>
						<SheetDescription /> {/* Keep for accessibility */}
					</SheetHeader>
					<Tabs defaultValue="summary" className="mt-4">
						<TabsList className="grid w-full grid-cols-4">
							<TabsTrigger value="summary">Summary</TabsTrigger>
							<TabsTrigger value="chat">Chat</TabsTrigger>
							<TabsTrigger value="notes">Notes</TabsTrigger>
							<TabsTrigger value="metadata">Metadata</TabsTrigger>
						</TabsList>

						{/* Summary Tab */}
						<TabsContent value="summary" className="mt-4 space-y-4">
							<Button
								onClick={() => {
									if (fullTextContent) {
										summarize(fullTextContent); // Call hook's mutate function
									} else {
										// Handle case where content isn't ready (though button should be disabled)
										console.warn("Summarize clicked but no content available.");
									}
								}}
								disabled={isSummarizing || !fullTextContent}
							>
								{isSummarizing ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : null}
								Summarize Article
							</Button>
							{isSummarizing && (
								<div className="space-y-2">
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-3/4" />
								</div>
							)}
							{summaryError && (
								<p className="text-sm text-destructive">
									Error: {summaryError}
								</p>
							)}
							{summary && (
								<div className="prose prose-sm max-w-none dark:prose-invert">
									<p>{summary}</p>
								</div>
							)}
						</TabsContent>

						{/* Chat Tab */}
						<TabsContent
							value="chat"
							className="mt-4 flex flex-col h-[calc(100vh-200px)]" // Adjust height as needed
						>
							<ScrollArea
								className="flex-1 mb-4 pr-4"
								ref={chatScrollAreaRef} // Use ref from useChat hook
							>
								<div className="space-y-4">
									{chatHistory.map((msg, index) => (
										<div
											key={`${msg.sender}-${index}-${msg.text.substring(0, 10)}`}
											className={cn(
												"p-3 rounded-lg max-w-[80%]",
												msg.sender === "user"
													? "bg-primary text-primary-foreground self-end ml-auto"
													: "bg-muted text-muted-foreground self-start mr-auto",
											)}
										>
											<p className="text-sm whitespace-pre-wrap">{msg.text}</p>
										</div>
									))}
									{isChatting &&
										chatHistory[chatHistory.length - 1]?.sender === "user" && (
											<div className="bg-muted text-muted-foreground self-start mr-auto p-3 rounded-lg max-w-[80%]">
												<Loader2 className="h-4 w-4 animate-spin" />
											</div>
										)}
								</div>
							</ScrollArea>
							{chatError && (
								<p className="text-sm text-destructive mb-2">
									Chat Error: {chatError}
								</p>
							)}
							<form
								onSubmit={handleChatSubmit} // Use handler from useChat hook
								className="flex items-center gap-2"
							>
								<Input
									type="text"
									placeholder={
										fullTextContent
											? "Ask about the content..."
											: "Extracting content..."
									}
									value={chatInput}
									onChange={(e) => setChatInput(e.target.value)} // Use setter from useChat hook
									disabled={isChatting || !fullTextContent}
									className="flex-1"
								/>
								<Button
									type="submit"
									size="icon"
									disabled={isChatting || !chatInput.trim() || !fullTextContent}
								>
									<Send className="h-4 w-4" />
								</Button>
							</form>
						</TabsContent>

						{/* Notes Tab */}
						<TabsContent value="notes" className="mt-4">
							<p>Notes functionality to be added.</p>
						</TabsContent>

						{/* Metadata Tab */}
						<TabsContent value="metadata" className="mt-4">
							<p>Metadata display to be added.</p>
							{/* Example: Display some article metadata */}
							{/* <pre className="text-xs">{JSON.stringify(article, null, 2)}</pre> */}
						</TabsContent>
					</Tabs>
				</SheetContent>
			</Sheet>
		</div>
	);
}
