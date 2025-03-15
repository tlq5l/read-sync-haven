import ArticleCard from "@/components/ArticleCard";
import { Button } from "@/components/ui/button";
import { useArticles } from "@/context/ArticleContext";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

export default function HomePage() {
	const { articles, isLoading, currentView, error, refreshArticles } =
		useArticles();
	const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

	// On initial mount, refresh articles once
	useEffect(() => {
		let isMounted = true;

		if (!hasLoadedOnce) {
			refreshArticles()
				.then(() => {
					if (isMounted) {
						setHasLoadedOnce(true);
					}
				})
				.catch((err) => {
					console.error("Error refreshing articles:", err);
					if (isMounted) {
						setHasLoadedOnce(true); // Still mark as loaded even on error
					}
				});
		}

		return () => {
			isMounted = false;
		};
	}, [hasLoadedOnce, refreshArticles]);

	// Log for debugging but avoid excessive rendering
	useEffect(() => {
		console.log("HomePage rendered with:", {
			articlesCount: articles.length,
			isLoading,
			currentView,
			hasError: !!error,
			hasLoadedOnce,
		});
	}, [articles.length, isLoading, currentView, error, hasLoadedOnce]);

	const getViewTitle = () => {
		switch (currentView) {
			case "unread":
				return "Unread Articles";
			case "favorites":
				return "Favorite Articles";
			default:
				return "All Articles";
		}
	};

	// Determine if we should show the empty state
	// Only show it if we're not loading AND we've completed at least one load
	const shouldShowEmptyState =
		!isLoading && hasLoadedOnce && articles.length === 0;

	return (
		<div className="h-full flex flex-col">
			<div className="border-b p-4">
				<h1 className="text-2xl font-bold">{getViewTitle()}</h1>
			</div>

			<div className="flex-1 overflow-y-auto p-4">
				{isLoading && !hasLoadedOnce ? (
					<div className="flex items-center justify-center h-64">
						<p className="text-muted-foreground">Loading articles...</p>
					</div>
				) : shouldShowEmptyState ? (
					<div className="flex flex-col items-center justify-center h-64 space-y-4">
						<p className="text-muted-foreground">No articles found</p>
						<Button asChild>
							<Link to="/add">
								<Plus className="mr-2 h-4 w-4" />
								Add Your First Article
							</Link>
						</Button>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{articles.map((article) => (
							<ArticleCard key={article._id} article={article} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
