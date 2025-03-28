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
	// PanelRightOpen, // Removed duplicate
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

	// Removed the old getGoogleAuthToken function

	// Mutation for summarizing content using Google Cloud Function (Authenticated)
	const summarizeMutation = useMutation({
		mutationFn: async (textContent: string) => {
			let response: Response;
			const requestBody = JSON.stringify({ content: textContent }); // Use const

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
								<TabsList>
									<TabsTrigger value="summary">Summary</TabsTrigger>
									<TabsTrigger value="notes">Notes</TabsTrigger>
									<TabsTrigger value="metadata">Metadata</TabsTrigger>
								</TabsList>
								<TabsContent value="summary" className="mt-4 space-y-4">
									<Button
										onClick={() => {
											const textContent = contentRef.current?.textContent;
											if (textContent) {
												summarizeMutation.mutate(textContent);
											} else {
												setSummaryError("Could not extract article text.");
											}
										}}
										disabled={isSummarizing}
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
										<div className="prose prose-sm max-w-none">
											<p>{summary}</p>
										</div>
									)}
								</TabsContent>
								<TabsContent value="notes" className="mt-4">
									<p>Notes functionality to be added.</p>
								</TabsContent>
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
						/>
					</div>
				</div>
			) : (
				// Otherwise, render the regular article content
				<div
					ref={contentRef}
					className={`flex-1 overflow-y-auto px-4 md:px-8 py-6 ${textColorClass}`}
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
