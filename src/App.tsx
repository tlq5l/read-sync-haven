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
// Removed AuthProvider import as it's not used
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
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
// import SignUpPage from "./pages/SignUpPage"; // Removed as page is deleted

// Env var checks removed from here, now handled in src/lib/authClient.ts
// const BETTER_AUTH_CLIENT_ID = import.meta.env.VITE_BETTER_AUTH_CLIENT_ID;
// const BETTER_AUTH_DOMAIN = import.meta.env.VITE_BETTER_AUTH_DOMAIN;

// if (!BETTER_AUTH_CLIENT_ID) {
// 	throw new Error("Missing VITE_BETTER_AUTH_CLIENT_ID");
// }
// if (!BETTER_AUTH_DOMAIN) {
// 	throw new Error("Missing VITE_BETTER_AUTH_DOMAIN");
// }

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

const AppWithRouter = () => (
	<BrowserRouter>
		<KeyboardProvider>
			<Routes>
				{/* Public auth routes */}
				<Route path="/sign-in/*" element={<SignInPage />} />
				{/* <Route path="/sign-up/*" element={<SignUpPage />} /> Removed route */}

				{/* Protected routes */}
				<Route element={<ProtectedRoute />}>
					<Route element={<Layout />}>
						<Route path="/" element={<HomePage />} />{" "}
						{/* Keep this pointing to the new HomePage */}
						<Route path="/add" element={<AddPage />} />
						<Route path="/read/:id" element={<ReadPage />} />
						<Route path="/search" element={<SearchPage />} />
						<Route path="/settings" element={<SettingsPage />} />
						<Route path="/inbox" element={<InboxPage />} />
						<Route path="/later" element={<LaterPage />} />
						<Route path="/archive" element={<ArchivePage />} />
					</Route>
				</Route>

				{/* 404 route */}
				<Route path="*" element={<NotFound />} />
			</Routes>
			<ShortcutsDialog />
		</KeyboardProvider>
	</BrowserRouter>
);

// App component no longer needs AuthProvider wrapper
const App = () => (
	<ThemeProvider defaultTheme="system" storageKey="bondwise-ui-theme">
		<ThemeSupport />
		<AnimationProvider>
			<MotionPreferenceHandler>
				<QueryClientProvider client={queryClient}>
					<TooltipProvider>
						<Toaster />
						<Sonner />
						<AppWithRouter />
					</TooltipProvider>
				</QueryClientProvider>
			</MotionPreferenceHandler>
		</AnimationProvider>
	</ThemeProvider>
); // Removed closing AuthProvider tag

export default App;
