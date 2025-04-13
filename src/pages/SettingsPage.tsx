// Removed UserProfileSection import, using Clerk's UserProfile directly
import { KeyboardShortcutsTab } from "@/components/keyboard-shortcuts-tab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input"; // Added Input import
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
	apiKey?: string;
	endpointUrl?: string;
	modelName?: string;
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
	const [apiKey, setApiKey] = useState("");
	const [endpointUrl, setEndpointUrl] = useState("");
	const [modelName, setModelName] = useState("");
	// Sync/Loading/Error State for Settings
	const [isLoadingSettings, setIsLoadingSettings] = useState(false);
	const [settingsError, setSettingsError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<
		"idle" | "saving" | "saved" | "error"
	>("idle");
	const [lastSavedSettings, setLastSavedSettings] =
		useState<UserSettings | null>(null); // Store last successfully saved state

	// Test Connection State (Keep separate for now)
	const [testStatus, setTestStatus] = useState<
		"idle" | "testing" | "success" | "error"
	>("idle");
	const [testResult, setTestResult] = useState<string | null>(null);

	// Removed useArticleActions hook call as it's not directly related to settings sync

	// --- Logic for Custom API Settings ---
	// Fetch settings from backend on mount or when auth status changes
	useEffect(() => {
		const fetchSettings = async () => {
			if (!isSignedIn) {
				// Optionally clear local state if user signs out, or load defaults
				setApiKey("");
				setEndpointUrl("");
				setModelName("");
				// On sign out, clear API config, but leave theme as is for now.
				setSettingsError(null);
				setIsLoadingSettings(false);
				setLastSavedSettings(null);
				return;
			}

			setIsLoadingSettings(true);
			setSettingsError(null);
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
				setApiKey(fetchedSettings.apiKey || "");
				setEndpointUrl(fetchedSettings.endpointUrl || "");
				setModelName(fetchedSettings.modelName || "");
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
					setApiKey("");
					setEndpointUrl("");
					setModelName("");
					setLastSavedSettings({}); // Indicate fetch occurred but no data
				} else if (error instanceof ApiError) {
					setSettingsError(
						`Failed to load settings: ${error.status} ${error.message}${error.body ? ` - ${JSON.stringify(error.body)}` : ""}`,
					);
				} else {
					setSettingsError(
						"Failed to load settings due to an unexpected error.",
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
			setSettingsError(null); // Clear previous errors on new save attempt
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
					setSettingsError(errorDesc); // Set specific error message
				} else if (error instanceof Error) {
					errorDesc += ` Error: ${error.message}`;
					setSettingsError(errorDesc);
				} else {
					setSettingsError("An unknown error occurred while saving settings.");
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

	const handleSaveApiConfigSettings = () => {
		const settings: UserSettings = {
			...(lastSavedSettings || {}), // Start with last known settings (including theme)
			apiKey: apiKey,
			endpointUrl: endpointUrl,
			modelName: modelName,
		};
		saveSettingsToBackend(settings);
	};

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
	const handleTestConnection = async () => {
		setTestStatus("testing");
		setTestResult(null); // Clear previous result

		// Use current state instead of localStorage for testing
		// Note: This tests the connection using the *currently entered* values,
		// which might differ from the *last saved* values if changes are pending.
		// This seems reasonable behaviour for a test button.
		if (!apiKey || !endpointUrl) {
			setTestStatus("error");
			setTestResult(
				"Error: API Key and/or Endpoint URL not configured. Please configure and save them in the 'Configuration' tab first.",
			);
			return;
		}

		// Ensure the endpoint doesn't end with a slash, and append /v1/models
		const baseUrl = endpointUrl.endsWith("/")
			? endpointUrl.slice(0, -1)
			: endpointUrl;
		const testUrl = `${baseUrl}/v1/models`;

		try {
			const response = await fetch(testUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
			});

			if (response.ok) {
				const data = await response.json();
				const modelCount = data?.data?.length || 0; // Adjust based on actual API response structure
				setTestStatus("success");
				setTestResult(
					`Connection successful! Received ${modelCount} model(s).`, // Example: Display model count
				);
			} else {
				let errorMsg = `Connection failed: ${response.status} ${response.statusText}`;
				try {
					// Attempt to parse error details from the response body
					const errorData = await response.json();
					if (errorData?.error?.message) {
						errorMsg += ` - ${errorData.error.message}`;
					} else {
						// Try to stringify if it's not the expected format
						errorMsg += ` - ${JSON.stringify(errorData)}`;
					}
				} catch (parseError) {
					// If parsing fails, just use the status text
					console.warn("Could not parse error response body:", parseError);
				}
				setTestStatus("error");
				setTestResult(errorMsg);
			}
		} catch (error) {
			console.error("Test connection fetch error:", error);
			setTestStatus("error");
			let networkErrorMsg = "Network error: Could not reach the endpoint.";
			if (error instanceof Error) {
				networkErrorMsg += ` (${error.message})`;
			}
			setTestResult(networkErrorMsg);
		}
	};
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

							{/* Nested Tabs for AI Provider Settings */}
							<Tabs defaultValue="configuration" className="space-y-4">
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="configuration">Configuration</TabsTrigger>
									<TabsTrigger value="test-connection">
										Test Connection
									</TabsTrigger>
								</TabsList>
								<TabsContent value="configuration">
									<Card>
										<CardHeader>
											<CardTitle>AI Provider Configuration</CardTitle>{" "}
											{/* Slightly adjust title */}
										</CardHeader>
										<CardContent className="space-y-4">
											{isLoadingSettings && (
												<p className="text-sm text-muted-foreground">
													Loading settings...
												</p>
											)}
											{settingsError && (
												<p className="text-sm text-red-600">{settingsError}</p>
											)}
											{!isSignedIn && (
												<p className="text-sm text-yellow-600">
													Sign in to load and save your settings.
												</p>
											)}
											<div className="space-y-2">
												<Label htmlFor="apiKey">API Key</Label>
												<Input
													id="apiKey"
													type="password"
													placeholder={
														isSignedIn
															? "Enter your API Key"
															: "Sign in to load"
													}
													value={apiKey}
													onChange={(e) => setApiKey(e.target.value)}
													disabled={!isSignedIn || isLoadingSettings}
												/>
												<p className="text-sm text-muted-foreground">
													Your custom OpenAI-compatible API key (stored
													securely).
												</p>
											</div>
											<div className="space-y-2">
												<Label htmlFor="endpointUrl">Endpoint URL</Label>
												<Input
													id="endpointUrl"
													type="url"
													placeholder={
														isSignedIn
															? "https://api.example.com/v1"
															: "Sign in to load"
													}
													value={endpointUrl}
													onChange={(e) => setEndpointUrl(e.target.value)}
													disabled={!isSignedIn || isLoadingSettings}
												/>
												<p className="text-sm text-muted-foreground">
													The base URL for the OpenAI-compatible API endpoint.
												</p>
											</div>
											<div className="space-y-2">
												<Label htmlFor="modelName">Model Name</Label>
												<Input
													id="modelName"
													type="text"
													placeholder={
														isSignedIn
															? "Enter model name (e.g., gpt-4o)"
															: "Sign in to load"
													}
													value={modelName}
													onChange={(e) => setModelName(e.target.value)}
													disabled={!isSignedIn || isLoadingSettings}
												/>
												<p className="text-sm text-muted-foreground">
													Specify the exact model to use with the custom
													provider.
												</p>
											</div>
											<Button
												onClick={handleSaveApiConfigSettings} // Use the renamed handler
												disabled={
													!isSignedIn ||
													isLoadingSettings ||
													saveStatus === "saving"
												}
											>
												{saveStatus === "saved"
													? "Saved!"
													: saveStatus === "saving"
														? "Saving..."
														: saveStatus === "error"
															? "Save Failed" // Indicate error state
															: "Save Settings"}
											</Button>
										</CardContent>
									</Card>
								</TabsContent>
								<TabsContent value="test-connection">
									<Card>
										<CardHeader>
											<CardTitle>Test Connection</CardTitle>
										</CardHeader>
										<CardContent className="space-y-4">
											<p className="text-sm text-muted-foreground">
												Verify your saved API Key and Endpoint URL by making a
												test call to the `/v1/models` endpoint.
											</p>
											<Button
												onClick={handleTestConnection}
												disabled={testStatus === "testing"}
											>
												{testStatus === "testing"
													? "Testing..."
													: testStatus === "idle"
														? "Test Connection"
														: "Test Again"}
											</Button>
											<div>
												<p className="text-sm font-medium">Result:</p>
												{testResult && (
													<p
														className={`text-sm mt-1 ${
															testStatus === "success"
																? "text-green-600"
																: testStatus === "error"
																	? "text-red-600"
																	: "text-muted-foreground"
														}`}
													>
														{testResult}
													</p>
												)}
												{testStatus === "idle" && !testResult && (
													<p className="text-sm text-muted-foreground mt-1">
														Click the button to test your connection settings.
													</p>
												)}
											</div>
										</CardContent>
									</Card>
								</TabsContent>
							</Tabs>
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
