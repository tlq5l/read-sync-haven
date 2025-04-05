// Removed unused React import
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useArticles } from "@/context/ArticleContext";
import type { ArticleSortField } from "@/types/articles";
import { ArrowDownUp } from "lucide-react";
import { useTranslation } from "react-i18next"; // Added useTranslation
import { Link, useLocation } from "react-router-dom";

// Removed unused getSortLabel function

export default function TopBar() {
	const {
		// currentView, // Removed unused variable
		// setCurrentView, // Removed unused variable
		sortCriteria,
		setSortField,
		toggleSortDirection,
	} = useArticles();
	const location = useLocation();
	const { t } = useTranslation(); // Added translation hook
	const isActive = (path: string) => location.pathname === path;

	return (
		<div className="flex items-center justify-between p-2 px-4 border-b bg-background text-foreground sticky top-0 z-10">
			{/* Left Section: Library Dropdown and Views */}
			<div className="flex items-center space-x-2">
				{/* Library Dropdown Removed */}

				{/* Navigation Links */}
				<Button
					variant="ghost"
					className={`px-2 ${isActive("/inbox") ? "text-foreground" : "text-muted-foreground"}`}
					asChild
				>
					<Link to="/inbox">{t("sidebar.inbox")}</Link>
				</Button>
				<Button
					variant="ghost"
					className={`px-2 ${isActive("/later") ? "text-foreground" : "text-muted-foreground"}`}
					asChild
				>
					<Link to="/later">{t("sidebar.later")}</Link>
				</Button>
				<Button
					variant="ghost"
					className={`px-2 ${isActive("/archive") ? "text-foreground" : "text-muted-foreground"}`}
					asChild
				>
					<Link to="/archive">{t("sidebar.archive")}</Link>
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
						<SelectValue placeholder={t("topBar.sort.placeholder")} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="savedAt">
							{t("topBar.sort.dateSaved")}
						</SelectItem>
						<SelectItem value="title">{t("topBar.sort.title")}</SelectItem>
						<SelectItem value="siteName">{t("topBar.sort.source")}</SelectItem>
						<SelectItem value="estimatedReadTime">
							{t("topBar.sort.readTime")}
						</SelectItem>
					</SelectContent>
				</Select>
				<Button
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					onClick={toggleSortDirection}
					aria-label={t(
						sortCriteria.direction === "asc"
							? "topBar.sort.ariaLabelAsc"
							: "topBar.sort.ariaLabelDesc",
					)}
				>
					{sortCriteria.direction === "asc" ? "↑" : "↓"}
				</Button>
			</div>
		</div>
	);
}
