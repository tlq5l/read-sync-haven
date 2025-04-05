import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import {
	type Shortcut,
	formatShortcut, // Added import
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
	isSearchOverlayOpen: boolean; // Added state for search overlay
	openSearchOverlay: () => void; // Added function to open search overlay
	closeSearchOverlay: () => void; // Added function to close search overlay
	updateShortcuts: (newShortcuts: Shortcut[]) => boolean; // Added update function
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
	const [isSearchOverlayOpen, setIsSearchOverlayOpen] = useState(false); // State for search overlay
	const USER_SHORTCUTS_KEY = "userKeyboardShortcuts"; // Key for localStorage

	// Function to get action by ID (avoids repetition)
	const getActionById = useCallback(
		(id: string): (() => void) => {
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
				default:
					return () => console.log(`Action for ${id} not implemented`);
			}
		},
		[
			navigate,
			// setIsShortcutsDialogOpen, // Removed stable setter
			// setIsSearchOverlayOpen, // Removed stable setter
			theme,
			setTheme,
			toast,
		], // Dependencies for useCallback
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
			// Don't trigger shortcuts when in input elements
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement ||
				event.target instanceof HTMLSelectElement
			) {
				return;
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
	}, [shortcuts]);

	const openShortcutsDialog = () => setIsShortcutsDialogOpen(true);
	const closeShortcutsDialog = () => setIsShortcutsDialogOpen(false);
	const openSearchOverlay = () => setIsSearchOverlayOpen(true);
	const closeSearchOverlay = () => setIsSearchOverlayOpen(false);

	return (
		<KeyboardContext.Provider
			value={{
				shortcuts,
				isShortcutsDialogOpen,
				openShortcutsDialog,
				closeShortcutsDialog,
				isSearchOverlayOpen,
				openSearchOverlay,
				closeSearchOverlay,
				updateShortcuts, // Provide the update function
			}}
		>
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
