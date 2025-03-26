import ArticleCard from "@/components/ArticleCard";
import { Button } from "@/components/ui/button";
import {
	TransitionGroup,
	TransitionItem,
} from "@/components/ui/transition-group";
import { useAnimation } from "@/context/AnimationContext";
import { useArticles } from "@/context/ArticleContext";
import { createAnimationFrame } from "@/lib/animation";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export default function HomePage() {
	const {
		articles,
		isLoading,
		currentView,
		refreshArticles,
		error,
		retryLoading,
	} = useArticles();
	const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
	const { synchronizeAnimations } = useAnimation();
	const animationFrameRef = useRef(createAnimationFrame());

	// Reference to track if cards should animate
	const shouldAnimateCards = useRef(true);

	// On initial mount, refresh articles once
	useEffect(() => {
		let isMounted = true;

		if (!hasLoadedOnce) {
			refreshArticles()
				.then(() => {
					if (isMounted) {
						setHasLoadedOnce(true);

						// Trigger the animation after data is loaded
						setTimeout(() => {
							if (isMounted) {
								synchronizeAnimations(() => {
									shouldAnimateCards.current = true;
								});
							}
						}, 100);
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
			// Cancel any pending animations
			animationFrameRef.current.cancel();
		};
	}, [hasLoadedOnce, refreshArticles, synchronizeAnimations]);

	// Whenever the view changes, we should animate the cards again
	useEffect(() => {
		shouldAnimateCards.current = true;
	}, []);

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
				) : error ? (
					<TransitionGroup
						groupId="error-state"
						className="flex flex-col items-center justify-center h-64 space-y-4"
						autoAnimate={true}
					>
						<TransitionItem showFrom="top">
							<p className="text-muted-foreground">
								{error.message || "Error loading articles"}
							</p>
						</TransitionItem>
						<TransitionItem showFrom="bottom">
							<Button onClick={retryLoading}>
								<RefreshCw className="mr-2 h-4 w-4" />
								Retry Loading
							</Button>
						</TransitionItem>
					</TransitionGroup>
				) : shouldShowEmptyState ? (
					<TransitionGroup
						groupId="empty-state"
						className="flex flex-col items-center justify-center h-64 space-y-4"
						autoAnimate={true}
					>
						<TransitionItem showFrom="top">
							<p className="text-muted-foreground">No articles found</p>
						</TransitionItem>
						<TransitionItem showFrom="bottom">
							<Button asChild>
								<Link to="/add">
									<Plus className="mr-2 h-4 w-4" />
									Add Your First Article
								</Link>
							</Button>
						</TransitionItem>
					</TransitionGroup>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{articles.map((article, index) => (
							<ArticleCard key={article._id} article={article} index={index} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
