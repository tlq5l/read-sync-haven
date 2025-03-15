import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useArticles } from "@/context/ArticleContext";
import { useToast } from "@/hooks/use-toast";
import type { Article } from "@/services/db";
import { formatDistanceToNow } from "date-fns";
import { Bookmark, BookmarkCheck, MoreHorizontal, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link } from "react-router-dom";

interface ArticleCardProps {
	article: Article;
}

export default function ArticleCard({ article }: ArticleCardProps) {
	const { updateArticleStatus, removeArticle } = useArticles();
	const { toast } = useToast();
	const [isMenuOpen, setIsMenuOpen] = useState(false);

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

	return (
		<Card className="overflow-hidden transition-all hover:shadow-md">
			<Link to={`/read/${article._id}`}>
				<CardContent className="p-0">
					<div className="p-4">
						{article.isRead ? (
							<div className="flex justify-between items-start mb-2">
								<span className="text-xs text-muted-foreground">Read</span>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
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
										<DropdownMenuContent align="end">
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
										className="h-8 w-8"
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
										<DropdownMenuContent align="end">
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
							{article.title}
						</h3>
						<p className="text-sm text-muted-foreground line-clamp-2 mb-3">
							{article.excerpt}
						</p>
						<div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
							<span>{article.siteName}</span>
							<div className="flex items-center gap-3">
								<span>{article.estimatedReadTime} min read</span>
								<span>
									{formatDistanceToNow(new Date(article.savedAt), {
										addSuffix: true,
									})}
								</span>
							</div>
						</div>
					</div>
				</CardContent>
			</Link>
		</Card>
	);
}
