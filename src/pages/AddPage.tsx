import FileUpload from "@/components/FileUpload";
import UrlInput from "@/components/UrlInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArticles } from "@/context/ArticleContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, BookOpen, FileText, Globe } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function AddPage() {
	const [isUploading, setIsUploading] = useState(false);
	const { addArticleByFile } = useArticles();
	const { toast } = useToast();
	const navigate = useNavigate();

	const handleFileSelect = async (file: File) => {
		setIsUploading(true);
		try {
			const article = await addArticleByFile(file);
			if (article) {
				toast({
					title: "Success",
					description: "EPUB file added to your library",
				});
				// Navigate to the article
				navigate(`/read/${article._id}`);
			}
		} catch (error) {
			console.error("Error uploading EPUB:", error);
			toast({
				title: "Error",
				description: "Failed to upload EPUB file",
				variant: "destructive",
			});
		} finally {
			setIsUploading(false);
		}
	};

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

			<Tabs defaultValue="article" className="w-full">
				<TabsList className="grid grid-cols-2 mb-6">
					<TabsTrigger value="article">Web Article</TabsTrigger>
					<TabsTrigger value="epub">EPUB File</TabsTrigger>
				</TabsList>

				<TabsContent value="article">
					<Card>
						<CardHeader className="flex flex-row items-center gap-2">
							<Globe className="h-5 w-5" />
							<CardTitle>Save Article from Web</CardTitle>
						</CardHeader>
						<CardContent>
							<UrlInput />
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="epub">
					<Card>
						<CardHeader className="flex flex-row items-center gap-2">
							<BookOpen className="h-5 w-5" />
							<CardTitle>Upload EPUB File</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground mb-4">
								Upload EPUB files to read in your library. Files are stored
								locally in your browser.
							</p>
							<FileUpload
								onFileSelect={handleFileSelect}
								isUploading={isUploading}
								accept=".epub"
								maxSize={50 * 1024 * 1024} // 50MB
							/>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			<div className="mt-6">
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
