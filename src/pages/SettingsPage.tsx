// Removed UserProfileSection import, using Clerk's UserProfile directly
import { KeyboardShortcutsTab } from "@/components/keyboard-shortcuts-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";

import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TextSize } from "@/context/ThemeContext"; // Import TextSize type

import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { useArticleActions } from "@/hooks/useArticleActions";
import {
	type Article,
	type Highlight,
	type Tag,
	articlesDb,
	highlightsDb,
	tagsDb,
	updateMissingMetadata,
} from "@/services/db"; // Import specific DBs and types
import { UserProfile } from "@clerk/clerk-react"; // Import Clerk's UserProfile
import { dark } from "@clerk/themes"; // Import Clerk dark theme
import {
	ArrowLeft,
	Database,
	Keyboard,
	Palette,
	ShieldCheck,
	User,
} from "lucide-react"; // Added ShieldCheck for Account
import { useState } from "react"; // Remove useEffect import
import { Link } from "react-router-dom";

export default function SettingsPage() {
	const { toast } = useToast();
	const { theme, textSize, setTextSize } = useTheme(); // Get theme, textSize, setTextSize
	const [isExportingData, setIsExportingData] = useState(false);
	const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
	const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false); // Add state for metadata update button
	const [activeTab, setActiveTab] = useState("account"); // Default to account tab
	// Removed clerkBaseTheme state

	// Get the action function - needs a refresh callback, maybe null for now or a dummy?
	// Let's assume a refresh isn't strictly needed immediately after cleanup,
	// but ideally, the parent component provides a way to refresh the main article list.
	// For now, provide a dummy refresh that does nothing.
	const { removeDuplicateLocalArticles } = useArticleActions(async () => {
		console.log("Dummy refresh called after duplicate cleanup.");
	});

	const exportData = async () => {
		setIsExportingData(true);
		try {
			// Get all data from PouchDB using specific DB instances
			const articles = await articlesDb.allDocs<Article>({
				include_docs: true,
			});
			const highlights = await highlightsDb.allDocs<Highlight>({
				include_docs: true,
			});
			const tags = await tagsDb.allDocs<Tag>({ include_docs: true });

			// Create a JSON object with all data, adding explicit types to map parameters
			const exportData = {
				articles: articles.rows.map(
					(row: PouchDB.Core.AllDocsResponse<Article>["rows"][number]) =>
						row.doc,
				),
				highlights: highlights.rows.map(
					(row: PouchDB.Core.AllDocsResponse<Highlight>["rows"][number]) =>
						row.doc,
				),
				tags: tags.rows.map(
					(row: PouchDB.Core.AllDocsResponse<Tag>["rows"][number]) => row.doc,
				),
				exportDate: new Date().toISOString(),
			};

			// Convert to JSON string
			const dataStr = JSON.stringify(exportData, null, 2);

			// Create a download link
			const dataBlob = new Blob([dataStr], { type: "application/json" });
			const url = URL.createObjectURL(dataBlob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `read-sync-haven-export-${
				new Date().toISOString().split("T")[0]
			}.json`;
			document.body.appendChild(link);

			// Trigger download
			link.click();

			// Clean up
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			toast({
				title: "Export Complete",
				description: "Your data has been exported successfully.",
			});
		} catch (error) {
			console.error("Export error:", error);
			toast({
				title: "Export Failed",
				description: "There was an error exporting your data.",
				variant: "destructive",
			});
		} finally {
			setIsExportingData(false);
		}
	};

	// Function to handle duplicate cleanup
	const handleCleanDuplicates = async () => {
		setIsCleaningDuplicates(true);
		try {
			await removeDuplicateLocalArticles();
			// Toast messages are handled within the hook
		} catch (error) {
			// Error toast is also handled within the hook, but log here just in case
			console.error("Error triggering duplicate cleanup from settings:", error);
		} finally {
			setIsCleaningDuplicates(false);
		}
	};

	// Function to handle metadata updates for PDFs and EPUBs
	const handleUpdateMetadata = async () => {
		setIsUpdatingMetadata(true);
		try {
			const updatedCount = await updateMissingMetadata();
			toast({
				title: "Update Complete",
				description:
					updatedCount > 0
						? `Updated metadata for ${updatedCount} documents.`
						: "No documents needed metadata updates.",
			});
		} catch (error) {
			console.error("Error updating metadata:", error);
			toast({
				title: "Update Failed",
				description: "There was an error updating document metadata.",
				variant: "destructive",
			});
		} finally {
			setIsUpdatingMetadata(false);
		}
	};

	// Removed useEffect for theme syncing

	return (
		<div className="container py-8 max-w-3xl mx-auto">
			<div className="flex items-center mb-8">
				<Button variant="ghost" size="icon" asChild>
					<Link to="/">
						<ArrowLeft className="h-5 w-5" />
					</Link>
				</Button>
				<h1 className="text-2xl font-bold ml-2">Settings</h1>
			</div>

			<Tabs
				defaultValue="profile"
				value={activeTab}
				onValueChange={setActiveTab}
				className="space-y-6"
			>
				<TabsList className="grid grid-cols-5 mb-4">
					{" "}
					{/* Changed to 5 columns */}
					<TabsTrigger value="account" className="flex items-center gap-1">
						{" "}
						{/* New Account Tab */}
						<ShieldCheck className="h-4 w-4" />
						<span>Account</span>
					</TabsTrigger>
					<TabsTrigger value="profile" className="flex items-center gap-1">
						{" "}
						{/* Existing Profile Tab */}
						<User className="h-4 w-4" />
						<span>Profile</span>
					</TabsTrigger>
					<TabsTrigger value="appearance" className="flex items-center gap-1">
						<Palette className="h-4 w-4" />
						<span>Appearance</span>
					</TabsTrigger>
					<TabsTrigger value="data" className="flex items-center gap-1">
						<Database className="h-4 w-4" />
						<span>Data</span>
					</TabsTrigger>
					<TabsTrigger value="shortcuts" className="flex items-center gap-1">
						<Keyboard className="h-4 w-4" />
						<span>Shortcuts</span>
					</TabsTrigger>
				</TabsList>

				<TabsContent value="account" className="space-y-6">
					{" "}
					{/* New Account Content */}
					<ScrollArea className="h-[70vh]">
						<div className="pr-4">
							{/* Calculate theme directly before rendering */}
							{(() => {
								const isDarkMode =
									theme === "dark" ||
									(theme === "system" &&
										window.matchMedia("(prefers-color-scheme: dark)").matches);
								const clerkThemeObject = isDarkMode ? dark : undefined;

								return (
									<UserProfile
										routing="path"
										path="/settings"
										appearance={{ baseTheme: clerkThemeObject }}
									/>
								);
							})()}
						</div>
					</ScrollArea>
				</TabsContent>

				<TabsContent value="profile" className="space-y-6">
					{" "}
					{/* Existing Profile Content */}
					<ScrollArea className="h-[70vh]">
						<div className="pr-4">
							{/* Content for the user profile settings (if any separate from Clerk) can go here */}
							<Card>
								<CardHeader>
									<CardTitle>User Profile Settings</CardTitle>
								</CardHeader>
								<CardContent>
									<p className="text-muted-foreground">
										Additional profile settings can be added here later.
									</p>
								</CardContent>
							</Card>
						</div>
					</ScrollArea>
				</TabsContent>

				<TabsContent value="appearance" className="space-y-6">
					<ScrollArea className="h-[70vh]">
						<div className="pr-4">
							<Card>
								<CardHeader>
									<CardTitle>Appearance</CardTitle>
								</CardHeader>
								<CardContent className="space-y-6">
									{" "}
									{/* Increased spacing */}
									{/* Text Size Slider */}
									<div className="space-y-3">
										<Label htmlFor="text-size-slider">Text Size</Label>
										<p className="text-sm text-muted-foreground">
											Adjust the application's base text size.
										</p>
										<Slider
											id="text-size-slider"
											min={1}
											max={5}
											step={1}
											value={[textSize]}
											onValueChange={(value) =>
												setTextSize(value[0] as TextSize)
											}
											className="w-[60%]" // Adjust width as needed
										/>
										{/* Optional: Add labels for slider steps */}
										<div className="flex justify-between text-xs text-muted-foreground w-[60%] pt-1">
											<span>Smallest</span>
											<span>Default</span>
											<span>Largest</span>
										</div>
									</div>
								</CardContent>
							</Card>
						</div>
						{/* [Removed duplicated cleanup section from Appearance tab] */}
					</ScrollArea>
				</TabsContent>

				<TabsContent value="data" className="space-y-6">
					<ScrollArea className="h-[70vh]">
						<div className="pr-4 space-y-6">
							{/* CloudImportSection removed as automatic sync is implemented */}

							<Card>
								<CardHeader>
									<CardTitle>Data Management</CardTitle> {/* Updated title */}
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label htmlFor="sync">Sync (Coming Soon)</Label>
											<p className="text-sm text-muted-foreground">
												Enable syncing between devices
											</p>
										</div>
										<Switch id="sync" disabled />
									</div>
									<Separator />
									<div className="space-y-2">
										<h3 className="text-sm font-medium">Export Data</h3>
										<p className="text-sm text-muted-foreground">
											Download all your articles and highlights
										</p>
										<Button onClick={exportData} disabled={isExportingData}>
											{isExportingData ? "Exporting..." : "Export Data"}
										</Button>
									</div>
									<Separator /> {/* Add separator */}
									{/* Duplicate Cleanup Section */}
									<div className="space-y-2">
										<h3 className="text-sm font-medium">
											Clean Local Duplicates
										</h3>
										<p className="text-sm text-muted-foreground">
											Remove duplicate articles stored locally based on their
											original URL. Keeps the earliest saved version.
										</p>
										<Button
											variant="destructive"
											onClick={handleCleanDuplicates} // Connect handler
											disabled={isCleaningDuplicates} // Connect disabled state
										>
											{isCleaningDuplicates
												? "Cleaning..."
												: "Remove Local Duplicates"}
										</Button>
									</div>
									<Separator /> {/* Add separator */}
									{/* Metadata Update Section */}
									<div className="space-y-2">
										<h3 className="text-sm font-medium">
											Fix PDF/EPUB Metadata
										</h3>
										<p className="text-sm text-muted-foreground">
											Update source information and reading time estimates for
											PDF and EPUB files that are showing as "Unknown source" or
											"? min read".
										</p>
										<Button
											onClick={handleUpdateMetadata}
											disabled={isUpdatingMetadata}
										>
											{isUpdatingMetadata ? "Updating..." : "Update Metadata"}
										</Button>
									</div>
								</CardContent>
							</Card>
						</div>
					</ScrollArea>
				</TabsContent>

				<TabsContent value="shortcuts">
					<ScrollArea className="h-[70vh]">
						<div className="pr-4">
							<KeyboardShortcutsTab />
						</div>
					</ScrollArea>
				</TabsContent>
			</Tabs>
		</div>
	);
}
