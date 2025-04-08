import { Button } from "@/components/ui/button";
import {
	TransitionGroup,
	TransitionItem,
} from "@/components/ui/transition-group";
import { useAnimation } from "@/context/AnimationContext";
import { useArticles } from "@/context/ArticleContext";
import { useKeyboard } from "@/context/KeyboardContext"; // Import useKeyboard
// import { useTheme } from "@/context/ThemeContext"; // Removed as unused after theme toggle moved
import { useSynchronizedAnimation } from "@/hooks/use-synchronized-animation";
import { cn } from "@/lib/utils";
import type { ArticleCategory } from "@/services/db/types"; // Import ArticleCategory - Updated path
import { useAuth } from "@clerk/clerk-react"; // Removed unused useUser and UserButton
import {
	BookOpen, // Icon for Books
	ChevronDown, // Icon for Library open
	ChevronRight, // Icon for Library closed
	// ChevronLeft, // Removed old icon
	// ChevronRight, // Removed old icon
	// Clock, // Removed unused icon
	FileText, // Icon for PDFs
	Home,
	Library,
	LogIn,
	// MenuIcon, // Removed old icon
	// Moon, // Removed as unused after theme toggle moved
	Newspaper, // Icon for Articles
	// PanelLeftClose, // Removed old icon
	// PanelLeftOpen, // Removed old icon
	Plus,
	Settings,
	Shapes, // Icon for Other
	SidebarClose,
	SidebarOpen,
	// Sun,
	Video,
} from "lucide-react";
import React, { useState } from "react"; // Keep useState for isLibraryOpen
import { Link, useLocation, useNavigate } from "react-router-dom";

