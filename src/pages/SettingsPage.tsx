import UserProfileSection from "@/components/UserProfileSection";
import { KeyboardShortcutsTab } from "@/components/keyboard-shortcuts-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
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
} from "@/services/db"; // Import specific DBs and types
import {
	ArrowLeft,
	Database,
	HelpCircle,
	Keyboard,
	Palette,
	User,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export default function SettingsPage() {
	const { toast } = useToast();
	const { theme } = useTheme();
	const [isExportingData, setIsExportingData] = useState(false);
	const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false); // Add state for cleanup button
	const [activeTab, setActiveTab] = useState("profile");

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
				<TabsList className="grid grid-cols-4 mb-4">
					<TabsTrigger value="profile" className="flex items-center gap-1">
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

				<TabsContent value="profile" className="space-y-6">
					<ScrollArea className="h-[70vh]">
						<div className="pr-4">
							<UserProfileSection />
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
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label htmlFor="dark-mode">Dark Mode</Label>
											<p className="text-sm text-muted-foreground">
												{theme === "dark"
													? "Dark mode enabled"
													: "Light mode enabled"}
											</p>
										</div>
										<ThemeToggle showLabel={false} />
									</div>
									<Separator />
									<div className="flex items-center justify-between">
										<div className="space-y-0.5">
											<Label htmlFor="font-size">Larger Text</Label>
											<p className="text-sm text-muted-foreground">
												Coming soon
											</p>
										</div>
										<Switch id="font-size" disabled />
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

				<ScrollArea className="h-[16vh] mt-6">
					<div className="pr-4">
						<Card>
							<CardHeader>
								<CardTitle>About</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="space-y-2">
									<h3 className="text-sm font-medium">Read Sync Haven</h3>
									<p className="text-sm text-muted-foreground">
										Version 0.1.0 (MVP)
									</p>
									<p className="text-sm text-muted-foreground">
										A local-first read-it-later application for power readers.
									</p>
								</div>

								<Separator />

								<div className="space-y-2">
									<Button variant="outline" className="gap-2">
										<HelpCircle className="h-4 w-4" />
										Help & Support
									</Button>
								</div>
							</CardContent>
						</Card>
					</div>
				</ScrollArea>
			</Tabs>
		</div>
	);
}
