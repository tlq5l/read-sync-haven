import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/authClient"; // Import the auth client
// Removed Button and Clerk imports

export default function UserProfileSection() {
	const { data: session, isPending } = authClient.useSession(); // Use session hook

	if (isPending) {
		return <div>Loading user profile...</div>; // Use isPending for loading state
	}

	if (!session?.user) {
		// Handle case where user is not logged in or user data is missing
		return <div>User not found.</div>;
	}

	const user = session.user; // Get user data from session

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Your Profile</CardTitle>
					<CardDescription>Account information</CardDescription>{" "}
					{/* Updated description */}
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div>
							<p className="text-sm text-muted-foreground">Name</p>
							{/* Assume user.name exists */}
							<p>{user.name || "Not set"}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Email</p>
							{/* Assume user.email exists */}
							<p>{user.email || "Not set"}</p>
						</div>
						{/* Removed Edit Profile button as openUserProfile is from Clerk */}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
