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
import { useChat } from "@/hooks/useChat"; // Rename imported ChatMessage if needed
import { useChatHistory } from "@/hooks/useChatHistory";
import { useSummarize } from "@/hooks/useSummarize";
import { cn } from "@/lib/utils";
import { debounce } from "lodash"; // Import debounce
import { Loader2, Send } from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
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
	} = useChat(fullTextContent); // Pass extracted content to chat hook (Existing active chat)
	const {
		messages: historyMessages,
		addMessage: addMessageHistory,
		isLoading: isLoadingHistory,
		error: historyError,
	} = useChatHistory(id || ""); // Instantiate the history hook, provide default empty string for id if undefined initially

	// --- Callbacks ---
	const handleTextExtracted = useCallback((text: string | null) => {
		console.log(
			"Text extracted in ArticleReader:",
			text ? `${text.substring(0, 100)}...` : "null",
		);
		setFullTextContent(text);
		console.log(
			"Updated fullTextContent:",
			text ? `${text.substring(0, 100)}...` : text, // Apply fix here
		);
	}, []);

	const toggleFavorite = useCallback(() => {
		if (article && id) {
			const newFavoriteStatus = !article.favorite;
			updateArticleStatus(id, { favorite: newFavoriteStatus }); // Update in DB via context
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
	const lastProcessedAiContent = useRef<string | null>(null); // Ref to track last saved AI message content

	// --- Effects ---
	// Track reading progress for HTML content
	useEffect(() => {
		if (!article || !contentRef.current || article.type !== "article") return;

		// Debounce the progress update function
		const debouncedUpdateProgress = debounce((progress: number) => {
			updateReadingProgress(article._id, progress);
		}, 500); // Debounce by 500ms

		const trackProgress = () => {
			if (!contentRef.current) return;

			const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
			const scrollableHeight = scrollHeight - clientHeight;
			if (scrollableHeight <= 0) return;

			const progress = Math.min(
				100,
				Math.max(0, Math.floor((scrollTop / scrollableHeight) * 100)),
			);

			// Call the debounced function
			debouncedUpdateProgress(progress);
		};

		const ref = contentRef.current;
		ref.addEventListener("scroll", trackProgress, { passive: true });

		return () => {
			ref.removeEventListener("scroll", trackProgress);
			debouncedUpdateProgress.cancel(); // Cancel any pending debounced calls on cleanup
		};
		// Ensure debounce is recreated if dependencies change, though unlikely here
	}, [article, updateReadingProgress]);

	// Effect to save AI responses to history when they appear in the active chat
	useEffect(() => {
		if (!id) return; // Ensure we have an article ID

		const latestChatMessage =
			chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;

		if (latestChatMessage && latestChatMessage.sender === "ai") {
			// Check if this AI message (based on content) is different from the last one we processed
			if (latestChatMessage.text !== lastProcessedAiContent.current) {
				// Check if it *likely* already exists in historyMessages (simple content check for recent items)
				// This isn't foolproof without IDs but prevents rapid duplicates.
				const likelyExists = historyMessages.slice(-5).some(
					// Check recent 5 history items
					(histMsg) =>
						histMsg.sender === "ai" &&
						histMsg.content === latestChatMessage.text,
				);

				if (!likelyExists) {
					console.log(
						"Attempting to save new AI message to history:",
						`${latestChatMessage.text.substring(0, 50)}...`,
					);
					addMessageHistory({
						articleId: id,
						sender: "ai",
						content: latestChatMessage.text,
					})
						.then((newId) => {
							console.log("AI message saved to history with ID:", newId);
							lastProcessedAiContent.current = latestChatMessage.text; // Mark as processed
						})
						.catch((err) => {
							console.error("Failed to save AI message to history:", err);
							// Optional: Potentially clear lastProcessedAiContent.current if saving failed?
						});
				} else {
					// It likely exists or is the same as the last processed one, update the ref anyway
					lastProcessedAiContent.current = latestChatMessage.text;
				}
			}
		}
		// Dependencies: chatHistory to react to new messages, historyMessages to check for existence, addMessageHistory function, id
	}, [chatHistory, historyMessages, addMessageHistory, id]);

	// Wrapper for chat submission to include saving to history
	const handleChatSubmitWithHistory = async (
		event: FormEvent<HTMLFormElement>,
	) => {
		event.preventDefault(); // Prevent default form submission
		if (!chatInput.trim() || !id) return; // Ensure id and input exist

		const userMessageContent = chatInput; // Capture input before it might be cleared by original handler

		try {
			// 1. Save user message to history database FIRST
			await addMessageHistory({
				articleId: id,
				sender: "user",
				content: userMessageContent,
			});
			console.log("User message saved to history");

			// 2. Call the original chat submission logic from useChat hook
			// This will likely clear the input field and add the user message to the *active* chat state
			await handleChatSubmit(event); // Pass the event if the original handler needs it
		} catch (error) {
			console.error("Error during chat submission or history saving:", error);
			// TODO: Consider showing a user-facing error message
		}
	};

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
				// contentRef is no longer passed as ReaderContentDisplay uses an internal ref
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
						<TabsList className="grid w-full grid-cols-3">
							{" "}
							{/* Changed to 3 cols */}
							<TabsTrigger value="summary">Summary</TabsTrigger>
							<TabsTrigger value="chat">Chat</TabsTrigger>
							<TabsTrigger value="history">History</TabsTrigger>{" "}
							{/* Added History Trigger */}
						</TabsList>

						{/* Summary Tab */}
						<TabsContent value="summary" className="mt-4 space-y-4">
							<Button
								onClick={() => {
									// Check if content is valid (not null, not empty, not the placeholder)
									if (fullTextContent && fullTextContent !== "View Original") {
										summarize(fullTextContent); // Call hook's mutate function
									} else {
										// Handle case where content isn't ready (though button should be disabled)
										console.warn("Summarize clicked but no content available.");
									}
								}}
								disabled={
									isSummarizing ||
									!fullTextContent ||
									fullTextContent === "View Original"
								}
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
								<div className="prose prose-sm max-w-none dark:prose-invert overflow-y-auto max-h-[800px]">
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
									Chat Error: {chatError?.message}{" "}
									{/* Display the error message */}
								</p>
							)}
							<form
								onSubmit={handleChatSubmitWithHistory} // Use the new wrapper handler
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
					</Tabs>

					{/* History Tab */}
					<TabsContent
						value="history"
						className="mt-4 flex flex-col h-[calc(100vh-200px)]" // Adjust height as needed
					>
						<ScrollArea className="flex-1 mb-4 pr-4">
							{isLoadingHistory && (
								<p className="text-sm text-muted-foreground">
									Loading history...
								</p>
							)}
							{historyError && (
								<p className="text-sm text-destructive">
									History Error: {historyError}
								</p>
							)}
							{!isLoadingHistory &&
								!historyError &&
								historyMessages.length === 0 && (
									<p className="text-sm text-muted-foreground text-center py-4">
										No chat history found for this article.
									</p>
								)}
							{!isLoadingHistory &&
								!historyError &&
								historyMessages.length > 0 && (
									<div className="space-y-4">
										{historyMessages.map((msg) => (
											<div
												key={msg.messageId} // Use the unique ID from the history hook
												className={cn(
													"p-3 rounded-lg max-w-[80%] break-words", // Added break-words
													msg.sender === "user"
														? "bg-primary text-primary-foreground self-end ml-auto"
														: "bg-muted text-muted-foreground self-start mr-auto",
												)}
											>
												<p className="text-sm whitespace-pre-wrap">
													{msg.content}
												</p>
												{/* Optional: Display timestamp */}
												<p className="text-xs text-muted-foreground/60 mt-1 text-right">
													{new Date(msg.timestamp).toLocaleTimeString([], {
														hour: "2-digit",
														minute: "2-digit",
													})}
												</p>
											</div>
										))}
									</div>
								)}
						</ScrollArea>
					</TabsContent>
				</SheetContent>
			</Sheet>
		</div>
	);
}
