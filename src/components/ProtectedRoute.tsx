import { useAuth } from "@clerk/clerk-react";
import { Navigate, Outlet } from "react-router-dom";

export default function ProtectedRoute() {
	const { isSignedIn, isLoaded } = useAuth();

	// Show loading state while Clerk is initializing
	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center h-screen">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	// Redirect to sign-in if not authenticated
	if (!isSignedIn) {
		return <Navigate to="/sign-in" />;
	}

	// Render child routes if authenticated
	return <Outlet />;
}
