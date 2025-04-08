// Removed UserProfileSection import, using Clerk's UserProfile directly
import { KeyboardShortcutsTab } from "@/components/keyboard-shortcuts-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"; // Added Select components
import { Separator } from "@/components/ui/separator";
// Resolved imports: Kept Switch and Tabs, removed ThemeToggle
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Removed TextSize type import as it's unused

import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { useArticleActions } from "@/hooks/useArticleActions";
import { supportedLngs } from "@/lib/i18n"; // Added supportedLngs import
// Removed unused type imports:
// import {
// 	type Article,
// 	type Highlight,
// 	type Tag,
// } from "@/services/db/types";
import { db, removeDuplicateArticles } from "@/services/db/dexie"; // Import dexie instance and removeDuplicateArticles
import { UserProfile } from "@clerk/clerk-react"; // Import Clerk's UserProfile
import { dark } from "@clerk/themes"; // Import Clerk dark theme
import {
	ArrowLeft,
	Database,
	Keyboard,
	Palette,
	ShieldCheck,
	// User, // Removed unused User icon
} from "lucide-react"; // Added ShieldCheck for Account
import { useState } from "react"; // Remove useEffect import
import { useTranslation } from "react-i18next"; // Added useTranslation
import { Link } from "react-router-dom";

export default function SettingsPage() {
	const { toast } = useToast();
	// Resolved hook usage: Kept theme, setTheme, t, i18n
	const { theme, setTheme } = useTheme(); // Keep theme hooks
	const { t, i18n } = useTranslation(); // Add i18n back
	const [isExportingData, setIsExportingData] = useState(false);
	const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
	const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false); // Add state for metadata update button
	const [activeTab, setActiveTab] = useState("account"); // Default to account tab
	// Removed clerkBaseTheme state

	// Get the action function - needs a refresh callback, maybe null for now or a dummy?
	// Let's assume a refresh isn't strictly needed immediately after cleanup,
	// but ideally, the parent component provides a way to refresh the main article list.
	// For now, provide a dummy refresh that does nothing.
	// Removed unused destructuring: const { removeDuplicateLocalArticles } = useArticleActions(...);
	useArticleActions(async () => {
		// Call hook without destructuring if only needed for setup/side-effects
		console.log("Dummy refresh called (if needed by action hook internals).");
	});

	const exportData = async () => {
		setIsExportingData(true);
		try {
			// Get all data from PouchDB using specific DB instances
			// Fetch using Dexie
			const articles = await db.articles.toArray(); // Note: Returns DexieArticle[]
			// }); // Remove leftover PouchDB options and brackets
			const highlights = await db.highlights.toArray(); // Note: Returns DexieHighlight[]
			// }); // Remove leftover PouchDB options and brackets
			const tags = await db.tags.toArray(); // Note: Returns DexieTag[]

			// Map Dexie results if necessary (e.g., back to Article type if needed)
			// For export, we can probably export the Dexie format directly
			// or map back to the original Article/Highlight/Tag format if preferred.
			// Let's export the Dexie format for simplicity, as it contains all data.
			const exportPayload = {
				// Renamed variable to avoid conflict
				articles: articles, // Use DexieArticle array directly
				highlights: highlights, // Use DexieHighlight array directly
				tags: tags, // Use DexieTag array directly
				exportDate: new Date().toISOString(),
			};

			// Convert to JSON string
			const dataStr = JSON.stringify(exportPayload, null, 2); // Use renamed variable

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
			const removedCount = await removeDuplicateArticles();

			if (removedCount > 0) {
				toast({
					title: "Cleanup Complete",
					description: `Removed ${removedCount} duplicate articles.`,
				});
			} else if (removedCount === 0) {
				toast({
					title: "No Duplicates Found",
					description: "No duplicate articles needed removal.",
				});
			} else {
				// removedCount === -1 indicates an error occurred within the function
				throw new Error(
					"Duplicate removal function encountered an internal error.",
				);
			}
		} catch (error) {
			console.error("Error cleaning duplicates:", error);
			toast({
				title: "Cleanup Failed",
				description: "An error occurred while removing duplicates.",
				variant: "destructive",
			});
			// Error toast is also handled within the hook, but log here just in case
			// Error already logged above or within removeDuplicateArticles
		} finally {
			setIsCleaningDuplicates(false);
		}
	};

	// Function to handle metadata updates for PDFs and EPUBs
	const handleUpdateMetadata = async () => {
		setIsUpdatingMetadata(true);
		try {
			// const updatedCount = await updateMissingMetadata(); // PouchDB migration - remove/comment out
			const updatedCount = 0; // Placeholder
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
		<div className="container py-8 max-w-5xl mx-auto">
			{" "}
			{/* Increased max-width */}
			<div className="flex items-center mb-8">
				<Button variant="ghost" size="icon" asChild>
					<Link to="/">
						<ArrowLeft className="h-5 w-5" />
					</Link>
				</Button>
				<h1 className="text-2xl font-bold ml-2">{t("settings.title")}</h1>
			</div>
			<Tabs
				defaultValue="account"
				value={activeTab}
				onValueChange={setActiveTab}
				className="space-y-6"
			>
				<TabsList className="grid grid-cols-4 mb-4">
					{" "}
					{/* Grid layout with 4 columns */}{" "}
					{/* Removed redundant Profile Tab Trigger */}
					<TabsTrigger value="account" className="flex items-center gap-1">
						{" "}
						{/* New Account Tab */}
						<ShieldCheck className="h-4 w-4" />
						<span>{t("settings.account.title")}</span>
					</TabsTrigger>
					{/* Removed redundant Profile Tab Trigger */}
					<TabsTrigger value="appearance" className="flex items-center gap-1">
						<Palette className="h-4 w-4" />
						<span>{t("settings.appearance.title")}</span>
					</TabsTrigger>
					<TabsTrigger value="data" className="flex items-center gap-1">
						<Database className="h-4 w-4" />
						<span>Data</span>
					</TabsTrigger>
					<TabsTrigger value="shortcuts" className="flex items-center gap-1">
						<Keyboard className="h-4 w-4" />
						<span>{t("settings.shortcuts.title")}</span>
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
										routing="hash" // Changed from "path" to "hash"
										// Removed path prop as it's not needed for hash routing
										appearance={{ baseTheme: clerkThemeObject }}
									/>
								);
							})()}
						</div>
					</ScrollArea>
				</TabsContent>

				{/* Removed redundant Profile Tab Content */}
				<TabsContent value="appearance" className="space-y-6">
					<ScrollArea className="h-[70vh]">
						<div className="pr-4">
							<Card>
								<CardHeader>
									<CardTitle>{t("settings.appearance.title")}</CardTitle>
								</CardHeader>
								<CardContent className="space-y-6">
									{" "}
									{/* Increased spacing */}
									{/* Resolved Appearance Tab: Kept Switch and Language Select */}
									<div className="space-y-3">
										<Label>{t("settings.appearance.theme")}</Label>
										<p className="text-sm text-muted-foreground">
											{t("settings.appearance.themeDescription")}
										</p>
										<div className="flex items-center space-x-2">
											<Label
												htmlFor="theme-switch"
												className="text-sm font-normal"
											>
												{t("settings.appearance.light")}
											</Label>
											<Switch
												id="theme-switch"
												checked={theme === "dark"}
												onCheckedChange={(checked) =>
													setTheme(checked ? "dark" : "light")
												}
											/>
											<Label
												htmlFor="theme-switch"
												className="text-sm font-normal"
											>
												{t("settings.appearance.dark")}
											</Label>
										</div>
									</div>
									<Separator />
									<div className="space-y-3">
										<Label htmlFor="language-select">
											{t("settings.appearance.language")}
										</Label>
										<p className="text-sm text-muted-foreground">
											{t("settings.appearance.languageDescription")}
										</p>
										<Select
											value={i18n.language.split("-")[0]}
											onValueChange={(value) => i18n.changeLanguage(value)}
										>
											<SelectTrigger id="language-select" className="w-[180px]">
												<SelectValue placeholder="Select language" />
											</SelectTrigger>
											<SelectContent>
												{Object.entries(supportedLngs).map(([code, name]) => (
													<SelectItem key={code} value={code}>
														{name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
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
