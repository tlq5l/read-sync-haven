import EpubReader from "@/components/EpubReader";
import PdfReader from "@/components/PdfReader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Sheet,
	SheetContent,
	SheetDescription, // Added import
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArticles } from "@/context/ArticleContext";
import { cn } from "@/lib/utils";
import { type Article, getArticle } from "@/services/db";
import { useAuth } from "@clerk/clerk-react"; // Import useAuth
import { useMutation } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import parse from "html-react-parser"; // Re-add parse import
import {
	ArrowLeft,
	Bookmark,
	BookmarkCheck,
	Loader2,
	Maximize2,
	Minimize2,
	PanelRightOpen,
	Send, // Add Send icon
	// PanelRightOpen, // Removed duplicate
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react"; // Add useCallback and sort
import { useNavigate, useParams } from "react-router-dom";
import { Input } from "./ui/input"; // Add Input import
import { ScrollArea } from "./ui/scroll-area"; // Add ScrollArea import
// import { useAuth } from "@clerk/clerk-react"; // Removed duplicate import

export default function ArticleReader() {
	const { id } = useParams<{ id: string }>();
	const { getToken } = useAuth(); // Get getToken function from Clerk
	const navigate = useNavigate();
	const [article, setArticle] = useState<Article | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [fullscreen, setFullscreen] = useState(false);
	const contentRef = useRef<HTMLDivElement>(null);
	const { updateArticleStatus, updateReadingProgress } = useArticles();
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [isSummarizing, setIsSummarizing] = useState(false);
	const [summary, setSummary] = useState<string | null>(null);
	const [summaryError, setSummaryError] = useState<string | null>(null);
	const [fullTextContent, setFullTextContent] = useState<string | null>(null); // State for extracted text
	const [chatHistory, setChatHistory] = useState<
		Array<{ sender: "user" | "ai"; text: string }>
	>([]);
	const [chatInput, setChatInput] = useState("");
	const [isChatting, setIsChatting] = useState(false);
	const [chatError, setChatError] = useState<string | null>(null);
	const chatScrollAreaRef = useRef<HTMLDivElement>(null);

	// Callback for child components to provide extracted text
	const handleTextExtracted = useCallback((text: string | null) => {
		console.log(
			"Text extracted:",
			text ? `${text.substring(0, 100)}...` : "null",
		);
		setFullTextContent(text);
	}, []);

	// Removed the old getGoogleAuthToken function

	// Mutation for summarizing content using Google Cloud Function (Authenticated) - Uses fullTextContent
	const summarizeMutation = useMutation({
		mutationFn: async () => {
			// No argument needed, uses state
			if (!fullTextContent) {
				throw new Error("Article content not available for summarization.");
			}
			let response: Response;
			const requestBody = JSON.stringify({ content: fullTextContent }); // Use state

			if (import.meta.env.DEV) {
				// --- DEVELOPMENT: Call GCF directly via Vite Proxy ---
				console.log("DEV: Calling GCF via Vite proxy...");
				const gcfUrl = import.meta.env.VITE_GCF_SUMMARIZE_URL;
				if (!gcfUrl) throw new Error("VITE_GCF_SUMMARIZE_URL not set.");

				// 1. Get Google OIDC token from Vite dev server
				const tokenResponse = await fetch("/api/get-gcf-token");
				const tokenData = await tokenResponse.json();
				if (!tokenResponse.ok || !tokenData.token) {
					throw new Error(
						tokenData?.error || "Failed to get dev token from Vite server.",
					);
				}
				const googleOidcToken = tokenData.token;

				// 2. Call GCF directly with the token
				response = await fetch(gcfUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${googleOidcToken}`,
					},
					body: requestBody,
				});
			} else {
				// --- PRODUCTION: Call Cloudflare Worker Proxy ---
				console.log("PROD: Calling Cloudflare Worker proxy...");
				// 1. Get Clerk token
				const clerkToken = await getToken(); // Get token from useAuth hook
				if (!clerkToken) {
					throw new Error("User not authenticated (Clerk token missing).");
				}

				// 2. Call the worker endpoint (absolute URL of the standalone worker)
				response = await fetch(
					"https://bondwise-sync-api.vikione.workers.dev/api/summarize",
					{
						// Absolute path to worker endpoint
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							Authorization: `Bearer ${clerkToken}`, // Send Clerk token
						},
						body: requestBody,
					},
				);
			}

			// --- Handle Response (Common for Dev/Prod) ---
			const data = await response.json(); // Always parse JSON

			if (!response.ok) {
				// Use error message from backend response if available
				throw new Error(
					data?.message ||
						data?.error ||
						`Request failed with status ${response.status}`,
				);
			}

			if (!data.summary) {
				throw new Error(
					"Invalid response from summarization service (missing summary).",
				);
			}

			return data.summary; // Return the summary text
		},
		onMutate: () => {
			setIsSummarizing(true);
			setSummary(null);
			setSummaryError(null);
		},
		onSuccess: (data) => {
			setSummary(data);
			setIsSidebarOpen(true); // Open sidebar on success
		},
		onError: (error) => {
			setSummaryError(error.message);
		},
		onSettled: () => {
			setIsSummarizing(false);
		},
	});

	// Mutation for chatting with content using Cloudflare Worker -> GCF
	const chatMutation = useMutation({
		mutationFn: async (userMessage: string) => {
			if (!fullTextContent) {
				throw new Error("Article content not available for chat.");
			}
			if (!userMessage.trim()) {
				throw new Error("Cannot send an empty message.");
			}

			let response: Response;
			const requestBody = JSON.stringify({
				content: fullTextContent,
				message: userMessage,
			});

			// Always call the worker proxy (handles dev/prod logic internally if needed, but currently points to prod worker)
			console.log("Calling Cloudflare Worker proxy for chat...");
			const clerkToken = await getToken();
			if (!clerkToken) {
				throw new Error("User not authenticated (Clerk token missing).");
			}

			response = await fetch(
				"https://bondwise-sync-api.vikione.workers.dev/api/chat", // Absolute path to worker chat endpoint
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${clerkToken}`, // Send Clerk token
					},
					body: requestBody,
				},
			);

			const data = await response.json();

			if (!response.ok) {
				throw new Error(
					data?.message ||
						data?.error ||
						`Chat request failed with status ${response.status}`,
				);
			}

			if (!data.response) {
				// Expecting 'response' field from chat GCF
				throw new Error(
					"Invalid response from chat service (missing response).",
				);
			}

			return data.response; // Return the AI response text
		},
		onMutate: (userMessage: string) => {
			setIsChatting(true);
			setChatError(null);
			// Add user message to history immediately
			setChatHistory((prev) => [
				...prev,
				{ sender: "user", text: userMessage },
			]);
			setChatInput(""); // Clear input field
		},
		onSuccess: (aiResponse: string) => {
			// Add AI response to history
			setChatHistory((prev) => [...prev, { sender: "ai", text: aiResponse }]);
		},
		onError: (error: Error) => {
			setChatError(error.message);
			// Optionally add error message to chat history
			setChatHistory((prev) => [
				...prev,
				{ sender: "ai", text: `Error: ${error.message}` },
			]);
		},
		onSettled: () => {
			setIsChatting(false);
			// Scroll to bottom after message exchange
			setTimeout(() => {
				chatScrollAreaRef.current?.scrollTo({
					top: chatScrollAreaRef.current.scrollHeight,
					behavior: "smooth",
				});
			}, 100); // Small delay to allow DOM update
		},
	});

	// Handle chat submission
	const handleChatSubmit = (e?: React.FormEvent<HTMLFormElement>) => {
		e?.preventDefault(); // Prevent form submission page reload
		if (chatInput.trim() && !isChatting && fullTextContent) {
			chatMutation.mutate(chatInput.trim());
		} else if (!fullTextContent) {
			setChatError("Article content not yet extracted or available.");
		}
	};

	// Scroll chat to bottom when new messages are added
	useEffect(() => {
		if (chatScrollAreaRef.current) {
			// Scroll to bottom whenever the ref is available (e.g., after initial render)
			// and potentially after new messages (though the mutation's onSettled handles that too)
			chatScrollAreaRef.current.scrollTop =
				chatScrollAreaRef.current.scrollHeight;
		}
		// No dependency array needed if we only want this on mount/ref change,
		// or keep chatHistory if we want it to scroll on every message addition
		// Let's remove chatHistory as per the lint rule, scrolling is handled in onSettled
	}, []); // Remove chatHistory dependency

	useEffect(() => {
		const fetchArticle = async () => {
			if (!id) return;

			try {
				console.log("Fetching article with ID:", id);
				const articleData = await getArticle(id);
				console.log("Article data:", articleData);

				if (!articleData) {
					setError("Article not found");
					return;
				}

				setArticle(articleData);

				// Mark as read if not already
				if (!articleData.isRead) {
					updateArticleStatus(id, true);
				}
			} catch (err) {
				console.error("Error fetching article:", err);
				setError("Failed to load article");
			} finally {
				setLoading(false);
			}
		};

		fetchArticle();
	}, [id, updateArticleStatus]);

	useEffect(() => {
		// Track reading progress
		if (!article || !contentRef.current) return;

		const trackProgress = () => {
			if (!contentRef.current) return;

			const { scrollTop, scrollHeight, clientHeight } = contentRef.current;
			const progress = Math.min(
				100,
				Math.floor((scrollTop / (scrollHeight - clientHeight)) * 100),
			);

			if (progress > 0) {
				// Debounce the update to avoid too many database writes
				updateReadingProgress(article._id, progress);
			}
		};

		// Use passive listener for better performance
		const ref = contentRef.current;
		ref.addEventListener("scroll", trackProgress, { passive: true });

		return () => {
			ref.removeEventListener("scroll", trackProgress);
		};
	}, [article, updateReadingProgress]);

	const toggleFavorite = () => {
		if (article && id) {
			updateArticleStatus(id, true, !article.favorite);
			setArticle((prev) =>
				prev ? { ...prev, favorite: !prev.favorite } : null,
			);
		}
	};

	const toggleFullscreen = () => {
		setFullscreen(!fullscreen);
	};

	const goBack = () => {
		navigate(-1);
	};

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

	// Check if article is an EPUB file
	const isEpub = article.type === "epub" && article.fileData;
	// Check if article is a PDF file
	const isPdf = article.type === "pdf" && article.fileData;

	// Set text color class
	const textColorClass = "text-foreground";

	return (
		<div
			className={cn(
				"flex flex-col h-full transition-all",
				fullscreen && "fixed inset-0 z-50 bg-background",
			)}
		>
			<div className="border-b p-4 flex items-center justify-between">
				<Button variant="ghost" size="icon" onClick={goBack}>
					<ArrowLeft size={20} />
				</Button>
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" onClick={toggleFavorite}>
						{article.favorite ? (
							<BookmarkCheck className="h-5 w-5 text-bondwise-500" />
						) : (
							<Bookmark className="h-5 w-5" />
						)}
					</Button>
					<Button variant="ghost" size="icon" onClick={toggleFullscreen}>
						{fullscreen ? (
							<Minimize2 className="h-5 w-5" />
						) : (
							<Maximize2 className="h-5 w-5" />
						)}
					</Button>
					{/* Sidebar Trigger */}
					<Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon">
								<PanelRightOpen className="h-5 w-5" />
							</Button>
						</SheetTrigger>
						{/* Sidebar Content - Moved inside Sheet */}
						<SheetContent side="right" className="w-[400px] sm:w-[540px]">
							<SheetHeader>
								<SheetTitle>Article Details</SheetTitle>
								{/* Added empty description for accessibility */}
								<SheetDescription />
							</SheetHeader>
							<Tabs defaultValue="summary" className="mt-4">
								<TabsList className="grid w-full grid-cols-4">
									{" "}
									{/* Adjust grid columns */}
									<TabsTrigger value="summary">Summary</TabsTrigger>
									<TabsTrigger value="chat">Chat</TabsTrigger>{" "}
									{/* Add Chat Trigger */}
									<TabsTrigger value="notes">Notes</TabsTrigger>
									<TabsTrigger value="metadata">Metadata</TabsTrigger>
								</TabsList>
								{/* Summary Tab Content */}
								<TabsContent value="summary" className="mt-4 space-y-4">
									<Button
										onClick={() => {
											if (fullTextContent) {
												summarizeMutation.mutate(); // Mutate without args
											} else {
												setSummaryError(
													"Article content not yet extracted or available.",
												);
											}
										}}
										disabled={isSummarizing || !fullTextContent} // Disable if no content
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
								{/* Chat Tab Content */}
								<TabsContent
									value="chat"
									className="mt-4 flex flex-col h-[calc(100vh-200px)]"
								>
									{" "}
									{/* Adjust height as needed */}
									<ScrollArea
										className="flex-1 mb-4 pr-4"
										ref={chatScrollAreaRef}
									>
										<div className="space-y-4">
											{chatHistory.map((msg, index) => (
												<div
													// Use a more stable key than just index
													key={`${msg.sender}-${index}-${msg.text.substring(0, 10)}`}
													className={cn(
														"p-3 rounded-lg max-w-[80%]",
														msg.sender === "user"
															? "bg-primary text-primary-foreground self-end ml-auto"
															: "bg-muted text-muted-foreground self-start mr-auto",
													)}
												>
													<p className="text-sm whitespace-pre-wrap">
														{msg.text}
													</p>
												</div>
											))}
											{isChatting &&
												chatHistory[chatHistory.length - 1]?.sender ===
													"user" && (
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
										onSubmit={handleChatSubmit}
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
											onChange={(e) => setChatInput(e.target.value)}
											disabled={isChatting || !fullTextContent}
											className="flex-1"
										/>
										<Button
											type="submit"
											size="icon"
											disabled={
												isChatting || !chatInput.trim() || !fullTextContent
											}
										>
											<Send className="h-4 w-4" />
										</Button>
									</form>
								</TabsContent>
								{/* Notes Tab Content */}
								<TabsContent value="notes" className="mt-4">
									<p>Notes functionality to be added.</p>
								</TabsContent>
								{/* Metadata Tab Content */}
								<TabsContent value="metadata" className="mt-4">
									<p>Metadata display to be added.</p>
								</TabsContent>
							</Tabs>
						</SheetContent>
					</Sheet>
				</div>
			</div>

			{isEpub && article.fileData ? (
				// If it's an EPUB file, render the EpubReader component
				<div
					className="flex-1 overflow-hidden flex flex-col"
					style={{ height: "calc(100vh - 64px)" }}
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
							onTextExtracted={handleTextExtracted} // Pass callback
						/>
					</div>
				</div>
			) : isPdf && article.fileData ? (
				// If it's a PDF file, render the PdfReader component
				<div
					className="flex-1 overflow-hidden flex flex-col"
					style={{ height: "calc(100vh - 64px)" }}
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
							onTextExtracted={handleTextExtracted} // Pass callback
						/>
					</div>
				</div>
			) : (
				// Otherwise, render the regular article content
				<div
					ref={(node) => {
						// Combine ref logic
						if (node && !isEpub && !isPdf && !fullTextContent) {
							// Set initial text content for HTML articles
							handleTextExtracted(node.textContent);
						}
						// Assign to contentRef as well for scrolling
						(
							contentRef as React.MutableRefObject<HTMLDivElement | null>
						).current = node;
					}}
					className={`flex-1 overflow-y-auto px-4 md:px-8 py-6 ${textColorClass}`}
				>
					{/* Removed the corrupted duplicate ref section */}
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

						<div className="prose max-w-none">
							{parse(DOMPurify.sanitize(article.content))}
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
			)}
		</div>
	);
}
