import { ArticleProvider } from "@/context/ArticleContext";
import { useOffline } from "@/hooks/use-offline";

import { Outlet } from "react-router-dom";
import OfflineIndicator from "./OfflineIndicator";
import Sidebar from "./Sidebar";

export default function Layout() {
	// isOffline is used by the OfflineIndicator component
	useOffline();

	return (
		<ArticleProvider>
			<div className="flex h-screen bg-background">
				<Sidebar />
				<main className="flex-1 overflow-hidden">
					<Outlet />
				</main>
			</div>
			<OfflineIndicator />
		</ArticleProvider>
	);
}
