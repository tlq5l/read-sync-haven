// Removed unused ArticleCard import
import TopBar from "@/components/TopBar"; // Import the new TopBar component
import VirtualizedArticleGrid from "@/components/VirtualizedArticleGrid"; // Import the new component
import { Button } from "@/components/ui/button";
// Removed unused Checkbox import
// Removed unused DropdownMenu imports
import {
	TransitionGroup,
	TransitionItem,
} from "@/components/ui/transition-group";
import { useAnimation } from "@/context/AnimationContext";
import { useArticles } from "@/context/ArticleContext";
import { useDebounce } from "@/hooks/useDebounce"; // Import debounce hook
import { createAnimationFrame } from "@/lib/animation";
// Removed unused article utils import
import {
	// Removed unused icons: ArrowDownUp, ChevronDown, PanelLeft
	Plus,
	RefreshCw,
} from "lucide-react"; // Import icons
import { useEffect, useRef, useState } from "react"; // Removed unused useMemo import
import { Link } from "react-router-dom";

export default function InboxPage() {
	const {
		articles, // Raw articles for deriving filter options
		processedArticles, // Use this for display
		isLoading,
		// currentView, // Removed unused variable
		refreshArticles,
		error,
		retryLoading,
		filters,
		setFilters,
		setSearchQuery,
		// Removed unused sort variables: sortCriteria, setSortField, toggleSortDirection
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

	// Determine if we should show the empty state
	// Only show it if we're not loading AND we've completed at least one load
	// Derive unique filter options from raw articles (memoize for performance)

	// Determine if we should show the empty state
	const hasActiveFilters =
		filters.searchQuery ||
		filters.siteNames.length > 0 ||
		filters.tags.length > 0 ||
		filters.types.length > 0;
	const showInitialEmptyState =
		!isLoading && hasLoadedOnce && articles.length === 0 && !hasActiveFilters;
	// Removed misplaced JSX block for the top bar (lines 116-252)
	const showFilterEmptyState =
		!isLoading &&
		hasLoadedOnce &&
		processedArticles.length === 0 &&
		(articles.length > 0 || hasActiveFilters); // Show if filters resulted in no matches

	// Filter articles specifically for the inbox view *before* passing to the virtualizer
	const inboxArticles = processedArticles.filter(
		(article) => article.status === "inbox",
	);

	return (
		<div className="h-full flex flex-col bg-background">
			{" "}
			{/* Added bg-background */}
			<TopBar /> {/* Add the TopBar component here */}
			{/* Remove the old placeholder div for the top bar */}
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
						groupId="empty-state-initial"
						className="flex flex-col items-center justify-center h-64 space-y-4"
						autoAnimate={true}
					>
						<TransitionItem showFrom="top">
							<p className="text-muted-foreground">No articles saved yet</p>
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
				) : showFilterEmptyState ? (
					<TransitionGroup
						groupId="empty-state-filtered"
						className="flex flex-col items-center justify-center h-64 space-y-4"
						autoAnimate={true}
					>
						<TransitionItem showFrom="top">
							<p className="text-muted-foreground">
								No articles match your current filters.
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
					<VirtualizedArticleGrid articles={inboxArticles} />
				)}
			</div>
		</div>
	);
}
