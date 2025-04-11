import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/authClient"; // Import authClient
import { ChevronDown } from "lucide-react";
import type React from "react";

const HomePage: React.FC = () => {
	const { data: session } = authClient.useSession(); // Use session hook

	return (
		<div className="p-4 space-y-6">
			{/* Header Section */}
			<div className="flex justify-between items-center">
				<h1 className="text-xl font-semibold">
					{/* Use name from session, default to "User" */}
					Welcome {session?.user?.name || "User"}
				</h1>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline">
							Configure
							<ChevronDown className="ml-2 h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{/* TODO: Add actual configuration options */}
						<DropdownMenuItem>Option 1</DropdownMenuItem>
						<DropdownMenuItem>Option 2</DropdownMenuItem>
						<DropdownMenuItem>Option 3</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Rest of the Home Page Content */}
			<div>
				<p>This is the main content area of the new home page.</p>
				{/* TODO: Add more dashboard elements or content here */}
			</div>
		</div>
	);
};

export default HomePage;
