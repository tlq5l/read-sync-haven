import { TransitionGroup } from "@/components/ui/transition-group";
import { ArticleProvider } from "@/context/ArticleContext";
import { useAnimation } from "@/context/AnimationContext";
import { useOffline } from "@/hooks/use-offline";

import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import OfflineIndicator from "./OfflineIndicator";
import Sidebar from "./Sidebar";

export default function Layout() {
	// isOffline is used by the OfflineIndicator component
	useOffline();
	const location = useLocation();
	const { animateAll } = useAnimation();
	
	// Trigger animations on route changes
	useEffect(() => {
		// Small delay to ensure components are ready
		const timer = setTimeout(() => {
			animateAll();
		}, 10);
		
		return () => clearTimeout(timer);
	}, [location.pathname, animateAll]);

	return (
		<ArticleProvider>
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
		</ArticleProvider>
	);
}
