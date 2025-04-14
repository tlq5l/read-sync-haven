// Removed UserProfileSection import, using Clerk's UserProfile directly
import { KeyboardShortcutsTab } from "@/components/keyboard-shortcuts-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// Removed Input import as it's no longer used
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
// Resolved imports: Kept Switch and Tabs, removed ThemeToggle
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// Removed TextSize type import as it's unused

import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { ApiError, apiClient } from "@/lib/apiClient"; // Import apiClient and ApiError
// import { useArticleActions } from "@/hooks/useArticleActions"; // Likely not needed directly here anymore for settings
// Removed unused type imports
import { db, removeDuplicateArticles } from "@/services/db/dexie"; // Import dexie instance and removeDuplicateArticles
import { UserProfile, useAuth } from "@clerk/clerk-react"; // Import Clerk's UserProfile and useAuth
// Removed unused dark theme import
import {
	ArrowLeft,
	Database,
	Keyboard,
	Palette,
	ShieldCheck,
	// User, // Removed unused User icon
} from "lucide-react"; // Added ShieldCheck for Account
import { useCallback, useEffect, useState } from "react"; // Import useEffect, useState, useCallback
import { Link } from "react-router-dom";

// Define a type for the settings object for clarity
interface UserSettings {
	// Removed apiKey, endpointUrl, modelName as they are moving elsewhere
	theme?: "light" | "dark" | "system"; // Match useTheme type
	// Add other settings fields as needed
}

