import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimationProvider } from "@/context/AnimationContext";
import { KeyboardProvider } from "@/context/KeyboardContext";
import { ThemeProvider, ThemeSupport } from "@/context/ThemeContext";
import {
	prefersReducedMotion,
	setupGlobalAnimationTimings,
} from "@/lib/animation";
import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArticleProvider } from "./context/ArticleContext"; // Import ArticleProvider

import { BrowserRouter, Route, Routes } from "react-router-dom";
import GlobalSearchOverlay from "./components/GlobalSearchOverlay"; // Import the new overlay
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
import { useKeyboard } from "./context/KeyboardContext"; // Import useKeyboard hook
import AddPage from "./pages/AddPage";
import ArchivePage from "./pages/ArchivePage";
import HomePage from "./pages/HomePage";
import InboxPage from "./pages/InboxPage";
import LaterPage from "./pages/LaterPage";
import NotFound from "./pages/NotFound";
import ReadPage from "./pages/ReadPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";

// Import publishable key from environment variables
const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
	throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: Number.POSITIVE_INFINITY, // Since we're using PouchDB, we'll manually invalidate queries
		},
	},
});

const MotionPreferenceHandler = ({
	children,
}: { children: React.ReactNode }) => {
	useEffect(() => {
		// Apply reducedMotion class to the html element if user prefers reduced motion
		if (prefersReducedMotion()) {
			document.documentElement.classList.add("reduce-motion");
		} else {
			document.documentElement.classList.remove("reduce-motion");
		}

		// Listen for changes in preference
		const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
		const handleMotionPreferenceChange = (e: MediaQueryListEvent) => {
			if (e.matches) {
				document.documentElement.classList.add("reduce-motion");
			} else {
				document.documentElement.classList.remove("reduce-motion");
			}
		};

		mediaQuery.addEventListener("change", handleMotionPreferenceChange);

		// Setup global animation timings
		setupGlobalAnimationTimings();

		return () => {
			mediaQuery.removeEventListener("change", handleMotionPreferenceChange);
		};
	}, []);

	return <>{children}</>;
};

const AppWithRouter = () => {
	// Get search overlay state and close function from context
	const { isSearchOverlayOpen, closeSearchOverlay } = useKeyboard();

	return (
		// Return content within a single fragment
		<>
			<Routes>
				{/* Public auth routes */}
				<Route path="/sign-in/*" element={<SignInPage />} />
				<Route path="/sign-up/*" element={<SignUpPage />} />

				{/* Protected routes */}
				<Route element={<ProtectedRoute />}>
					<Route element={<Layout />}>
						<Route path="/" element={<HomePage />} />{" "}
						{/* Keep this pointing to the new HomePage */}
						<Route path="/add" element={<AddPage />} />
						<Route path="/read/:id" element={<ReadPage />} />
						<Route path="/search" element={<SearchPage />} />
						<Route path="/settings/*" element={<SettingsPage />} />{" "}
						{/* Added wildcard for Clerk routing */}
						<Route path="/inbox" element={<InboxPage />} />
						<Route path="/later" element={<LaterPage />} />
						<Route path="/archive" element={<ArchivePage />} />
					</Route>
				</Route>

				{/* 404 route */}
				<Route path="*" element={<NotFound />} />
			</Routes>
			<ShortcutsDialog />
			{/* Render the search overlay */}
			<GlobalSearchOverlay
				isOpen={isSearchOverlayOpen}
				onClose={closeSearchOverlay}
			/>
		</>
	);
};

const App = () => (
	<ClerkProvider
		publishableKey={PUBLISHABLE_KEY}
		signInUrl="/sign-in"
		signUpUrl="/sign-up"
	>
		<ThemeProvider defaultTheme="system" storageKey="bondwise-ui-theme">
			<ThemeSupport />
			<AnimationProvider>
				<MotionPreferenceHandler>
					<QueryClientProvider client={queryClient}>
						<TooltipProvider>
							<Toaster />
							<Sonner />
							{/* Wrap AppWithRouter with KeyboardProvider */}
							{/* Wrap KeyboardProvider with BrowserRouter */}
							{/* Wrap BrowserRouter with ArticleProvider */}
							<ArticleProvider>
								<BrowserRouter>
									<KeyboardProvider>
										<AppWithRouter />
									</KeyboardProvider>
								</BrowserRouter>
							</ArticleProvider>
						</TooltipProvider>
					</QueryClientProvider>
				</MotionPreferenceHandler>
			</AnimationProvider>
		</ThemeProvider>
	</ClerkProvider>
);

export default App;
