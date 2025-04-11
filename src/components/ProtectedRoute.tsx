import { authClient } from "@/lib/authClient"; // Import the initialized client
import { Navigate, Outlet } from "react-router-dom";

export default function ProtectedRoute() {
	// Use the useSession hook from the initialized client
	const { data: session, isPending } = authClient.useSession();

	// Show loading state while session is being checked
	if (isPending) {
		return (
			<div className="flex items-center justify-center h-screen">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	// Redirect to sign-in if not authenticated (session data is null/undefined)
	if (!session) {
		return <Navigate to="/sign-in" />;
	}

	// Render child routes if authenticated
	return <Outlet />;
}
