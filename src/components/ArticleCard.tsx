import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useArticles } from "@/context/ArticleContext";
import { useSynchronizedAnimation } from "@/hooks/use-synchronized-animation";
import { useToast } from "@/hooks/use-toast";
import type { Article } from "@/services/db";
import { formatDistanceToNow } from "date-fns";
import {
	Archive,
	// Bookmark, // Removed unused import
	Clock,
	Inbox, // Add Inbox icon
	MoreHorizontal,
	Trash2,
} from "lucide-react";
import type React from "react";
// Removed duplicate React import
import { useEffect, useRef, useState } from "react"; // Add useEffect and useRef
import { Link } from "react-router-dom";

interface ArticleCardProps {
	article: Article;
	index?: number;
}

export default function ArticleCard({ article, index = 0 }: ArticleCardProps) {
	const { updateArticleStatus, optimisticRemoveArticle } = useArticles(); // Use optimistic remove
	const { toast } = useToast();
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const cardElementRef = useRef<HTMLDivElement | null>(null); // Local ref for the card element

	// Use synchronized animation with staggered delay based on index
	const cardAnimation = useSynchronizedAnimation({
		groupId: "article-cards",
		elementId: `article-card-${article._id}`,
		duration: 200,
		delay: index * 30, // Stagger effect based on card position
	});

	// Removed handleToggleFavorite as it's replaced by Move to Inbox
	const handleDelete = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			// No need to check _rev for optimistic remove
			await optimisticRemoveArticle(article._id);
		} catch (error) {
			console.error("Error deleting article:", error);
			toast({
				title: "Error",
				description: "Could not delete article",
				variant: "destructive",
			});
		}
	};

	// Format the saved date with error handling
	const getFormattedDate = () => {
		try {
			// Make sure savedAt exists and is a valid number
			if (!article.savedAt || Number.isNaN(Number(article.savedAt))) {
				return "Recently";
			}

			// Use a safe fallback date if savedAt is invalid
			let date: Date;
			try {
				date = new Date(article.savedAt);
				// Check if date is valid
				if (Number.isNaN(date.getTime())) {
					return "Recently";
				}
			} catch (e) {
				return "Recently";
			}

			return formatDistanceToNow(date, { addSuffix: true });
		} catch (error) {
			console.error("Error formatting date:", error);
			return "Recently";
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "Delete") {
			e.preventDefault();
			e.stopPropagation();
			// Call optimistic remove directly, similar to handleDelete but for keyboard event
			optimisticRemoveArticle(article._id).catch((error) => {
				console.error("Error deleting article via keyboard:", error);
				toast({
					title: "Error",
					description: "Could not delete article",
					variant: "destructive",
				});
			});
		}
	};

	// Effect to trigger the transition animation after mount
	useEffect(() => {
		// Use the local ref here
		const node = cardElementRef.current;
		if (node) {
			// Use requestAnimationFrame to ensure the initial styles are applied before transitioning
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					// Double RAF for good measure
					node.style.opacity = "1";
					node.style.transform = "translateY(0) translateZ(0)";
				});
			});
		}
		// Run only once on mount
	}, []);

	// Combine the callback ref from the hook with setting our local ref
	const combinedRef = (element: HTMLDivElement | null) => {
		cardAnimation.ref(element); // Call the hook's ref function
		cardElementRef.current = element; // Set our local ref
	};

	return (
		<Card
			ref={combinedRef} // Use the combined ref callback
			tabIndex={0} // Make card focusable
			onKeyDown={handleKeyDown} // Add keydown handler
			className="overflow-hidden transition-all gpu-accelerated duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" // Add focus styles
			// Initial state for transition - opacity 0 and translated down
			style={{
				opacity: 0,
				transform: "translateY(20px) translateZ(0)",
				// Removed keyframe animation property
			}}
		>
			<Link to={`/read/${article._id}`} data-testid="article-card">
				<CardContent className="p-0">
					<div className="p-4">
						{article.isRead ? (
							<div className="flex justify-between items-start mb-2">
								<span className="text-xs text-muted-foreground">Read</span>
								<div className="flex items-center gap-1">
									{/* Move to Later Button */}
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											updateArticleStatus(article._id, { status: "later" });
										}}
										aria-label="Move to Later"
									>
										<Clock size={16} />
									</Button>
									{/* Archive Button */}
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											updateArticleStatus(article._id, { status: "archived" });
										}}
										aria-label="Archive"
									>
										<Archive size={16} />
									</Button>
									{/* Move to Inbox Button (Replaces Favorite) */}
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											updateArticleStatus(article._id, { status: "inbox" });
										}}
										aria-label="Move to Inbox"
									>
										<Inbox size={16} />
									</Button>
									<DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
												}}
											>
												<MoreHorizontal size={16} />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent
											align="end"
											className="gpu-accelerated"
										>
											{/* Items removed, now direct buttons */}
											<DropdownMenuItem
												className="text-destructive focus:text-destructive"
												onClick={handleDelete}
											>
												<Trash2 className="mr-2 h-4 w-4" />
												<span>Delete</span>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						) : (
							<div className="flex justify-between items-start mb-2">
								<span className="text-xs font-medium text-bondwise-500">
									Unread
								</span>
								<div className="flex items-center gap-1">
									{/* Move to Later Button */}
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											updateArticleStatus(article._id, { status: "later" });
										}}
										aria-label="Move to Later"
									>
										<Clock size={16} />
									</Button>
									{/* Archive Button */}
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											updateArticleStatus(article._id, { status: "archived" });
										}}
										aria-label="Archive"
									>
										<Archive size={16} />
									</Button>
									{/* Move to Inbox Button (Replaces Favorite) */}
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											updateArticleStatus(article._id, { status: "inbox" });
										}}
										aria-label="Move to Inbox"
									>
										<Inbox size={16} />
									</Button>
									<DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												onClick={(e) => {
													e.preventDefault();
													e.stopPropagation();
												}}
											>
												<MoreHorizontal size={16} />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent
											align="end"
											className="gpu-accelerated"
										>
											{/* Items removed, now direct buttons */}
											<DropdownMenuItem
												className="text-destructive focus:text-destructive"
												onClick={handleDelete}
											>
												<Trash2 className="mr-2 h-4 w-4" />
												<span>Delete</span>
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						)}
						<h3 className="text-lg font-medium line-clamp-2 mb-2">
							{article.title || "Untitled"}
						</h3>
						<p className="text-sm text-muted-foreground line-clamp-2 mb-3">
							{article.excerpt || "No excerpt available"}
						</p>
						<div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
							<span>
								{article.type === "pdf" && !article.siteName
									? "PDF Document"
									: article.type === "epub" && !article.siteName
										? "EPUB Book"
										: article.siteName || "Unknown source"}
							</span>
							<div className="flex items-center gap-3">
								<span>{article.estimatedReadTime || "?"} min read</span>
								<span>{getFormattedDate()}</span>
							</div>
						</div>
					</div>
				</CardContent>
			</Link>
		</Card>
	);
}
// Removed useEffect from here, moved inside component
