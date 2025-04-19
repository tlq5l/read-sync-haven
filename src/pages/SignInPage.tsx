import { SignIn } from "@clerk/clerk-react";

/**
 * Renders the sign-in page for Thinkara with a centered authentication form.
 *
 * Displays a styled sign-in interface using the Clerk authentication component, including a heading and custom appearance.
 */
export default function SignInPage() {
	return (
		<div className="flex items-center justify-center min-h-screen bg-background">
			<div className="w-full max-w-md p-6">
				<h1 className="text-2xl font-bold text-center mb-6">
					Sign In to Thinkara
				</h1>
				<SignIn
					routing="path"
					path="/sign-in"
					signUpUrl="/sign-up"
					redirectUrl="/"
					appearance={{
						elements: {
							rootBox: "mx-auto",
							card: "shadow-lg border rounded-lg",
						},
					}}
				/>
			</div>
		</div>
	);
}
