// Removed direct ArticleCard import
import TopBar from "@/components/TopBar";
import VirtualizedArticleList from "@/components/VirtualizedArticleList"; // Import the virtual list
import { Button } from "@/components/ui/button";
import {
	TransitionGroup,
	TransitionItem,
} from "@/components/ui/transition-group";
import { useAnimation } from "@/context/AnimationContext";
import { useArticles } from "@/context/ArticleContext";
import { useDebounce } from "@/hooks/useDebounce";
import { createAnimationFrame } from "@/lib/animation";
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// Renamed component to ArchivePage
export default function ArchivePage() {
	const {
		articles, // Raw articles for deriving filter options
		processedArticles, // Use this for display
		isLoading,
		refreshArticles,
		error,
		retryLoading,
		filters,
		setFilters,
		setSearchQuery,
	} = useArticles();
	const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
	const { synchronizeAnimations } = useAnimation();
	const animationFrameRef = useRef(createAnimationFrame());

	// Local state for search input
	const [localSearchQuery, setLocalSearchQuery] = useState("");
	const debouncedSearchQuery = useDebounce(localSearchQuery, 300); // 300ms debounce

	// Effect to update context search query when debounced value changes
	useEffect(() => {
		setSearchQuery(debouncedSearchQuery);
	}, [debouncedSearchQuery, setSearchQuery]);

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
			animationFrameRef.current.cancel();
		};
	}, [hasLoadedOnce, refreshArticles, synchronizeAnimations]);

	// Whenever the view changes, we should animate the cards again
	useEffect(() => {
		shouldAnimateCards.current = true;
	}, []);

	// Determine if we should show the empty state
	const hasActiveFilters =
		filters.searchQuery ||
		filters.siteNames.length > 0 ||
		filters.tags.length > 0 ||
		filters.types.length > 0;

	// Filter for 'archived' status specifically for this page
	const archivedArticles = processedArticles.filter(
		(article) => article.status === "archived",
	);

	const showInitialEmptyState =
		!isLoading &&
		hasLoadedOnce &&
		archivedArticles.length === 0 &&
		!hasActiveFilters;
	const showFilterEmptyState =
		!isLoading &&
		hasLoadedOnce &&
		archivedArticles.length === 0 &&
		(articles.length > 0 || hasActiveFilters); // Show if filters resulted in no matches for 'archived'

	return (
		<div className="h-full flex flex-col bg-background">
			<TopBar />
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
				) : showInitialEmptyState ? (
					<TransitionGroup
						groupId="empty-state-initial-archive" // Unique groupId
						className="flex flex-col items-center justify-center h-64 space-y-4"
						autoAnimate={true}
					>
						<TransitionItem showFrom="top">
							<p className="text-muted-foreground">No articles archived yet.</p>
						</TransitionItem>
						{/* Optional: Add a button to go back or add articles */}
					</TransitionGroup>
				) : showFilterEmptyState ? (
					<TransitionGroup
						groupId="empty-state-filtered-archive" // Unique groupId
						className="flex flex-col items-center justify-center h-64 space-y-4"
						autoAnimate={true}
					>
						<TransitionItem showFrom="top">
							<p className="text-muted-foreground">
								No archived articles match your current filters.
							</p>
						</TransitionItem>
						<TransitionItem showFrom="bottom">
							<Button
								variant="outline"
								onClick={() => {
									setLocalSearchQuery(""); // Clears debounced via effect
									setFilters({
										siteNames: [],
										types: [],
										tags: [],
										searchQuery: "",
									});
								}}
							>
								Clear Filters
							</Button>
						</TransitionItem>
					</TransitionGroup>
				) : (
					// Use the VirtualizedArticleList component
					// The parent div (line 107) already has overflow-y-auto and flex-1 for height
					<VirtualizedArticleList articles={archivedArticles} />
				)}
			</div>
		</div>
	);
}
