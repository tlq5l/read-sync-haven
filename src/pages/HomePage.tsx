import ArticleCard from "@/components/ArticleCard";
import { Button } from "@/components/ui/button";
// Removed unused Checkbox import
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem, // Add this import
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
	ArrowDownUp,
	ChevronDown,
	PanelLeft,
	Plus,
	RefreshCw,
} from "lucide-react"; // Import icons
import { useEffect, useRef, useState } from "react"; // Removed unused useMemo import
import { Link } from "react-router-dom";

export default function HomePage() {
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
		sortCriteria,
		setSortField,
		toggleSortDirection,
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
	<div className="flex items-center justify-between h-14 bg-gray-900 text-gray-100 p-4 border-b border-gray-700">
		{" "}
		{/* Added dark theme, padding, border */}
		{/* Left Section */}
		<div className="flex items-center gap-4">
			<Button variant="ghost" size="icon" className="h-8 w-8">
				<PanelLeft className="h-5 w-5" />
				<span className="sr-only">Toggle Sidebar</span>
			</Button>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" className="flex items-center gap-1 px-2">
						<span className="font-semibold">Library</span>
						<ChevronDown className="h-4 w-4 text-gray-400" />{" "}
						{/* Adjusted muted icon color */}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					className="dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
				>
					{" "}
					{/* Dark theme for dropdown */}
					{/* Add Library dropdown items here later */}
					<DropdownMenuItem>Option 1</DropdownMenuItem>
					<DropdownMenuItem>Option 2</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<nav className="flex items-center gap-4 text-sm font-medium text-gray-400">
				{" "}
				{/* Adjusted muted text color */}
				{/* Use Buttons for better styling/interaction later */}
				<Button variant="ghost" size="sm" className="px-2 py-1 h-auto">
					INBOX
				</Button>
				<Button variant="ghost" size="sm" className="px-2 py-1 h-auto">
					LATER
				</Button>
				<Button variant="ghost" size="sm" className="px-2 py-1 h-auto">
					ARCHIVE
				</Button>
			</nav>
		</div>
		{/* Right Section */}
		<div className="flex items-center gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						className="flex items-center gap-1 text-sm px-2"
					>
						<ArrowDownUp className="h-4 w-4 text-gray-400" />{" "}
						{/* Adjusted muted icon color */}
						<span>Date moved</span>
						<ChevronDown className="h-4 w-4 text-gray-400" />{" "}
						{/* Adjusted muted icon color */}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="end"
					className="dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700"
				>
					{" "}
					{/* Dark theme for dropdown */}
					{/* Reuse existing sort logic/items */}
					<DropdownMenuLabel>Sort by</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuCheckboxItem
						checked={sortCriteria.field === "savedAt"}
						onCheckedChange={() => setSortField("savedAt")}
					>
						Date Saved
					</DropdownMenuCheckboxItem>
					<DropdownMenuCheckboxItem
						checked={sortCriteria.field === "title"}
						onCheckedChange={() => setSortField("title")}
					>
						Title
					</DropdownMenuCheckboxItem>
					<DropdownMenuCheckboxItem
						checked={sortCriteria.field === "siteName"}
						onCheckedChange={() => setSortField("siteName")}
					>
						Source
					</DropdownMenuCheckboxItem>
					<DropdownMenuCheckboxItem
						checked={sortCriteria.field === "estimatedReadTime"}
						onCheckedChange={() => setSortField("estimatedReadTime")}
					>
						Read Time
					</DropdownMenuCheckboxItem>
					{/* Add Asc/Desc toggle? Maybe separate button is better */}
				</DropdownMenuContent>
			</DropdownMenu>
			{/* Maybe add the sort direction toggle button here too? */}
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8"
				onClick={toggleSortDirection}
				aria-label={`Sort direction: ${sortCriteria.direction === "asc" ? "Ascending" : "Descending"}`}
			>
				{/* Icon indicating direction could go here if needed */}
				<span className="text-xs">
					{sortCriteria.direction === "asc" ? "ASC" : "DESC"}
				</span>
			</Button>
		</div>
	</div>;
	const showFilterEmptyState =
		!isLoading &&
		hasLoadedOnce &&
		processedArticles.length === 0 &&
		(articles.length > 0 || hasActiveFilters); // Show if filters resulted in no matches

	return (
		<div className="h-full flex flex-col">
			<div className="border-b p-4 space-y-4">
				{/* New top bar content will go here */}
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
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{/* Use processedArticles for rendering */}
						{processedArticles.map((article, index) => (
							<ArticleCard key={article._id} article={article} index={index} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
