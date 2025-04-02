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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	TransitionGroup,
	TransitionItem,
} from "@/components/ui/transition-group";
import { useAnimation } from "@/context/AnimationContext";
import { useArticles } from "@/context/ArticleContext";
import { useDebounce } from "@/hooks/useDebounce"; // Import debounce hook
import { createAnimationFrame } from "@/lib/animation";
import { getUniqueArticleTypes, getUniqueSiteNames } from "@/lib/articleUtils"; // Import utils
import type { ArticleSortField } from "@/types/articles";
import { ArrowDownUp, Filter, Plus, RefreshCw, Search, X } from "lucide-react"; // Import icons
import { useEffect, useMemo, useRef, useState } from "react"; // Import useMemo, removed unused React import
import { Link } from "react-router-dom";

export default function HomePage() {
	const {
		articles, // Raw articles for deriving filter options
		processedArticles, // Use this for display
		isLoading,
		currentView, // Keep for title, maybe integrate into filters later?
		refreshArticles,
		error,
		retryLoading,
		filters,
		setFilters,
		setSearchQuery,
		sortCriteria,
		setSortField,
		toggleSortDirection,
		allTags, // Use for tag filter
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

	const getViewTitle = () => {
		switch (currentView) {
			case "unread":
				return "Unread Articles";
			case "favorites":
				return "Favorite Articles";
			default:
				return "Home";
		}
	};

	// Determine if we should show the empty state
	// Only show it if we're not loading AND we've completed at least one load
	// Derive unique filter options from raw articles (memoize for performance)
	const uniqueSiteNames = useMemo(
		() => getUniqueSiteNames(articles),
		[articles],
	);
	const uniqueTypes = useMemo(
		() => getUniqueArticleTypes(articles),
		[articles],
	);

	// Determine if we should show the empty state
	const hasActiveFilters =
		filters.searchQuery ||
		filters.siteNames.length > 0 ||
		filters.tags.length > 0 ||
		filters.types.length > 0;
	const showInitialEmptyState =
		!isLoading && hasLoadedOnce && articles.length === 0 && !hasActiveFilters;
	const showFilterEmptyState =
		!isLoading &&
		hasLoadedOnce &&
		processedArticles.length === 0 &&
		(articles.length > 0 || hasActiveFilters); // Show if filters resulted in no matches

	return (
		<div className="h-full flex flex-col">
			<div className="border-b p-4 space-y-4">
				<h1 className="text-2xl font-bold">{getViewTitle()}</h1>

				{/* Search, Sort, and Filter Controls */}
				<div className="flex flex-wrap gap-2 items-center">
					{/* Search Input */}
					<div className="relative flex-grow min-w-[200px] sm:flex-grow-0 sm:w-auto">
						<Search
							className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							type="search"
							placeholder="Search title, excerpt..."
							value={localSearchQuery}
							onChange={(e) => setLocalSearchQuery(e.target.value)}
							className="pl-8 pr-8 h-9" // Add padding for icons
						/>
						{localSearchQuery && (
							<Button
								variant="ghost"
								size="icon"
								className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
								onClick={() => setLocalSearchQuery("")}
							>
								<X className="h-4 w-4" />
								<span className="sr-only">Clear search</span>
							</Button>
						)}
					</div>

					{/* Sort Controls */}
					<div className="flex gap-1 items-center">
						<Select
							value={sortCriteria.field}
							onValueChange={(value) => setSortField(value as ArticleSortField)}
						>
							<SelectTrigger className="h-9 w-[150px]">
								<SelectValue placeholder="Sort by" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="savedAt">Date Saved</SelectItem>
								<SelectItem value="title">Title</SelectItem>
								<SelectItem value="siteName">Source</SelectItem>
								<SelectItem value="estimatedReadTime">Read Time</SelectItem>
							</SelectContent>
						</Select>
						<Button
							variant="outline"
							size="icon"
							className="h-9 w-9"
							onClick={toggleSortDirection}
							aria-label={`Sort direction: ${sortCriteria.direction === "asc" ? "Ascending" : "Descending"}`}
						>
							<ArrowDownUp className="h-4 w-4" />
						</Button>
					</div>

					{/* Filter Controls */}
					<div className="flex gap-1 items-center">
						{/* Site Filter */}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="h-9">
									<Filter className="mr-2 h-4 w-4" /> Site
									{filters.siteNames.length > 0 && (
										<span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs">
											{filters.siteNames.length}
										</span>
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuLabel>Filter by Site</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{uniqueSiteNames.map((site) => (
									<DropdownMenuCheckboxItem
										key={site}
										checked={filters.siteNames.includes(site)}
										onCheckedChange={(checked) => {
											setFilters((prev) => ({
												...prev,
												siteNames: checked
													? [...prev.siteNames, site]
													: prev.siteNames.filter((s) => s !== site),
											}));
										}}
									>
										{site || "Unknown"}
									</DropdownMenuCheckboxItem>
								))}
								{uniqueSiteNames.length === 0 && (
									<DropdownMenuItem disabled>No sites found</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>

						{/* Type Filter */}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="h-9">
									<Filter className="mr-2 h-4 w-4" /> Type
									{filters.types.length > 0 && (
										<span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs">
											{filters.types.length}
										</span>
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuLabel>Filter by Type</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{uniqueTypes.map((type) => (
									<DropdownMenuCheckboxItem
										key={type}
										checked={filters.types.includes(type)}
										onCheckedChange={(checked) => {
											setFilters((prev) => ({
												...prev,
												types: checked
													? [...prev.types, type]
													: prev.types.filter((t) => t !== type),
											}));
										}}
									>
										{type.charAt(0).toUpperCase() + type.slice(1)}
									</DropdownMenuCheckboxItem>
								))}
								{uniqueTypes.length === 0 && (
									<DropdownMenuItem disabled>No types found</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>

						{/* Tag Filter */}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" className="h-9">
									<Filter className="mr-2 h-4 w-4" /> Tag
									{filters.tags.length > 0 && (
										<span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs">
											{filters.tags.length}
										</span>
									)}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuLabel>Filter by Tag</DropdownMenuLabel>
								<DropdownMenuSeparator />
								{allTags.map((tag) => (
									<DropdownMenuCheckboxItem
										key={tag._id}
										checked={filters.tags.includes(tag._id)}
										onCheckedChange={(checked) => {
											setFilters((prev) => ({
												...prev,
												tags: checked
													? [...prev.tags, tag._id]
													: prev.tags.filter((t) => t !== tag._id),
											}));
										}}
									>
										{tag.name}
									</DropdownMenuCheckboxItem>
								))}
								{allTags.length === 0 && (
									<DropdownMenuItem disabled>No tags found</DropdownMenuItem>
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
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
