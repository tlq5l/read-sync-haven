import { useOffline } from "@/hooks/use-offline";
import { cn } from "@/lib/utils";
import { WifiOff } from "lucide-react";

export default function OfflineIndicator() {
	const isOffline = useOffline();

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
