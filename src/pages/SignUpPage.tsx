import { SignUp } from "@clerk/clerk-react";

export default function SignUpPage() {
	return (
		<div className="flex items-center justify-center min-h-screen bg-background">
			<div className="w-full max-w-md p-6">
				<h1 className="text-2xl font-bold text-center mb-6">
					Create Your Thinkara Account
				</h1>
				<SignUp
					routing="path"
					path="/sign-up"
					signInUrl="/sign-in"
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
