import { registerOfflineListeners } from "@/services/db";
import { useEffect, useState } from "react";

export function useOffline() {
	const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

	useEffect(() => {
		// Register listeners for online/offline events
		const cleanup = registerOfflineListeners((offline) => {
			setIsOffline(offline);
		});

		// Cleanup on unmount
		return cleanup;
	}, []);

	return isOffline;
}
