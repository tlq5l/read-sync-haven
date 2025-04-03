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
	const [uploadType, setUploadType] = useState<"epub" | "pdf">("epub");
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
					description: `${file.name} added to your library`,
				});
				// Navigate to the article
				navigate(`/read/${article._id}`);
			}
		} catch (error) {
			console.error(`Error uploading ${uploadType.toUpperCase()}:`, error);
			toast({
				title: "Error",
				description: `Failed to upload ${uploadType.toUpperCase()} file`,
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
				<TabsList className="grid grid-cols-3 mb-6">
					<TabsTrigger value="article">Web Article</TabsTrigger>
					<TabsTrigger value="epub">EPUB File</TabsTrigger>
					<TabsTrigger value="pdf">PDF File</TabsTrigger>
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
								onFileSelect={(file) => {
									setUploadType("epub");
									handleFileSelect(file);
								}}
								isUploading={isUploading && uploadType === "epub"}
								accept=".epub"
								maxSize={150 * 1024 * 1024} // 150MB
							/>
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="pdf">
					<Card>
						<CardHeader className="flex flex-row items-center gap-2">
							<FileText className="h-5 w-5" />
							<CardTitle>Upload PDF File</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground mb-4">
								Upload PDF files to read in your library. Files are stored
								locally in your browser.
							</p>
							<FileUpload
								onFileSelect={(file) => {
									setUploadType("pdf");
									handleFileSelect(file);
								}}
								isUploading={isUploading && uploadType === "pdf"}
								accept=".pdf"
								maxSize={150 * 1024 * 1024} // 150MB
							/>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
