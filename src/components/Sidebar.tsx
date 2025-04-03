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
import type { ArticleCategory } from "@/services/db"; // Import ArticleCategory
import { useAuth } from "@clerk/clerk-react"; // Removed unused useUser and UserButton
import {
	BookOpen, // Icon for Books
	ChevronsUpDown, // Icon for Library collapse
	// ChevronLeft, // Removed old icon
	// ChevronRight, // Removed old icon
	// Clock, // Removed unused icon
	FileText, // Icon for PDFs
	Home,
	Library,
	LogIn,
	// MenuIcon, // Removed old icon
	Moon,
	Newspaper, // Icon for Articles
	// PanelLeftClose, // Removed old icon
	// PanelLeftOpen, // Removed old icon
	Plus,
	Settings,
	Shapes, // Icon for Other
	SidebarClose, // New icon for sidebar collapse
	SidebarOpen, // New icon for sidebar expand
	Sun,
	Video, // Icon for Videos
} from "lucide-react";
import React, { useEffect, useState } from "react"; // Add React default import
import { Link, useLocation, useNavigate } from "react-router-dom";

export default function Sidebar() {
	const [collapsed, setCollapsed] = useState(false);
	const [isLibraryOpen, setIsLibraryOpen] = useState(true); // State for library collapse
	const location = useLocation();
	const navigate = useNavigate();
	const { setCurrentView, setSelectedCategory, filters } = useArticles(); // Add category filter state and setter
	const currentCategory = filters.category; // Extract current category
	const { theme, setTheme } = useTheme();
	const { synchronizeAnimations } = useAnimation();
	const { isSignedIn } = useAuth();
	// const { user } = useUser(); // Removed as unused
	const [isDarkMode, setIsDarkMode] = useState(false);

	// Define categories for the dropdown (excluding "All")
	const categories: ArticleCategory[] = [
		"article",
		"book",
		"pdf",
		"video",
		"other",
	];

	// Map categories to icons
	const categoryIcons: Record<ArticleCategory, React.ElementType> = {
		article: Newspaper,
		book: BookOpen,
		pdf: FileText,
		video: Video,
		other: Shapes,
	};

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
	// const isViewActive = (view: "all" | "unread" | "favorites") =>
	// 	currentView === view; // Removed unused function

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
				<div
					className={cn(
						"flex items-center",
						collapsed ? "w-full justify-center" : "ml-auto", // Center content when collapsed
					)}
				>
					{/* UserButton removed, moved to Settings page */}
					<Button
						variant="ghost"
						size="icon"
						onClick={toggleCollapsed}
						className={cn(
							"transition-transform duration-200",
							// Removed conditional margin, parent div handles centering/alignment
						)}
					>
						{collapsed ? <SidebarOpen size={20} /> : <SidebarClose size={20} />}
					</Button>
				</div>
			</div>

			{/* User greeting section removed */}

			<div className="flex-grow overflow-y-auto py-4">
				<TransitionGroup
					groupId="sidebar-items"
					className="px-2 space-y-1"
					staggerChildren={true}
					staggerDelay={30}
					autoAnimate={true}
				>
					<TransitionItem showFrom="left" className="w-full">
						{/* Home Button */}
						<Button
							variant="ghost"
							className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
							onClick={() => {
								setCurrentView("all"); // Reset view when going home
								navigate("/");
							}}
							style={isActive("/") ? styles.activeLink : styles.link}
						>
							<Home size={20} />
							{!collapsed && (
								<span className="transition-opacity duration-200">Home</span>
							)}
						</Button>
					</TransitionItem>

					<TransitionItem showFrom="left" className="w-full">
						{/* Library Button */}
						{/* Collapsible Library Trigger */}
						<Button
							variant="ghost"
							className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
							onClick={() => {
								setIsLibraryOpen(!isLibraryOpen);
								setSelectedCategory(null); // Clear category filter
								navigate("/inbox"); // Navigate to the main library view
							}}
							style={styles.link} // Use base link style for the trigger
						>
							<ChevronsUpDown size={16} /> {/* Use single icon */}
							<Library size={20} className="ml-1" /> {/* Adjust icon spacing */}
							{!collapsed && (
								<span className="transition-opacity duration-200 font-medium">
									Library
								</span>
							)}
						</Button>
						{/* Collapsible Category List - Render directly below trigger if open */}
						{isLibraryOpen && !collapsed && (
							<div className="w-full pl-6 mt-1 space-y-1">
								{categories.map((cat) => {
									// Handle PDF capitalization specifically
									const label =
										cat === "pdf"
											? "PDFs"
											: `${cat.charAt(0).toUpperCase() + cat.slice(1)}s`;
									const isActiveCategory = currentCategory === cat;
									return (
										<Button
											key={cat ?? "all"}
											variant="ghost"
											size="sm"
											className="w-full flex items-center justify-start gap-2 py-1 h-8 text-sm"
											onClick={() => {
												setSelectedCategory(cat);
												// Optional: navigate to a base view if needed
												// navigate("/inbox");
											}}
											style={isActiveCategory ? styles.activeLink : styles.link}
										>
											{/* Render the icon */}
											{React.createElement(categoryIcons[cat], {
												size: 16,
												className: "mr-2",
											})}
											<span>{label}</span>
										</Button>
									);
								})}
							</div>
						)}
					</TransitionItem>

					{/* Removed Unread and Favorites buttons - handled by TopBar */}
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