export default function Sidebar() {
	// const [collapsed, setCollapsed] = useState(false); // Replaced with context state
	const { isSidebarCollapsed: collapsed, toggleSidebar } = useKeyboard(); // Use context state and toggle
	const [isLibraryOpen, setIsLibraryOpen] = useState(true);
	const location = useLocation();
	const navigate = useNavigate();
	const { setCurrentView, setSelectedCategory, filters } = useArticles();
	const currentCategory = filters.category; // Extract current category
	// const { theme, setTheme } = useTheme(); // Removed as unused after theme toggle moved
	const { synchronizeAnimations } = useAnimation();
	const { isSignedIn } = useAuth();
	// const { user } = useUser(); // Removed as unused
	// const [isDarkMode, setIsDarkMode] = useState(false); // Removed: Using Tailwind dark mode variants (Corrected)

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

	// useEffect(() => { ... }, [theme]); // Removed: Tailwind handles dark mode (Corrected)

	const isActive = (path: string) => location.pathname === path;
	// const isViewActive = (view: "all" | "unread" | "favorites") =>
	// 	currentView === view; // Removed unused function

	// const toggleTheme = () => { // Removed as unused after theme toggle moved
	// 	setTheme(theme === "dark" ? "light" : "dark");
	// };

	// const toggleCollapsed = () => { // Replaced with toggleSidebar from context
	// 	// Use synchronizeAnimations to ensure smooth transitions
	// 	synchronizeAnimations(() => {
	// 		toggleSidebar(); // Call context function
	// 	});
	// };

	// Need a wrapper to combine animation sync and context toggle
	const handleToggleSidebar = () => {
		synchronizeAnimations(() => {
			toggleSidebar();
		});
	};

	// const styles = { ... }; // Removed: Using Tailwind classes (Corrected)

	return (
		<div
			ref={sidebarAnimation.ref}
			className={cn(
				"h-screen flex flex-col border-r gpu-accelerated",
				"bg-white text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:border-gray-700", // Added Tailwind classes
				"transition-all ease-in-out duration-200",
				collapsed ? "w-16" : "w-64",
			)}
			// style={styles.container} // Removed style prop
		>
			<div
				className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700" // Corrected: Single className with merged styles
				// style={{ borderColor: styles.container.borderColor }} // Style prop correctly removed
			>
				{!collapsed && (
					<h1
						className="text-xl font-bold transition-opacity duration-200 text-gray-900 dark:text-white" // Corrected: Single className with merged styles
						// style={styles.header} // Style prop correctly removed
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
						onClick={handleToggleSidebar} // Use the new handler
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
					className={cn("space-y-1", !collapsed && "px-2")} // Remove padding when collapsed
					staggerChildren={true}
					staggerDelay={30}
					autoAnimate={true}
				>
					<TransitionItem showFrom="left" className="w-full">
						{/* Home Button */}
						<Button
							variant="ghost"
							className={cn(
								"w-full flex items-center gap-3 py-2 transition-all duration-200", // Original cn()
								collapsed ? "justify-center" : "justify-start", // Original cn() arg
								"text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100", // Merged base styles
								isActive("/") &&
									"bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100", // Merged active styles
							)}
							onClick={() => {
								setCurrentView("all"); // Reset view when going home
								navigate("/");
							}}
							// style={isActive("/") ? styles.activeLink : styles.link} // Style prop correctly removed
						>
							<Home size={20} />
							{!collapsed && (
								<span className="transition-opacity duration-200">Home</span>
							)}
						</Button>
					</TransitionItem>

					<TransitionItem showFrom="left" className="w-full">
						{/* Library Button */}
						{/* Collapsible Library Trigger - Restructured to separate chevron and main button */}
						<div className="flex items-center w-full">
							{/* Chevron Button - Only for toggling dropdown */}
							{!collapsed && (
								<Button
									variant="ghost"
									size="sm"
									data-testid="library-expander-button" // Add test ID
									className="p-0 h-8 w-8 mr-1"
									onClick={(e) => {
										e.stopPropagation(); // Prevent event bubbling
										setIsLibraryOpen(!isLibraryOpen);
									}}
								>
									{isLibraryOpen ? (
										<ChevronDown size={16} />
									) : (
										<ChevronRight size={16} />
									)}
								</Button>
							)}
							{/* Main Library Button - Only for navigation */}
							<Button
								variant="ghost"
								className={cn(
									"flex items-center gap-3 py-2 transition-all duration-200", // Original cn()
									collapsed
										? "justify-center w-full"
										: "justify-start flex-grow", // Adjusted width
									"text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100", // Merged base styles
								)}
								onClick={() => {
									setSelectedCategory(null); // Clear category filter
									navigate("/inbox"); // Navigate to the main library view
								}}
								// style={styles.link} // Style prop correctly removed
							>
								<Library size={20} />{" "}
								{!collapsed && (
									<span className="transition-opacity duration-200 font-medium">
										Library
									</span>
								)}
							</Button>
						</div>
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
											className={cn(
												// Corrected: Single className with merged styles
												"w-full flex items-center justify-start gap-2 py-1 h-8 text-sm", // Original classes
												"text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100", // Merged base styles
												isActiveCategory &&
													"bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100", // Merged active styles
											)}
											onClick={() => {
												setSelectedCategory(cat);
												// Optional: navigate to a base view if needed
												// navigate("/inbox");
											}}
											// style={isActiveCategory ? styles.activeLink : styles.link} // Style prop correctly removed
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

				<div className={cn("mt-8", !collapsed && "px-3")}>
					{" "}
					{/* Remove padding when collapsed */}
					{!collapsed && (
						<h3
							className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 transition-opacity duration-200" // Corrected: Single className with merged styles
							// style={styles.navLabel} // Style prop correctly removed
						>
							Navigation
						</h3>
					)}
					<div className={cn("space-y-1")}>
						{" "}
						{/* Replaced TransitionGroup with plain div */}
						{/* Show these navigation items regardless of authentication state */}
						{/* Settings Link */}
						<Button
							variant="ghost"
							className={cn(
								"w-full flex items-center gap-3 py-2 transition-all duration-200",
								collapsed ? "justify-center" : "justify-start",
							)}
							asChild
						>
							<Link
								to="/settings"
								className={cn(
									"flex items-center gap-3 py-2",
									"w-full",
									"text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
									isActive("/settings") &&
										"bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100",
									collapsed ? "justify-center" : "justify-start",
								)}
							>
								<Settings size={20} />
								{!collapsed && (
									<span className="transition-opacity duration-200">
										Settings
									</span>
								)}
							</Link>
						</Button>
						{/* Theme Toggle Button - Removed, moved to Settings/Appearance */}
						{/* Sign In Link (Conditional) */}
						{!isSignedIn && (
							<Button
								variant="ghost"
								className={cn(
									"w-full flex items-center gap-3 py-2 transition-all duration-200",
									collapsed ? "justify-center" : "justify-start",
								)}
								asChild
							>
								<Link
									to="/sign-in"
									className={cn(
										"flex items-center gap-3 py-2",
										"w-full",
										"text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100",
										collapsed ? "justify-center" : "justify-start",
									)}
								>
									<LogIn size={20} />
									{!collapsed && (
										<span className="transition-opacity duration-200">
											Sign In
										</span>
									)}
								</Link>
							</Button>
						)}
					</div>{" "}
					{/* Closing plain div */}
				</div>
			</div>

			{isSignedIn && (
				<div
					className="p-4 border-t border-gray-200 dark:border-gray-700" // Corrected: Single className with merged styles
					// style={{ borderColor: styles.container.borderColor }} // Style prop correctly removed
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
