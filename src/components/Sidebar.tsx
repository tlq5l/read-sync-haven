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
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

export default function Sidebar() {
	const [collapsed, setCollapsed] = useState(false);
	const location = useLocation();
	const { currentView, setCurrentView } = useArticles();
	const { theme, setTheme } = useTheme();
	const { synchronizeAnimations } = useAnimation();
	const { isSignedIn } = useAuth();
	const { user } = useUser();
	const [isDarkMode, setIsDarkMode] = useState(false);

	// Create synchronized animations for the sidebar
	const sidebarAnimation = useSynchronizedAnimation({
		groupId: "sidebar",
		elementId: "sidebar-container",
		duration: 200,
	});

	useEffect(() => {
		// Update dark mode state when theme changes
		const darkMode =
			theme === "dark" ||
			(theme === "system" &&
				window.matchMedia("(prefers-color-scheme: dark)").matches);
		setIsDarkMode(darkMode);

		// Add listener for system preference changes
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = (e: MediaQueryListEvent) => {
			if (theme === "system") {
				setIsDarkMode(e.matches);
			}
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [theme]);

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

	// Define styles directly to ensure visibility
	const styles = {
		container: {
			backgroundColor: isDarkMode ? "#131825" : "#ffffff",
			color: isDarkMode ? "#e1e7ef" : "#333333",
			borderColor: isDarkMode ? "#1f2937" : "#e5e7eb",
		},
		header: {
			color: isDarkMode ? "#ffffff" : "#111827",
			fontWeight: "bold",
		},
		navLabel: {
			color: isDarkMode ? "#9ca3af" : "#6b7280",
			fontWeight: 500,
		},
		link: {
			color: isDarkMode ? "#e1e7ef" : "#4b5563",
		},
		activeLink: {
			backgroundColor: isDarkMode ? "#1e293b" : "#f3f4f6",
			color: isDarkMode ? "#ffffff" : "#111827",
		},
		userGreeting: {
			color: isDarkMode ? "#d1d5db" : "#4b5563",
		},
	};

	return (
		<div
			ref={sidebarAnimation.ref}
			className={cn(
				"h-screen flex flex-col border-r gpu-accelerated",
				"transition-all ease-in-out duration-200",
				collapsed ? "w-16" : "w-64",
			)}
			style={styles.container}
		>
			<div
				className="flex items-center p-4 border-b"
				style={{ borderColor: styles.container.borderColor }}
			>
				{!collapsed && (
					<h1
						className="text-xl font-bold transition-opacity duration-200"
						style={styles.header}
					>
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
				<div
					className="px-4 py-2 text-sm border-b"
					style={{ borderColor: styles.container.borderColor }}
				>
					<p style={styles.userGreeting}>Hello, {user?.firstName || "User"}</p>
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
					<TransitionItem showFrom="left" className="w-full">
						<Button
							variant="ghost"
							className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
							onClick={() => setCurrentView("all")}
							style={isViewActive("all") ? styles.activeLink : styles.link}
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
							className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
							onClick={() => setCurrentView("unread")}
							style={isViewActive("unread") ? styles.activeLink : styles.link}
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
							className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
							onClick={() => setCurrentView("favorites")}
							style={
								isViewActive("favorites") ? styles.activeLink : styles.link
							}
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
						<h3
							className="text-sm font-medium mb-2 transition-opacity duration-200"
							style={styles.navLabel}
						>
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
						{/* Show these navigation items regardless of authentication state */}
						<TransitionItem showFrom="left" className="w-full">
							<Button
								variant="ghost"
								className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
								asChild
							>
								<Link
									to="/search"
									style={isActive("/search") ? styles.activeLink : styles.link}
								>
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
								className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
								asChild
							>
								<Link
									to="/settings"
									style={
										isActive("/settings") ? styles.activeLink : styles.link
									}
								>
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
								style={styles.link}
							>
								{theme === "dark" ? <Moon size={20} /> : <Sun size={20} />}
								{!collapsed && (
									<span className="transition-opacity duration-200">
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
									<Link to="/sign-in" style={styles.link}>
										<LogIn size={20} />
										{!collapsed && (
											<span className="transition-opacity duration-200">
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
				<div
					className="p-4 border-t"
					style={{ borderColor: styles.container.borderColor }}
				>
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
