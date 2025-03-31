import { useToast } from "@/hooks/use-toast";
import { initializeDatabase } from "@/services/db";
import { useEffect, useState } from "react";

/**
 * Hook to handle database initialization.
 * Returns the initialization status and any initialization error.
 */
export function useDatabaseInit() {
	const [isInitialized, setIsInitialized] = useState<boolean>(false);
	const [dbError, setDbError] = useState<Error | null>(null);
	const { toast } = useToast();

	useEffect(() => {
		// Skip if already initialized
		if (isInitialized) return;

		let isMounted = true;
		let timeoutId: NodeJS.Timeout | null = null;

		const init = async () => {
			try {
				console.log("Initializing database via useDatabaseInit hook...");
				const result = await initializeDatabase();
				console.log("Database initialization result:", result);

				if (isMounted) {
					setIsInitialized(true);
					setDbError(null); // Clear any previous error

					if (!result) {
						console.warn("Database initialized with warnings");
						toast({
							title: "Database Warning",
							description:
								"The database initialized with warnings. Some features may be limited.",
							variant: "destructive",
						});
					}
				}
			} catch (err) {
				console.error("Failed to initialize database:", err);
				if (isMounted) {
					const error =
						err instanceof Error
							? err
							: new Error("Failed to initialize database");
					setDbError(error);
					setIsInitialized(false); // Ensure initialized is false on error
					toast({
						title: "Database Error",
						description:
							"Failed to initialize database. Please refresh or try again later.",
						variant: "destructive",
					});
				}
			}
		};

		// Fallback timeout to prevent stuck initializing state
		timeoutId = setTimeout(() => {
			if (isMounted && !isInitialized) {
				console.warn("Database initialization timed out");
				const error = new Error(
					"Database initialization timed out. Some features may not work correctly.",
				);
				setDbError(error);
				setIsInitialized(false); // Ensure initialized is false on timeout
				toast({
					title: "Database Timeout",
					description: error.message,
					variant: "destructive",
				});
			}
		}, 5000); // 5 second timeout

		init();

		return () => {
			isMounted = false;
			if (timeoutId) clearTimeout(timeoutId);
		};
	}, [isInitialized, toast]); // Only re-run if isInitialized changes (e.g., on retry) or toast changes

	return { isInitialized, dbError };
}
