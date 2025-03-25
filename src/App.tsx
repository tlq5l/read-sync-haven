import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, ThemeSupport } from "@/context/ThemeContext";
import { prefersReducedMotion } from "@/lib/animation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";

import { BrowserRouter, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import AddPage from "./pages/AddPage";
import HomePage from "./pages/HomePage";
import NotFound from "./pages/NotFound";
import ReadPage from "./pages/ReadPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: Number.POSITIVE_INFINITY, // Since we're using PouchDB, we'll manually invalidate queries
		},
	},
});

const MotionPreferenceHandler = ({ children }: { children: React.ReactNode }) => {
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
		return () => {
			mediaQuery.removeEventListener("change", handleMotionPreferenceChange);
		};
	}, []);

	return <>{children}</>;
};

const App = () => (
	<ThemeProvider defaultTheme="system" storageKey="bondwise-ui-theme">
		<ThemeSupport />
		<MotionPreferenceHandler>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>
					<Toaster />
					<Sonner />
					<BrowserRouter>
						<Routes>
							<Route element={<Layout />}>
								<Route path="/" element={<HomePage />} />
								<Route path="/add" element={<AddPage />} />
								<Route path="/read/:id" element={<ReadPage />} />
								<Route path="/search" element={<SearchPage />} />
								<Route path="/settings" element={<SettingsPage />} />
							</Route>
							<Route path="*" element={<NotFound />} />
						</Routes>
					</BrowserRouter>
				</TooltipProvider>
			</QueryClientProvider>
		</MotionPreferenceHandler>
	</ThemeProvider>
);

export default App;
