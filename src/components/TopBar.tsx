// Removed unused React import
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useArticles } from "@/context/ArticleContext";
import type { ArticleSortField } from "@/types/articles";
import { ArrowDownUp, ChevronDown, Library } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

// Removed unused getSortLabel function

export default function TopBar() {
	const {
		currentView,
		setCurrentView,
		sortCriteria,
		setSortField,
		toggleSortDirection,
	} = useArticles();
	const location = useLocation();

	const isActive = (path: string) => location.pathname === path;

	return (
		<div className="flex items-center justify-between p-2 px-4 border-b bg-background text-foreground sticky top-0 z-10">
			{/* Left Section: Library Dropdown and Views */}
			<div className="flex items-center space-x-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="flex items-center gap-2 px-2">
							<Library size={18} />
							<span className="font-medium">Library</span>
							<ChevronDown size={16} className="opacity-50" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem
							onClick={() => setCurrentView("all")}
							disabled={currentView === "all"}
						>
							All
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setCurrentView("unread")}
							disabled={currentView === "unread"}
						>
							Unread
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setCurrentView("favorites")}
							disabled={currentView === "favorites"}
						>
							Favorites
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>

				{/* Navigation Links */}
				<Button
					variant="ghost"
					className={`px-2 ${isActive("/inbox") ? "text-foreground" : "text-muted-foreground"}`}
					asChild
				>
					<Link to="/inbox">Inbox</Link>
				</Button>
				<Button
					variant="ghost"
					className={`px-2 ${isActive("/later") ? "text-foreground" : "text-muted-foreground"}`}
					asChild
				>
					<Link to="/later">Later</Link>
				</Button>
				<Button
					variant="ghost"
					className={`px-2 ${isActive("/archive") ? "text-foreground" : "text-muted-foreground"}`}
					asChild
				>
					<Link to="/archive">Archive</Link>
				</Button>
			</div>

			{/* Right Section: Sorting */}
			<div className="flex items-center space-x-1">
				<Select
					value={sortCriteria.field}
					onValueChange={(value) => setSortField(value as ArticleSortField)}
				>
					<SelectTrigger className="w-auto min-w-[140px] h-8 px-2 border-none shadow-none bg-transparent hover:bg-accent focus:ring-0">
						<ArrowDownUp size={14} className="mr-1 opacity-50" />
						<SelectValue placeholder="Sort by..." />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="savedAt">Date Saved</SelectItem>
						<SelectItem value="title">Title</SelectItem>
						<SelectItem value="siteName">Source</SelectItem>
						<SelectItem value="estimatedReadTime">Read Time</SelectItem>
					</SelectContent>
				</Select>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					onClick={toggleSortDirection}
					aria-label={`Sort direction: ${sortCriteria.direction === "asc" ? "Ascending" : "Descending"}`}
				>
					{sortCriteria.direction === "asc" ? "↑" : "↓"}
				</Button>
			</div>
		</div>
	);
}
