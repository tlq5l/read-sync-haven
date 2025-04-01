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
import { Bookmark, BookmarkCheck, MoreHorizontal, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

interface ArticleCardProps {
	article: Article;
	index?: number;
}

export default function ArticleCard({ article, index = 0 }: ArticleCardProps) {
	const { updateArticleStatus, removeArticle } = useArticles();
	const { toast } = useToast();
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	// Use synchronized animation with staggered delay based on index
	const cardAnimation = useSynchronizedAnimation({
		groupId: "article-cards",
		elementId: `article-card-${article._id}`,
		duration: 200,
		delay: index * 30, // Stagger effect based on card position
	});

	const handleToggleFavorite = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await updateArticleStatus(article._id, article.isRead, !article.favorite);
		} catch (error) {
			console.error("Error toggling favorite:", error);
		}
	};

	const handleDelete = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			if (!article._rev) {
				throw new Error("Article revision not found");
			}
			await removeArticle(article._id, article._rev);
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

	return (
		<Card
			ref={cardAnimation.ref}
			className="overflow-hidden transition-all gpu-accelerated duration-200 hover:shadow-md"
			style={{
				opacity: 0,
				transform: "translateY(20px) translateZ(0)",
				animation: `fadeIn 200ms ${
					index * 30
				}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`,
			}}
		>
			<Link to={`/read/${article._id}`} data-testid="article-card">
				<CardContent className="p-0">
					<div className="p-4">
						{article.isRead ? (
							<div className="flex justify-between items-start mb-2">
								<span className="text-xs text-muted-foreground">Read</span>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8 transition-transform duration-200"
										onClick={handleToggleFavorite}
									>
										{article.favorite ? (
											<BookmarkCheck size={16} className="text-bondwise-500" />
										) : (
											<Bookmark size={16} />
										)}
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
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8 transition-transform duration-200"
										onClick={handleToggleFavorite}
									>
										{article.favorite ? (
											<BookmarkCheck size={16} className="text-bondwise-500" />
										) : (
											<Bookmark size={16} />
										)}
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
							<span>{article.siteName || "Unknown source"}</span>
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
