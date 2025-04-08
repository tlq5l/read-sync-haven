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
import type { Article } from "@/services/db/types"; // Updated path
import { formatDistanceToNow } from "date-fns";
import {
	Archive,
	// Bookmark, // Removed unused import
	Clock,
	Inbox, // Add Inbox icon
	MoreHorizontal,
	Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { Link } from "react-router-dom";

interface ArticleCardProps {
	article: Article;
	index?: number;
}

// Define the component function
const ArticleCardComponent: React.FC<ArticleCardProps> = ({
	article,
	index = 0,
}) => {
	const { updateArticleStatus, optimisticRemoveArticle } = useArticles(); // Revert to optimisticRemoveArticle
	const { toast } = useToast();
	const [isMenuOpen, setIsMenuOpen] = useState(false);

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
			await optimisticRemoveArticle(article._id); // Revert function call
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
			optimisticRemoveArticle(article._id).catch((error: any) => {
				// Revert function call
				// Reverted handler
				console.error("Error deleting article via keyboard:", error);
				toast({
					title: "Error",
					description: "Could not delete article",
					variant: "destructive",
				});
			});
		}
	};
	return (
		<Card
			ref={cardAnimation.ref}
			tabIndex={0} // Make card focusable
			onKeyDown={handleKeyDown} // Add keydown handler
			className="flex flex-col h-[200px] overflow-hidden transition-all gpu-accelerated duration-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2" // Add focus styles, FIXED height, and flex
			// Style removed to prevent flickering with virtualization
		>
			<Link to={`/read/${article._id}`} data-testid="article-card">
				<CardContent className="p-0 flex-grow flex flex-col">
					{" "}
					{/* Keep CardContent growing */}
					{/* Allow content to grow */}
					<div className="p-4 flex flex-col flex-grow">
						{" "}
						{/* Make inner div grow, remove justify-between */}
						{article.isRead ? (
							<div className="flex justify-between items-start mb-2">
								<span
									className="text-xs text-muted-foreground"
									data-testid="read-status"
								>
									Read
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
										aria-label="Read Later"
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
								<span
									className="text-xs font-medium text-thinkara-500"
									data-testid="unread-status"
								>
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
										aria-label="Read Later"
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
						{/* Wrap title and excerpt and make this section grow */}
						<div className="flex-grow mb-3">
							<h3 className="text-lg font-medium line-clamp-2 mb-2">
								{article.title || "Untitled"}
							</h3>
							<p className="text-sm text-muted-foreground line-clamp-2">
								{article.excerpt || "No excerpt available"}
							</p>
						</div>
						{/* Keep bottom metadata section */}
						<div className="flex items-center justify-between text-xs text-muted-foreground mt-auto">
							{" "}
							{/* Use mt-auto to push to bottom */}
							<span>
								{article.type === "pdf" && !article.siteName
									? "PDF Document"
									: article.type === "epub" && !article.siteName
										? "EPUB Document"
										: article.siteName || "Unknown source"}
							</span>
							<div className="flex items-center gap-3">
								<span>{article.estimatedReadTime || "?"} min read</span>
								<span>{getFormattedDate()}</span>
							</div>
						</div>
						{/* Spacer div removed, rely on justify-between */}
					</div>
				</CardContent>
			</Link>
		</Card>
	);
};

// Wrap the component with React.memo for performance optimization
const ArticleCard = React.memo(ArticleCardComponent);

// Export the memoized component as default
export default ArticleCard;

// Add keyframe animation for consistent card fade-in
const cardAnimation = `
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px) translateZ(0);
  }
  to {
    opacity: 1;
    transform: translateY(0) translateZ(0);
  }
}
`;

// Inject the animation styles
const injectStyles = () => {
	if (!document.getElementById("card-animation-styles")) {
		const styleEl = document.createElement("style");
		styleEl.id = "card-animation-styles";
		styleEl.innerHTML = cardAnimation;
		document.head.appendChild(styleEl);
	}
};

// Execute once when the component is loaded
injectStyles();
