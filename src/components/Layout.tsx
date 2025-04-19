import { TransitionGroup } from "@/components/ui/transition-group";
import { useAnimation } from "@/context/AnimationContext";
// ArticleProvider import removed, will be moved to App.tsx
// Removed useOffline import: import { useOffline } from "@/hooks/use-offline";

import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import OfflineIndicator from "./OfflineIndicator";
import Sidebar from "./Sidebar";

/**
 * Renders the main application layout with sidebar navigation, animated route transitions, and an offline status indicator.
 *
 * The layout triggers page transition animations after each route change and displays nested routes via {@link Outlet}.
 */
export default function Layout() {
	// Removed useOffline hook call
	const { animateAll } = useAnimation();

	// Trigger animations on route changes
	useEffect(() => {
		// Small delay to ensure components are ready
		const timer = setTimeout(() => {
			animateAll();
		}, 10);

		return () => clearTimeout(timer);
	}, [animateAll]);

	return (
		// Return content within a single fragment, ArticleProvider removed
		<>
			<div className="flex h-screen bg-background">
				<Sidebar />
				<TransitionGroup
					className="flex-1 overflow-hidden"
					groupId="main-content"
					timeout={250}
					autoAnimate={false}
				>
					<main className="h-full">
						<Outlet />
					</main>
				</TransitionGroup>
			</div>
			<OfflineIndicator />
		</>
	);
}
