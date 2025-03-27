import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useUser, useClerk } from "@clerk/clerk-react";

export default function UserProfileSection() {
	const { user, isLoaded } = useUser();
	const { openUserProfile } = useClerk();

	if (!isLoaded) {
		return <div>Loading user profile...</div>;
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Your Profile</CardTitle>
					<CardDescription>Manage your account information</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div>
							<p className="text-sm text-muted-foreground">Name</p>
							<p>{user?.fullName || "Not set"}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">Email</p>
							<p>{user?.primaryEmailAddress?.emailAddress || "Not set"}</p>
						</div>
						<Button variant="outline" onClick={() => openUserProfile()}>
							Edit Profile
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
