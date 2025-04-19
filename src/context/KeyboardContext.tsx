import { useArticles } from "@/context/ArticleContext"; // Added import
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import {
	type Shortcut,
	formatShortcut,
	matchesShortcut,
	shortcutGroups,
} from "@/lib/keyboard-shortcuts";
import type React from "react";
import {
	// Sorted imports
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { useNavigate } from "react-router-dom";

interface KeyboardContextType {
	shortcuts: Shortcut[];
	isShortcutsDialogOpen: boolean;
	openShortcutsDialog: () => void;
	closeShortcutsDialog: () => void;
	isSearchOverlayOpen: boolean;
	openSearchOverlay: () => void;
	closeSearchOverlay: () => void;
	updateShortcuts: (newShortcuts: Shortcut[]) => boolean;
	isSidebarCollapsed: boolean; // Added sidebar state
	toggleSidebar: () => void; // Added sidebar toggle function
}

const KeyboardContext = createContext<KeyboardContextType | undefined>(
	undefined,
);

export function KeyboardProvider({ children }: { children: React.ReactNode }) {
	const navigate = useNavigate();
	const { theme, setTheme } = useTheme();
	const { toast } = useToast();
	const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
	const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
	const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false);
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false); // Added sidebar state
	const USER_SHORTCUTS_KEY = "userKeyboardShortcuts";

	// Get articles context with fallback for when provider isn't available
	const articlesContext = (() => {
		try {
			return useArticles();
		} catch {
			// Allow KeyboardProvider to work in isolation (e.g., in Storybook)
			// Return a compatible structure with a no-op refresh function
			return {
				refreshArticles: () => {
					console.warn(
						"KeyboardProvider: ArticleContext not found, sync action unavailable.",
					);
					return Promise.resolve([]); // Return empty array to match signature
				},
				// Add other properties from ArticleContextType with default/null values if needed by getActionById
			};
		}
	})();

	// Function to toggle sidebar state
	const toggleSidebar = useCallback(() => {
		setIsSidebarCollapsed((prev) => !prev);
		// Potentially trigger animations if needed here
	}, []);

	// Function to get action by ID (avoids repetition)
	const getActionById = useCallback(
		(id: string): (() => void) => {
			// Ensure articlesContext is loaded before trying to use it
			// This might require adjusting dependencies or ensuring ArticleProvider wraps KeyboardProvider
			const refreshAction =
				articlesContext?.refreshArticles ??
				(() => console.warn("Article context not ready for refresh"));

			switch (id) {
				case "goto-home":
					return () => navigate("/");
				case "goto-settings":
					return () => navigate("/settings");
				case "goto-add":
					return () => navigate("/add");
				case "goto-search":
					return () => navigate("/search"); // Assuming '/search' exists
				case "create-new":
					return () => navigate("/add");
				case "save-entry":
					return () =>
						toast({
							title: "Save Action",
							description: "This action would save the current entry",
						});
				case "search":
					return () => setIsSearchOverlayOpen(true); // Assuming this should open overlay like 'focus-search'
				case "toggle-theme":
					return () => {
						const newTheme = theme === "dark" ? "light" : "dark";
						setTheme(newTheme);
						toast({
							title: "Theme Changed",
							description: `Theme switched to ${newTheme} mode`,
						});
					};
				case "show-shortcuts":
					return () => setIsShortcutsDialogOpen(true);
				case "open-search-overlay":
					return () => setIsSearchOverlayOpen(true); // Map new ID
				case "delete-article":
					return () => {
						console.log(
							"Delete shortcut pressed - requires context-specific handling.",
						);
						toast({
							title: "Delete Shortcut",
							description:
								"Press Delete when an article card or reader is active.",
						});
					};
				// Add cases for the new shortcuts
				case "sync-articles":
					return () => {
						// Show initial toast and get dismiss function
						const { dismiss } = toast({
							title: "Syncing...",
							description: "Refreshing articles.",
							duration: 5000, // Keep it visible for a bit
						});
						refreshAction()
							.then(() => {
								dismiss(); // Dismiss the 'Syncing...' toast
								toast({ // Show success toast
									title: "Sync Complete",
									description: "Articles refreshed successfully.",
									duration: 3000,
								});
							})
							.catch((err) => {
								// Use the potentially wrapped refreshAction
								dismiss(); // Dismiss the 'Syncing...' toast on error too
								console.error("Error during manual sync:", err);
								toast({
									title: "Sync Failed",
									description: "Could not refresh articles.",
									variant: "destructive",
								});
							});
					};
				case "toggle-sidebar":
					return toggleSidebar; // Return the memoized toggle function
				default:
					return () =>
						console.warn(`Action for shortcut ID "${id}" not implemented`); // Changed log level
			}
		},
		[
			navigate,
			theme,
			setTheme,
			toast,
			toggleSidebar, // Add toggleSidebar as dependency
			articlesContext, // Add articlesContext dependency
		],
	);

	// Load shortcuts from localStorage or defaults
	useEffect(() => {
		let loadedShortcuts: Shortcut[] = [];
		const storedShortcutsConfig = localStorage.getItem(USER_SHORTCUTS_KEY);

		if (storedShortcutsConfig) {
			try {
				const userConfig: Record<string, Shortcut["keys"]> = JSON.parse(
					storedShortcutsConfig,
				);
				// Reconstruct full shortcuts using defaults and stored keys
				loadedShortcuts = shortcutGroups.flatMap((group) =>
					group.shortcuts.map((defaultShortcut) => ({
						...defaultShortcut,
						keys: userConfig[defaultShortcut.id] || defaultShortcut.keys, // Use stored keys or default
						action: getActionById(defaultShortcut.id),
					})),
				);
			} catch (error) {
				console.error("Error parsing stored shortcuts, using defaults:", error);
				// Fallback to defaults if parsing fails
			}
		}

		// If no stored config or parsing failed, load defaults
		if (loadedShortcuts.length === 0) {
			const defaultShortcutsForStorage: Record<string, Shortcut["keys"]> = {};
			loadedShortcuts = shortcutGroups.flatMap((group) =>
				group.shortcuts.map((defaultShortcut) => {
					defaultShortcutsForStorage[defaultShortcut.id] = defaultShortcut.keys;
					return {
						...defaultShortcut,
						action: getActionById(defaultShortcut.id),
					};
				}),
			);
			// Save default config to localStorage
			localStorage.setItem(
				USER_SHORTCUTS_KEY,
				JSON.stringify(defaultShortcutsForStorage),
			);
		}

		setShortcuts(loadedShortcuts);
		// Dependencies include functions from outer scope
	}, [getActionById]); // Removed unnecessary dependencies, added missing getActionById

	// Function to update shortcuts and persist
	const updateShortcuts = (newShortcuts: Shortcut[]): boolean => {
		// --- Validation: Check for global duplicates ---
		const keyMap = new Map<string, string>(); // Map "key+modifiers" string to shortcut ID
		for (const shortcut of newShortcuts) {
			for (const key of shortcut.keys) {
				const keyString = `${key.key.toLowerCase()}_${!!key.modifiers.ctrl}_${!!key.modifiers.alt}_${!!key.modifiers.shift}_${!!key.modifiers.meta}`;
				if (keyMap.has(keyString)) {
					const existingId = keyMap.get(keyString);
					if (existingId !== shortcut.id) {
						toast({
							title: "Duplicate Shortcut",
							description: `The combination "${formatShortcut([key])}" is already assigned to another action. Please choose a different shortcut.`,
							variant: "destructive",
						});
						return false; // Validation failed
					}
				} else {
					keyMap.set(keyString, shortcut.id);
				}
			}
		}
		// --- End Validation ---

		// Update state (re-assign actions as they are not part of the input)
		const updatedShortcutsWithActions = newShortcuts.map((sc) => ({
			...sc,
			action: getActionById(sc.id), // Re-assign action
		}));
		setShortcuts(updatedShortcutsWithActions);

		// Persist only the keys configuration
		const configToStore: Record<string, Shortcut["keys"]> = {};
		for (const sc of updatedShortcutsWithActions) {
			configToStore[sc.id] = sc.keys;
		}
		localStorage.setItem(USER_SHORTCUTS_KEY, JSON.stringify(configToStore));
		toast({
			title: "Shortcuts Saved",
			description: "Your keyboard shortcuts have been updated.",
		});
		return true; // Success
	};

	// Set up global keyboard event listener
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Don't trigger shortcuts when the target is an input, textarea, select, or contenteditable element
			if (
				event.target instanceof HTMLElement &&
				(event.target instanceof HTMLInputElement ||
					event.target instanceof HTMLTextAreaElement ||
					event.target instanceof HTMLSelectElement ||
					event.target.isContentEditable)
			) {
				// Exception: Allow Esc key for closing overlays/dialogs even in inputs
				if (event.key === "Escape") {
					// Check highest priority overlay first (Search Overlay)
					if (isSearchOverlayOpen) {
						event.preventDefault();
						closeSearchOverlay();
						return;
					} // Then check shortcuts dialog
					if (isShortcutsDialogOpen) {
						event.preventDefault();
						closeShortcutsDialog();
						return;
					}
				} else {
					// Otherwise, ignore event if target is editable
					return;
				}
			}

			// Check if the event matches any shortcuts
			for (const shortcut of shortcuts) {
				if (matchesShortcut(event, shortcut.keys)) {
					event.preventDefault();
					shortcut.action();
					break;
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [shortcuts, isShortcutsDialogOpen, isSearchOverlayOpen]); // Add dialog/overlay states as dependencies

	const openShortcutsDialog = () => setIsShortcutsDialogOpen(true);
	const closeShortcutsDialog = () => setIsShortcutsDialogOpen(false);
	const openSearchOverlay = () => setIsSearchOverlayOpen(true);
	const closeSearchOverlay = () => setIsSearchOverlayOpen(false);

	// Include sidebar state and toggle in context value
	const value = {
		shortcuts,
		isShortcutsDialogOpen,
		openShortcutsDialog,
		closeShortcutsDialog,
		isSearchOverlayOpen,
		openSearchOverlay,
		closeSearchOverlay,
		updateShortcuts,
		isSidebarCollapsed,
		toggleSidebar,
	};

	return (
		<KeyboardContext.Provider value={value}>
			{children}
		</KeyboardContext.Provider>
	);
}

export function useKeyboard(): KeyboardContextType {
	const context = useContext(KeyboardContext);

	if (context === undefined) {
		throw new Error("useKeyboard must be used within a KeyboardProvider");
	}

	return context;
}
