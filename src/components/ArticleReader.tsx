import { ApiConfigurator } from "@/components/ApiConfigurator";
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
import { useApiConfig } from "@/hooks/useApiConfig";
import { useArticleData } from "@/hooks/useArticleData";
import { useChat } from "@/hooks/useChat";
// Import necessary types from useChatHistory
import {
	type ChatMessage,
	type ChatSessionMetadata,
	useChatHistory,
} from "@/hooks/useChatHistory";
import { useSummarize } from "@/hooks/useSummarize";
import { cn } from "@/lib/utils";
import { debounce } from "lodash";
import { Copy, Loader2, Send, Trash2 } from "lucide-react"; // Added Copy and Trash2 icons
import {
	// FormEvent is no longer needed as handleChatSubmitWithHistory was removed
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner"; // Import toast for feedback

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

	const [activeTab, setActiveTab] = useState("summary"); // State for controlling the Tabs

	// --- Feature Hooks ---
	const { summarize, isSummarizing, summary, summaryError } = useSummarize();
	// Updated useChatHistory hook usage
	// Updated useChatHistory hook usage
	const {
		sessions,
		selectedSessionId,
		selectedSessionMessages,
		setSelectedSessionId,
		createNewSession,
		addMessageToSession,
		deleteSession,
		isLoading: isLoadingHistory, // Renamed from isLoadingSessions/isLoadingMessages
		isUpdating: isUpdatingHistory, // New state for background updates
		error: historyError,
	} = useChatHistory(id || null);
	const { apiConfig, setApiConfig, availableProviders } = useApiConfig();

	// --- Integrate Chat and History ---
	// Prepare props for useChat hook
	const historyIntegrationProps = {
		articleId: id || null,
		selectedSessionId,
		setSelectedSessionId,
		selectedSessionMessages,
		createNewSession,
		addMessageToSession,
	};

	// Initialize useChat with history integration
	const {
		chatHistory, // Active chat UI state from useChat
		chatInput,
		setChatInput,
		isChatting,
		chatError,
		handleChatSubmit, // Use the correct submit handler from the updated hook
		chatScrollAreaRef, // Ref for scrolling the active chat
	} = useChat(
		fullTextContent,
		historyIntegrationProps, // Pass history props object
		// REMOVED: Callback to switch to history tab on AI response settled
	);

	// --- Callbacks ---
	const handleTextExtracted = useCallback((text: string | null) => {
		setFullTextContent(text);
	}, []);

	const toggleFavorite = useCallback(() => {
		if (article && id) {
			const newFavoriteStatus = !article.favorite;
			updateArticleStatus(id, { favorite: newFavoriteStatus });
			setArticle((prev) =>
				prev ? { ...prev, favorite: newFavoriteStatus } : null,
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

	const handleCopyChat = useCallback(async () => {
		if (!selectedSessionMessages || selectedSessionMessages.length === 0) {
			toast.error("No messages in the selected session to copy.");
			return;
		}

		const formattedChat = selectedSessionMessages
			.map(
				(msg) =>
					`[${msg.sender === "ai" ? "AI" : "User"} - ${new Date(msg.timestamp).toLocaleString()}]:\n${msg.content}`,
			)
			.join("\n\n");

		try {
			await navigator.clipboard.writeText(formattedChat);
			toast.success("Chat copied to clipboard!");
		} catch (err) {
			console.error("Failed to copy chat:", err);
			toast.error("Failed to copy chat to clipboard.");
		}
	}, [selectedSessionMessages]);

	const handleDeleteSession = useCallback(
		async (sessionIdToDelete: string) => {
			if (!sessionIdToDelete) return;
			// Optional: Add confirmation dialog here
			try {
				const success = await deleteSession(sessionIdToDelete);
				if (success) {
					toast.success("Chat session deleted.");
				} else {
					// Error is handled internally by the hook now, but we might want general feedback
					toast.error("Failed to delete session. Check console for details.");
				}
			} catch (err) {
				// Catch unexpected errors during the await/call itself
				console.error("Unexpected error calling deleteSession:", err);
				toast.error(
					"An unexpected error occurred while trying to delete the session.",
				);
			}
		},
		[deleteSession], // Keep dependency on the function itself
	);

	// --- Effects ---
	// Track reading progress for HTML content
	useEffect(() => {
		if (!article || !contentRef.current || article.type !== "article") return;
		const debouncedUpdateProgress = debounce((progress: number) => {
			if (article?._id) {
				// Use optional chaining as suggested by lint
				// Check article exists before accessing _id
				// Ensure _id exists
				updateReadingProgress(article._id, progress);
			}
		}, 500);
		const trackProgress = () => {
			if (!contentRef.current) return;
			const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
			const scrollableHeight = scrollHeight - clientHeight;
			if (scrollableHeight <= 0) return;
			const progress = Math.min(
				100,
				Math.max(0, Math.floor((scrollTop / scrollableHeight) * 100)),
			);
			debouncedUpdateProgress(progress);
		};
		const ref = contentRef.current;
		ref.addEventListener("scroll", trackProgress, { passive: true });
		return () => {
			ref.removeEventListener("scroll", trackProgress);
			debouncedUpdateProgress.cancel();
		};
	}, [article, updateReadingProgress]); // Removed contentRef from dependencies as it's a ref

	// REMOVED: Effect to save AI responses manually (lines 142-185 in original)
	// This logic needs to be integrated into useChat when addMessageToSession is called.

	// UPDATED: Chat submission wrapper (temporary - will be fully handled by useChat)
	// For now, just call the original handler. History saving is triggered inside useChat.
	// The handleChatSubmit logic is now inside useChat, so we just call it directly.
	// This wrapper is no longer needed.
	// const handleChatSubmitWithHistory = ... (removed)

	// --- Render Logic ---
	if (loading) {
		// ... loading skeleton ... (unchanged)
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
		// ... error display ... (unchanged)
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
			{/* API Configurator Section Removed - Moved to Sidebar */}

			{/* Content Display Area */}
			<ReaderContentDisplay
				ref={contentRef} // Pass ref here for scroll tracking
				article={article}
				onTextExtracted={handleTextExtracted}
			/>

			{/* Sidebar Sheet */}
			<Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
				<SheetContent
					side="right"
					className="w-[400px] sm:w-[540px] flex flex-col"
				>
					{" "}
					{/* Added flex flex-col */}
					<SheetHeader>
						<SheetTitle>Article Features</SheetTitle> {/* Changed Title */}
						<SheetDescription />
					</SheetHeader>
					<Tabs
						value={activeTab}
						onValueChange={setActiveTab}
						className="mt-4 flex-1 flex flex-col"
					>
						{" "}
						{/* Added flex-1 flex flex-col */}
						<TabsList className="grid w-full grid-cols-4">
							{" "}
							{/* Updated to 4 columns */}
							<TabsTrigger value="summary">Summary</TabsTrigger>
							<TabsTrigger value="chat">Chat</TabsTrigger>
							<TabsTrigger value="history">History</TabsTrigger>
							<TabsTrigger value="settings">AI Settings</TabsTrigger>{" "}
							{/* Added Settings Tab */}
						</TabsList>
						{/* Summary Tab */}
						<TabsContent
							value="summary"
							className="mt-4 space-y-4 flex-1 overflow-y-auto"
						>
							{" "}
							{/* Added flex-1 overflow-y-auto */}
							{/* ... summary content ... (unchanged) */}
							<Button
								onClick={() => {
									if (fullTextContent && fullTextContent !== "View Original") {
										summarize(fullTextContent);
									} else {
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
								<div className="prose prose-sm max-w-none dark:prose-invert overflow-y-auto max-h-[calc(100vh-300px)]">
									{" "}
									{/* Adjust max-h */}
									<p>{summary}</p>
								</div>
							)}
						</TabsContent>
						{/* Chat Tab */}
						<TabsContent
							value="chat"
							className="mt-4 flex flex-col flex-1 overflow-hidden h-full" // Added h-full, Added overflow-hidden
						>
							<ScrollArea
								className="flex-grow min-h-0 pr-4" // Changed flex-1 to flex-grow
								ref={chatScrollAreaRef}
							>
								{" "}
								{/* Added min-h-0 */}
								<div className="space-y-4">
									{/* This displays the *active* chat from useChat */}
									{/* Type assertion needed if useChat's message type differs */}
									{chatHistory.map((msg: any, index: number) => (
										<div
											// Ensure key is unique, combining index and content snippet might be safer
											key={`chat-${index}-${msg.text?.substring(0, 10)}`}
											className={cn(
												"p-3 rounded-lg max-w-[80%]",
												msg.sender === "user"
													? "bg-primary text-primary-foreground self-end ml-auto"
													: "bg-muted text-muted-foreground self-start mr-auto",
											)}
										>
											{/* Assuming msg.text exists, adjust if structure is different */}
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
									Chat Error: {chatError?.message}
								</p>
							)}
							<form
								onSubmit={handleChatSubmit} // Use the handler directly from useChat
								className="flex items-center gap-2 p-2" // Added padding
							>
								<Input
									type="text"
									placeholder={
										fullTextContent
											? "Ask about the content..."
											: "Extracting content..."
									}
									value={chatInput}
									onChange={(e) => setChatInput(e.target.value)}
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
						{/* History Tab */}
						<TabsContent
							value="history"
							className="mt-4 flex flex-col flex-1" // Use flex-1
						>
							{/* Session List */}
							<div className="mb-4 border-b pb-2">
								<h4 className="text-sm font-medium mb-2">Saved Sessions</h4>
								{isLoadingHistory && ( // Use isLoadingHistory
									<div className="flex items-center justify-center py-2">
										<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
										<span className="ml-2 text-sm text-muted-foreground">
											Loading sessions...
										</span>
									</div>
								)}
								{!isLoadingHistory &&
									sessions.length === 0 &&
									!historyError && ( // Check error state too
										<p className="text-sm text-muted-foreground">
											No saved sessions. Start a chat below.
										</p>
									)}
								{!isLoadingHistory &&
									sessions.length > 0 &&
									!historyError && ( // Check error state too
										<ScrollArea className="h-[100px] pr-3">
											{" "}
											{/* Adjust height as needed */}
											<div className="space-y-1">
												{sessions.map((session: ChatSessionMetadata) => (
													<div
														key={session.sessionId}
														className="flex items-center justify-between gap-2"
													>
														<Button
															variant="ghost"
															size="sm"
															className={cn(
																"flex-1 justify-start text-left h-auto py-1 px-2",
																selectedSessionId === session.sessionId &&
																	"bg-accent text-accent-foreground",
															)}
															onClick={() => {
																if (!isUpdatingHistory) {
																	// Prevent switching while updating
																	setSelectedSessionId(session.sessionId);
																}
															}}
															disabled={isUpdatingHistory} // Disable button while updating
															title={
																session.firstMessageSnippet ||
																`Session from ${new Date(session.createdAt).toLocaleString()}`
															}
														>
															<div className="flex flex-col">
																<span className="text-xs font-normal text-muted-foreground">
																	{new Date(session.createdAt).toLocaleString()}{" "}
																	({session.messageCount} msgs)
																</span>
																<span className="text-sm truncate">
																	{session.firstMessageSnippet || "..."}
																</span>
															</div>
														</Button>
														<Button
															variant="ghost"
															size="icon"
															className="h-6 w-6 text-muted-foreground hover:text-destructive"
															onClick={(e) => {
																e.stopPropagation(); // Prevent triggering session selection
																if (!isUpdatingHistory) {
																	// Prevent delete while updating
																	handleDeleteSession(session.sessionId);
																}
															}}
															disabled={isUpdatingHistory} // Disable button while updating
															title="Delete session"
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												))}
											</div>
										</ScrollArea>
									)}
							</div>

							{/* Selected Session Messages & Actions */}
							<div className="flex-1 flex flex-col">
								{selectedSessionId && (
									<div className="flex justify-end mb-2">
										<Button
											variant="outline"
											size="sm"
											onClick={handleCopyChat}
											disabled={
												isLoadingHistory || // Check overall loading
												isUpdatingHistory || // Disable if updating
												selectedSessionMessages.length === 0
											}
										>
											<Copy className="mr-2 h-4 w-4" />
											Copy Chat
										</Button>
									</div>
								)}
								<ScrollArea className="flex-1 mb-4 pr-4">
									{isLoadingHistory &&
										selectedSessionId && ( // Show loading only if a session is selected
											<div className="flex items-center justify-center py-4">
												<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
												<span className="ml-2 text-sm text-muted-foreground">
													Loading messages...
												</span>
											</div>
										)}
									{historyError &&
										!isLoadingHistory && ( // Show history error if not loading
											<p className="text-sm text-destructive text-center py-4">
												Error loading history: {historyError}
											</p>
										)}
									{!isLoadingHistory && !selectedSessionId && !historyError && (
										<p className="text-sm text-muted-foreground text-center py-4">
											Select a session above to view its history.
										</p>
									)}
									{!isLoadingHistory &&
										selectedSessionId &&
										selectedSessionMessages.length === 0 &&
										!historyError && (
											<p className="text-sm text-muted-foreground text-center py-4">
												This session is empty.
											</p>
										)}
									{!isLoadingHistory &&
										selectedSessionId &&
										selectedSessionMessages.length > 0 &&
										!historyError && (
											<div className="space-y-4">
												{/* Display messages from selectedSessionMessages */}
												{selectedSessionMessages.map(
													(msg: ChatMessage, index: number) => (
														<div
															// Key needs to be unique within the session
															key={`hist-${selectedSessionId}-${index}-${msg.timestamp}`}
															className={cn(
																"p-3 rounded-lg max-w-[80%] break-words",
																msg.sender === "user"
																	? "bg-primary text-primary-foreground self-end ml-auto"
																	: "bg-muted text-muted-foreground self-start mr-auto",
															)}
														>
															<p className="text-sm whitespace-pre-wrap">
																{msg.content}
															</p>
															<p className="text-xs text-muted-foreground/60 mt-1 text-right">
																{new Date(msg.timestamp).toLocaleTimeString(
																	[],
																	{
																		hour: "2-digit",
																		minute: "2-digit",
																	},
																)}
															</p>
														</div>
													),
												)}
											</div>
										)}
								</ScrollArea>
								{/* Chat input for continuing selected session - Needs integration with useChat */}
								{selectedSessionId && (
									<p className="text-xs text-muted-foreground text-center mb-2">
										Chat input below adds to the currently selected session (via
										Chat tab).
									</p>
								)}
							</div>
						</TabsContent>
						{/* AI Settings Tab */}
						<TabsContent
							value="settings"
							className="mt-4 space-y-4 flex-1 overflow-y-auto p-1" // Added styling
						>
							<ApiConfigurator
								apiConfig={apiConfig}
								setApiConfig={setApiConfig}
								availableProviders={availableProviders}
							/>
						</TabsContent>
					</Tabs>
				</SheetContent>
			</Sheet>
		</div>
	);
}
