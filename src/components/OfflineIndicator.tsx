import { cn } from "@/lib/utils";
import { WifiOff } from "lucide-react";
// Removed useOffline import
import { useEffect, useState } from "react"; /**
 * Displays a notification when the browser is offline.
 *
 * Renders a fixed offline indicator in the bottom-right corner of the screen when the user loses internet connectivity. The indicator is hidden when the browser is online.
 */

export default function OfflineIndicator() {
	// Replace useOffline with navigator.onLine and event listeners
	const [isOffline, setIsOffline] = useState(!navigator.onLine);

	useEffect(() => {
		const handleOnline = () => setIsOffline(false);
		const handleOffline = () => setIsOffline(true);

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		// Initial check
		setIsOffline(!navigator.onLine);

		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	if (!isOffline) return null;

	return (
		<div
			className={cn(
				"fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-2",
				"bg-yellow-100 text-yellow-800 rounded-md shadow-md",
			)}
		>
			<WifiOff className="h-4 w-4" />
			<span className="text-sm font-medium">Offline Mode</span>
		</div>
	);
}
