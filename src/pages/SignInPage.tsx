import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/authClient"; // Import the initialized client
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function SignInPage() {
	const { data: session, isPending } = authClient.useSession();
	const navigate = useNavigate();

	useEffect(() => {
		// Redirect away if already authenticated
		if (session) {
			navigate("/"); // Redirect to home
		}
	}, [session, navigate]);

	const handleSignIn = async () => {
		try {
			// Use the correct nested action: signIn.social
			// Use 'google' as the provider, per user request.
			await authClient.signIn.social({ provider: "google" });
		} catch (error) {
			console.error("Sign in failed:", error);
			// Handle sign-in error (e.g., show a toast message)
		}
	};

	if (isPending || session) {
		// Show loading or nothing if redirecting
		return (
			<div className="flex items-center justify-center min-h-screen bg-background">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	return (
		<div className="flex items-center justify-center min-h-screen bg-background">
			<div className="w-full max-w-md p-6 text-center">
				<h1 className="text-2xl font-bold mb-6">Sign In to Read Sync Haven</h1>
				<Button onClick={handleSignIn} className="w-full">
					Sign In / Sign Up
				</Button>
			</div>
		</div>
	);
}
