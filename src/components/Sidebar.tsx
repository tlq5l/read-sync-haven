import { Button } from "@/components/ui/button";
import {
	TransitionGroup,
	TransitionItem,
} from "@/components/ui/transition-group";
import { useAnimation } from "@/context/AnimationContext";
import { useArticles } from "@/context/ArticleContext";
import { useTheme } from "@/context/ThemeContext";
import { useSynchronizedAnimation } from "@/hooks/use-synchronized-animation";
import { cn } from "@/lib/utils";
import {
	BookOpen,
	Bookmark,
	ChevronLeft,
	Clock,
	Library,
	MenuIcon,
	Moon,
	Plus,
	SearchIcon,
	Settings,
	Sun,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function Sidebar() {
	const [collapsed, setCollapsed] = useState(false);
	const location = useLocation();
	const { currentView, setCurrentView } = useArticles();
	const { theme, setTheme } = useTheme();
	const { synchronizeAnimations } = useAnimation();

	// Create synchronized animations for the sidebar
	const sidebarAnimation = useSynchronizedAnimation({
		groupId: "sidebar",
		elementId: "sidebar-container",
		duration: 200,
	});

	const isActive = (path: string) => location.pathname === path;
	const isViewActive = (view: "all" | "unread" | "favorites") =>
		currentView === view;

	const toggleTheme = () => {
		setTheme(theme === "dark" ? "light" : "dark");
	};

	const toggleCollapsed = () => {
		// Use synchronizeAnimations to ensure smooth transitions
		synchronizeAnimations(() => {
			setCollapsed(!collapsed);
		});
	};

	return (
		<div
			ref={sidebarAnimation.ref}
			className={cn(
				"h-screen flex flex-col border-r gpu-accelerated",
				"transition-all ease-in-out duration-200",
				collapsed ? "w-16" : "w-64",
			)}
		>
			<div className="flex items-center p-4 border-b">
				{!collapsed && (
					<h1 className="text-xl font-bold text-bondwise-600 transition-opacity duration-200">
						BondWise
					</h1>
				)}
				<Button
					variant="ghost"
					size="icon"
					onClick={toggleCollapsed}
					className={cn("ml-auto transition-transform duration-200")}
				>
					{collapsed ? <MenuIcon size={20} /> : <ChevronLeft size={20} />}
				</Button>
			</div>

			<div className="flex-grow overflow-y-auto py-4">
				<TransitionGroup
					groupId="sidebar-items"
					className="px-2 space-y-1"
					staggerChildren={true}
					staggerDelay={30}
					autoAnimate={true}
				>
					<TransitionItem showFrom="left" className="w-full">
						<Button
							variant="ghost"
							className={cn(
								"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
								isViewActive("all") &&
									"bg-bondwise-50 text-bondwise-600 dark:bg-bondwise-900 dark:text-bondwise-300",
							)}
							onClick={() => setCurrentView("all")}
						>
							<Library size={20} />
							{!collapsed && (
								<span className="transition-opacity duration-200">
									All Articles
								</span>
							)}
						</Button>
					</TransitionItem>

					<TransitionItem showFrom="left" className="w-full">
						<Button
							variant="ghost"
							className={cn(
								"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
								isViewActive("unread") &&
									"bg-bondwise-50 text-bondwise-600 dark:bg-bondwise-900 dark:text-bondwise-300",
							)}
							onClick={() => setCurrentView("unread")}
						>
							<Clock size={20} />
							{!collapsed && (
								<span className="transition-opacity duration-200">Unread</span>
							)}
						</Button>
					</TransitionItem>

					<TransitionItem showFrom="left" className="w-full">
						<Button
							variant="ghost"
							className={cn(
								"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
								isViewActive("favorites") &&
									"bg-bondwise-50 text-bondwise-600 dark:bg-bondwise-900 dark:text-bondwise-300",
							)}
							onClick={() => setCurrentView("favorites")}
						>
							<Bookmark size={20} />
							{!collapsed && (
								<span className="transition-opacity duration-200">
									Favorites
								</span>
							)}
						</Button>
					</TransitionItem>
				</TransitionGroup>

				<div className="mt-8 px-3">
					{!collapsed && (
						<h3 className="text-sm font-medium text-muted-foreground mb-2 transition-opacity duration-200">
							Navigation
						</h3>
					)}
					<TransitionGroup
						groupId="sidebar-navigation"
						className="space-y-1"
						staggerChildren={true}
						staggerDelay={30}
						autoAnimate={true}
					>
						<TransitionItem showFrom="left" className="w-full">
							<Button
								variant="ghost"
								className={cn(
									"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
									isActive("/") &&
										"bg-bondwise-50 text-bondwise-600 dark:bg-bondwise-900 dark:text-bondwise-300",
								)}
								asChild
							>
								<Link to="/">
									<BookOpen size={20} />
									{!collapsed && (
										<span className="transition-opacity duration-200">
											Home
										</span>
									)}
								</Link>
							</Button>
						</TransitionItem>

						<TransitionItem showFrom="left" className="w-full">
							<Button
								variant="ghost"
								className={cn(
									"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
									isActive("/search") &&
										"bg-bondwise-50 text-bondwise-600 dark:bg-bondwise-900 dark:text-bondwise-300",
								)}
								asChild
							>
								<Link to="/search">
									<SearchIcon size={20} />
									{!collapsed && (
										<span className="transition-opacity duration-200">
											Search
										</span>
									)}
								</Link>
							</Button>
						</TransitionItem>

						<TransitionItem showFrom="left" className="w-full">
							<Button
								variant="ghost"
								className={cn(
									"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
									isActive("/settings") &&
										"bg-bondwise-50 text-bondwise-600 dark:bg-bondwise-900 dark:text-bondwise-300",
								)}
								asChild
							>
								<Link to="/settings">
									<Settings size={20} />
									{!collapsed && (
										<span className="transition-opacity duration-200">
											Settings
										</span>
									)}
								</Link>
							</Button>
						</TransitionItem>

						<TransitionItem showFrom="left" className="w-full">
							<Button
								variant="ghost"
								className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
								onClick={toggleTheme}
							>
								{theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}
								{!collapsed && (
									<span className="transition-opacity duration-200">
										{theme === "dark" ? "Dark Mode" : "Light Mode"}
									</span>
								)}
							</Button>
						</TransitionItem>
					</TransitionGroup>
				</div>
			</div>

			<div className="p-4 border-t">
				<Button className="w-full gap-2 transition-all duration-200" asChild>
					<Link to="/add">
						<Plus size={18} />
						{!collapsed ? (
							<span className="transition-opacity duration-200">
								Add Content
							</span>
						) : null}
					</Link>
				</Button>
			</div>
		</div>
	);
}