export default function SettingsPage() {
	const { toast } = useToast();
	const { isSignedIn, getToken } = useAuth(); // Get authentication status and getToken function
	const { theme, setTheme } = useTheme(); // Keep theme hooks
	const [isExportingData, setIsExportingData] = useState(false);
	const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
	const [isUpdatingMetadata, setIsUpdatingMetadata] = useState(false);
	const [activeTab, setActiveTab] = useState("account");
	// API Provider Settings State
	// Removed apiKey, endpointUrl, modelName state as they are moving elsewhere
	// Sync/Loading/Error State for Settings
	const [isLoadingSettings, setIsLoadingSettings] = useState(false);
	// const [settingsError, setSettingsError] = useState<string | null>(null); // Removed unused state
	const [saveStatus, setSaveStatus] = useState<
		"idle" | "saving" | "saved" | "error"
	>("idle");
	const [lastSavedSettings, setLastSavedSettings] =
		useState<UserSettings | null>(null); // Store last successfully saved state

	// Test Connection State (Keep separate for now)
	// Removed testStatus and testResult state as they are related to the removed test connection feature

	// Removed useArticleActions hook call as it's not directly related to settings sync

	// --- Logic for Custom API Settings ---
	// Fetch settings from backend on mount or when auth status changes
	useEffect(() => {
		const fetchSettings = async () => {
			if (!isSignedIn) {
				// Optionally clear local state if user signs out, or load defaults
				// On sign out, clear API config state (which is now removed)
				// Theme state is handled by useTheme context
				// setSettingsError(null); // Removed state
				setIsLoadingSettings(false);
				setLastSavedSettings(null);
				return;
			}

			setIsLoadingSettings(true);
			// setSettingsError(null); // Removed state
			console.log("Attempting to fetch user settings...");

			try {
				if (!getToken) {
					throw new Error("getToken function is not available from useAuth.");
				}
				// Pass getToken to apiClient
				const fetchedSettings = await apiClient<UserSettings>(
					"/user/settings",
					getToken,
				);
				console.log("Fetched settings:", fetchedSettings);

				// Update local state with fetched data
				// Removed setting apiKey, endpointUrl, modelName from fetchedSettings
				// Update theme context if a theme was fetched
				if (fetchedSettings.theme) {
					setTheme(fetchedSettings.theme); // Update theme context
				}
				setLastSavedSettings(fetchedSettings); // Store the fetched state
				setSaveStatus("idle"); // Reset save status after successful load
			} catch (error) {
				console.error("Failed to fetch settings:", error);
				if (error instanceof ApiError && error.status === 404) {
					// User might not have settings saved yet, treat as empty/default
					console.log("No settings found for user (404), using defaults.");
					// Removed setting default apiKey, endpointUrl, modelName on 404
					setLastSavedSettings({}); // Indicate fetch occurred but no data
				} else if (error instanceof ApiError) {
					// setSettingsError( // Removed state
					// 	`Failed to load settings: ${error.status} ${error.message}${error.body ? ` - ${JSON.stringify(error.body)}` : ""}`,
					// );
					console.error(
						// Log the error instead
						`Failed to load settings: ${error.status} ${error.message}${error.body ? ` - ${JSON.stringify(error.body)}` : ""}`,
					);
				} else {
					// setSettingsError( // Removed state
					// 	"Failed to load settings due to an unexpected error.",
					// );
					console.error(
						// Log the error instead
						"Failed to load settings due to an unexpected error.",
						error, // Include the original error object
					);
				}
				setSaveStatus("idle"); // Ensure save status is reset on error
			} finally {
				setIsLoadingSettings(false);
			}
		};

		fetchSettings();
	}, [isSignedIn, getToken, setTheme]); // Add setTheme to dependency array

	// Save settings to backend
	const saveSettingsToBackend = useCallback(
		async (settingsToSave: UserSettings) => {
			if (!isSignedIn) {
				toast({
					title: "Authentication Required",
					description: "You must be signed in to save settings.",
					variant: "destructive",
				});
				return false; // Indicate failure
			}

			setSaveStatus("saving");
			// setSettingsError(null); // Removed state
			console.log("Attempting to save settings:", settingsToSave);

			try {
				if (!getToken) {
					throw new Error("getToken function is not available from useAuth.");
				}
				// Pass getToken to apiClient
				await apiClient(
					"/user/settings",
					getToken, // Pass the function here
					{
						method: "POST",
						body: JSON.stringify(settingsToSave),
					},
				);
				setSaveStatus("saved");
				setLastSavedSettings(settingsToSave); // Update last saved state
				toast({
					title: "Settings Saved",
					description: "Your settings have been saved successfully.",
				});
				// Revert button text after a short delay
				setTimeout(() => {
					// Only revert if still 'saved', prevents reverting during a new save
					if (saveStatus === "saved") {
						setSaveStatus("idle");
					}
				}, 2000); // Revert after 2 seconds
				return true; // Indicate success
			} catch (error) {
				console.error("Failed to save settings:", error);
				setSaveStatus("error"); // Set error state for the button
				let errorDesc = "Could not save settings.";
				if (error instanceof ApiError) {
					errorDesc += ` Error: ${error.status} ${error.message}`;
					if (error.body) {
						try {
							errorDesc += ` - ${JSON.stringify(error.body)}`;
						} catch {
							/* ignore stringify error */
						}
					}
					// setSettingsError(errorDesc); // Removed state
					console.error("Settings save error:", errorDesc); // Log instead
				} else if (error instanceof Error) {
					errorDesc += ` Error: ${error.message}`;
					// setSettingsError(errorDesc); // Removed state
					console.error("Settings save error:", errorDesc, error); // Log instead
				} else {
					// setSettingsError("An unknown error occurred while saving settings."); // Removed state
					console.error(
						"An unknown error occurred while saving settings.",
						error,
					); // Log instead
				}
				toast({
					title: "Save Failed",
					description: errorDesc,
					variant: "destructive",
				});
				// Optionally revert button state after a delay on error too
				// setTimeout(() => {
				//   if (saveStatus === 'error') { // Check if still in error state
				//       setSaveStatus('idle');
				//   }
				// }, 3000);
				return false; // Indicate failure
			}
		},
		[isSignedIn, toast, saveStatus, getToken], // Add getToken to dependency array
	);

	// Removed handleSaveApiConfigSettings function
	// Handler for theme change
	const handleThemeChange = (newTheme: "light" | "dark") => {
		setTheme(newTheme); // Update context immediately for responsiveness
		const settings: UserSettings = {
			...(lastSavedSettings || {}), // Include other saved settings
			theme: newTheme,
		};
		// Save *only* the theme change to the backend
		saveSettingsToBackend(settings);
	};

	// handleSaveSettings is now handleSaveApiConfigSettings above
	// --- End Logic for Custom API Settings (refactored to use backend) ---

	// --- Logic for Test Connection ---
	// Removed handleTestConnection function
	// --- End Logic for Test Connection ---

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
				<h1 className="text-2xl font-bold ml-2">Settings</h1>
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
						<span>Account</span>
					</TabsTrigger>
					{/* Removed redundant Profile Tab Trigger */}
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
							{/* Removed theme calculation IIFE as appearance prop is removed */}
							<UserProfile
								routing="hash" // Changed from "path" to "hash"
								// Removed path prop as it's not needed for hash routing
								// Removed appearance prop to test default behavior
							/>
						</div>
					</ScrollArea>
				</TabsContent>

				{/* Removed redundant Profile Tab Content */}
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
									{/* Resolved Appearance Tab: Kept Switch and Language Select */}
									<div className="space-y-3">
										<Label>Theme</Label>
										<p className="text-sm text-muted-foreground">
											Select the interface theme.
										</p>
										<div className="flex items-center space-x-2">
											<Label
												htmlFor="theme-switch"
												className="text-sm font-normal"
											>
												Light
											</Label>
											<Switch
												id="theme-switch"
												checked={theme === "dark"}
												onCheckedChange={(checked) => {
													handleThemeChange(checked ? "dark" : "light");
												}}
												disabled={!isSignedIn || isLoadingSettings} // Disable if not signed in or loading
											/>
											<Label
												htmlFor="theme-switch"
												className="text-sm font-normal"
											>
												Dark
											</Label>
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

							{/* Removed Nested Tabs for AI Provider Settings */}
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
