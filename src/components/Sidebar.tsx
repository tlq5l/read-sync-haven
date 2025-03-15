import { Button } from "@/components/ui/button";
import { useArticles } from "@/context/ArticleContext";
import { cn } from "@/lib/utils";
import {
	BookOpen,
	Bookmark,
	ChevronLeft,
	Clock,
	Library,
	MenuIcon,
	Plus,
	SearchIcon,
	Settings,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function Sidebar() {
	const [collapsed, setCollapsed] = useState(false);
	const location = useLocation();
	const { currentView, setCurrentView } = useArticles();

	const isActive = (path: string) => location.pathname === path;
	const isViewActive = (view: "all" | "unread" | "favorites") =>
		currentView === view;

	return (
		<div
			className={cn(
				"h-screen flex flex-col border-r transition-all ease-in-out duration-300",
				collapsed ? "w-16" : "w-64",
			)}
		>
			<div className="flex items-center p-4 border-b">
				{!collapsed && (
					<h1 className="text-xl font-bold text-bondwise-600">BondWise</h1>
				)}
				<Button
					variant="ghost"
					size="icon"
					onClick={() => setCollapsed(!collapsed)}
					className={cn("ml-auto")}
				>
					{collapsed ? <MenuIcon size={20} /> : <ChevronLeft size={20} />}
				</Button>
			</div>

			<div className="flex-grow overflow-y-auto py-4">
				<div className="px-2 space-y-1">
					<Button
						variant="ghost"
						className={cn(
							"w-full flex items-center justify-start gap-3 py-2",
							isViewActive("all") && "bg-bondwise-50 text-bondwise-600",
						)}
						onClick={() => setCurrentView("all")}
					>
						<Library size={20} />
						{!collapsed && <span>All Articles</span>}
					</Button>

					<Button
						variant="ghost"
						className={cn(
							"w-full flex items-center justify-start gap-3 py-2",
							isViewActive("unread") && "bg-bondwise-50 text-bondwise-600",
						)}
						onClick={() => setCurrentView("unread")}
					>
						<Clock size={20} />
						{!collapsed && <span>Unread</span>}
					</Button>

					<Button
						variant="ghost"
						className={cn(
							"w-full flex items-center justify-start gap-3 py-2",
							isViewActive("favorites") && "bg-bondwise-50 text-bondwise-600",
						)}
						onClick={() => setCurrentView("favorites")}
					>
						<Bookmark size={20} />
						{!collapsed && <span>Favorites</span>}
					</Button>
				</div>

				<div className="mt-8 px-3">
					{!collapsed && (
						<h3 className="text-sm font-medium text-muted-foreground mb-2">
							Navigation
						</h3>
					)}
					<div className="space-y-1">
						<Button
							variant="ghost"
							className={cn(
								"w-full flex items-center justify-start gap-3 py-2",
								isActive("/") && "bg-bondwise-50 text-bondwise-600",
							)}
							asChild
						>
							<Link to="/">
								<BookOpen size={20} />
								{!collapsed && <span>Home</span>}
							</Link>
						</Button>

						<Button
							variant="ghost"
							className={cn(
								"w-full flex items-center justify-start gap-3 py-2",
								isActive("/search") && "bg-bondwise-50 text-bondwise-600",
							)}
							asChild
						>
							<Link to="/search">
								<SearchIcon size={20} />
								{!collapsed && <span>Search</span>}
							</Link>
						</Button>

						<Button
							variant="ghost"
							className={cn(
								"w-full flex items-center justify-start gap-3 py-2",
								isActive("/settings") && "bg-bondwise-50 text-bondwise-600",
							)}
							asChild
						>
							<Link to="/settings">
								<Settings size={20} />
								{!collapsed && <span>Settings</span>}
							</Link>
						</Button>
					</div>
				</div>
			</div>

			<div className="p-4 border-t">
				<Button className="w-full gap-2" asChild>
					<Link to="/add">
						<Plus size={18} />
						{!collapsed ? "Add Content" : null}
					</Link>
				</Button>
			</div>
		</div>
	);
}
