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
import { UserButton, useAuth, useUser } from "@clerk/clerk-react";
import {
	BookOpen,
	Bookmark,
	ChevronLeft,
	Clock,
	Library,
	LogIn,
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
	const { isSignedIn } = useAuth();
	const { user } = useUser();

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

	// Get system or user-selected theme
	const isDarkMode = theme === "dark" || 
	  (theme === "system" && window.matchMedia('(prefers-color-scheme: dark)').matches);

	return (
		<div
			ref={sidebarAnimation.ref}
			className={cn(
				"h-screen flex flex-col border-r gpu-accelerated",
				"transition-all ease-in-out duration-200",
				isDarkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900",
				collapsed ? "w-16" : "w-64",
			)}
		>
			<div className={cn(
				"flex items-center p-4 border-b",
				isDarkMode ? "border-gray-700" : "border-gray-200"
			)}>
				{!collapsed && (
					<h1 className={cn(
						"text-xl font-bold transition-opacity duration-200",
						isDarkMode ? "text-white" : "text-gray-900"
					)}>
						Read Sync Haven
					</h1>
				)}
				<div className="ml-auto flex items-center">
					{isSignedIn && (
						<UserButton
							afterSignOutUrl="/sign-in"
							appearance={{
								elements: {
									userButtonAvatarBox: "w-8 h-8",
								},
							}}
						/>
					)}
					<Button
						variant="ghost"
						size="icon"
						onClick={toggleCollapsed}
						className={cn(
							"transition-transform duration-200",
							isSignedIn ? "ml-2" : "ml-auto",
						)}
					>
						{collapsed ? <MenuIcon size={20} /> : <ChevronLeft size={20} />}
					</Button>
				</div>
			</div>

			{/* User greeting */}
			{isSignedIn && !collapsed && (
				<div className={cn(
					"px-4 py-2 text-sm border-b",
					isDarkMode ? "border-gray-700" : "border-gray-200"
				)}>
					<p className={isDarkMode ? "text-gray-300" : "text-gray-700"}>
						Hello, {user?.firstName || "User"}
					</p>
				</div>
			)}

			<div className="flex-grow overflow-y-auto py-4">
				<TransitionGroup
					groupId="sidebar-items"
					className="px-2 space-y-1"
					staggerChildren={true}
					staggerDelay={30}
					autoAnimate={true}
				>
					{isSignedIn && (
						<>
							<TransitionItem showFrom="left" className="w-full">
								<Button
									variant="ghost"
									className={cn(
										"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
										isViewActive("all") && isDarkMode
											? "bg-gray-800 text-white"
											: isViewActive("all") && !isDarkMode
											? "bg-gray-100 text-gray-900"
											: "",
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
										isViewActive("unread") && isDarkMode
											? "bg-gray-800 text-white"
											: isViewActive("unread") && !isDarkMode
											? "bg-gray-100 text-gray-900"
											: "",
									)}
									onClick={() => setCurrentView("unread")}
								>
									<Clock size={20} />
									{!collapsed && (
										<span className="transition-opacity duration-200">
											Unread
										</span>
									)}
								</Button>
							</TransitionItem>

							<TransitionItem showFrom="left" className="w-full">
								<Button
									variant="ghost"
									className={cn(
										"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
										isViewActive("favorites") && isDarkMode
											? "bg-gray-800 text-white"
											: isViewActive("favorites") && !isDarkMode
											? "bg-gray-100 text-gray-900"
											: "",
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
						</>
					)}
				</TransitionGroup>

				<div className="mt-8 px-3">
					{!collapsed && (
						<h3 className={cn(
							"text-sm font-medium mb-2 transition-opacity duration-200",
							isDarkMode ? "text-gray-400" : "text-gray-500",
						)}>
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
									isActive("/") && isDarkMode
										? "bg-gray-800 text-white"
										: isActive("/") && !isDarkMode
										? "bg-gray-100 text-gray-900"
										: "",
								)}
								asChild
							>
								<Link to="/">
									<BookOpen size={20} />
									{!collapsed && (
										<span className={cn(
											"transition-opacity duration-200",
											isDarkMode ? "text-gray-100" : "text-gray-800",
										)}>
											Home
										</span>
									)}
								</Link>
							</Button>
						</TransitionItem>

						{isSignedIn && (
							<>
								<TransitionItem showFrom="left" className="w-full">
									<Button
										variant="ghost"
										className={cn(
											"w-full flex items-center justify-start gap-3 py-2 transition-all duration-200",
											isActive("/search") && isDarkMode
												? "bg-gray-800 text-white"
												: isActive("/search") && !isDarkMode
												? "bg-gray-100 text-gray-900"
												: "",
										)}
										asChild
									>
										<Link to="/search">
											<SearchIcon size={20} />
											{!collapsed && (
												<span className={cn(
													"transition-opacity duration-200",
													isDarkMode ? "text-gray-100" : "text-gray-800",
												)}>
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
											isActive("/settings") && isDarkMode
												? "bg-gray-800 text-white"
												: isActive("/settings") && !isDarkMode
												? "bg-gray-100 text-gray-900"
												: "",
										)}
										asChild
									>
										<Link to="/settings">
											<Settings size={20} />
											{!collapsed && (
												<span className={cn(
													"transition-opacity duration-200",
													isDarkMode ? "text-gray-100" : "text-gray-800",
												)}>
													Settings
												</span>
											)}
										</Link>
									</Button>
								</TransitionItem>
							</>
						)}

						<TransitionItem showFrom="left" className="w-full">
							<Button
								variant="ghost"
								className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
								onClick={toggleTheme}
							>
								{theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}
								{!collapsed && (
									<span className={cn(
										"transition-opacity duration-200",
										isDarkMode ? "text-gray-100" : "text-gray-800",
									)}>
										{theme === "dark" ? "Dark Mode" : "Light Mode"}
									</span>
								)}
							</Button>
						</TransitionItem>

						{!isSignedIn && (
							<TransitionItem showFrom="left" className="w-full">
								<Button
									variant="ghost"
									className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
									asChild
								>
									<Link to="/sign-in">
										<LogIn size={20} />
										{!collapsed && (
											<span className={cn(
												"transition-opacity duration-200",
												isDarkMode ? "text-gray-100" : "text-gray-800",
											)}>
												Sign In
											</span>
										)}
									</Link>
								</Button>
							</TransitionItem>
						)}
					</TransitionGroup>
				</div>
			</div>

			{isSignedIn && (
				<div className={cn(
					"p-4 border-t",
					isDarkMode ? "border-gray-700" : "border-gray-200",
				)}>
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
			)}
		</div>
	);
}
