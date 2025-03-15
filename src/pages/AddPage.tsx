import UrlInput from "@/components/UrlInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Globe } from "lucide-react";

import { Link } from "react-router-dom";

export default function AddPage() {
	return (
		<div className="container py-8 max-w-3xl mx-auto">
			<div className="flex items-center mb-8">
				<Button variant="ghost" size="icon" asChild>
					<Link to="/">
						<ArrowLeft className="h-5 w-5" />
					</Link>
				</Button>
				<h1 className="text-2xl font-bold ml-2">Add Content</h1>
			</div>

			<div className="grid grid-cols-1 gap-6">
				<Card>
					<CardHeader className="flex flex-row items-center gap-2">
						<Globe className="h-5 w-5" />
						<CardTitle>Save Article from Web</CardTitle>
					</CardHeader>
					<CardContent>
						<UrlInput />
					</CardContent>
				</Card>

				<Card className="opacity-50">
					<CardHeader className="flex flex-row items-center gap-2">
						<FileText className="h-5 w-5" />
						<CardTitle>Upload PDF (Coming Soon)</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground mb-4">
							This feature will be available in a future update.
						</p>
						<Button disabled>Upload PDF</Button>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
