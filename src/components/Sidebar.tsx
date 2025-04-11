import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
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
import { useTheme } from "@/context/ThemeContext";
import { useSynchronizedAnimation } from "@/hooks/use-synchronized-animation";
import { authClient } from "@/lib/authClient"; // Import authClient
import { cn } from "@/lib/utils";
import {
	ChevronLeft,
	Home,
	Library,
	LogIn,
	LogOut, // Added for Sign Out button
	MenuIcon,
	Moon,
	Plus,
	Settings,
	Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

// New UserMenu component to replace Clerk's UserButton
const UserMenu = () => {
	const { data: session } = authClient.useSession();

	const handleSignOut = async () => {
		try {
			// Assume signOut exists on the client
			await authClient.signOut();
			// Redirect happens via ProtectedRoute or similar logic after session invalidation
		} catch (error) {
			console.error("Sign out failed:", error);
		}
	};

	// Assuming session.user structure based on common patterns
	const user = session?.user;

	if (!user) {
		// Shouldn't happen if rendered correctly, but good practice
		return null;
	}

	// Extract initials for fallback
	const initials =
		user.name
			?.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase() || "?";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
					<Avatar className="h-8 w-8">
						{/* Assuming 'image' property exists on user */}
						<AvatarImage
							src={user.image || undefined}
							alt={user.name || "User"}
						/>
						<AvatarFallback>{initials}</AvatarFallback>
					</Avatar>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="w-56" align="end" forceMount>
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col space-y-1">
						<p className="text-sm font-medium leading-none">
							{user.name || "User"}
						</p>
						{/* Assuming email is available */}
						{user.email && (
							<p className="text-xs leading-none text-muted-foreground">
								{user.email}
							</p>
						)}
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{/* Can add links to Profile/Settings here */}
				<DropdownMenuItem onClick={handleSignOut}>
					<LogOut className="mr-2 h-4 w-4" />
					<span>Sign out</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default function Sidebar() {
	const [collapsed, setCollapsed] = useState(false);
	const location = useLocation();
	const navigate = useNavigate();
	const { setCurrentView } = useArticles();
	const { theme, setTheme } = useTheme();
	const { synchronizeAnimations } = useAnimation();
	const { data: session } = authClient.useSession(); // Use session data
	const [isDarkMode, setIsDarkMode] = useState(false);

	// Create synchronized animations for the sidebar
	const sidebarAnimation = useSynchronizedAnimation({
		groupId: "sidebar",
		elementId: "sidebar-container",
		duration: 200,
	});

	useEffect(() => {
		const darkMode =
			theme === "dark" ||
			(theme === "system" &&
				window.matchMedia("(prefers-color-scheme: dark)").matches);
		setIsDarkMode(darkMode);

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

	const toggleTheme = () => {
		setTheme(theme === "dark" ? "light" : "dark");
	};

	const toggleCollapsed = () => {
		synchronizeAnimations(() => {
			setCollapsed(!collapsed);
		});
	};

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
						collapsed ? "w-full justify-center" : "ml-auto",
					)}
				>
					{!!session && <UserMenu />} {/* Use UserMenu */}
					<Button
						variant="ghost"
						size="icon"
						onClick={toggleCollapsed}
						className={cn("transition-transform duration-200")}
					>
						{collapsed ? <MenuIcon size={20} /> : <ChevronLeft size={20} />}
					</Button>
				</div>
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
							className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
							onClick={() => {
								setCurrentView("all");
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
						<Button
							variant="ghost"
							className="w-full flex items-center justify-start gap-3 py-2 transition-all duration-200"
							onClick={() => {
								setCurrentView("all");
								navigate("/inbox");
							}}
							style={isActive("/inbox") ? styles.activeLink : styles.link}
						>
							<Library size={20} />
							{!collapsed && (
								<span className="transition-opacity duration-200">Library</span>
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

						{!session && ( // Check !session instead of !isSignedIn
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

			{!!session && ( // Check !!session instead of isSignedIn
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
