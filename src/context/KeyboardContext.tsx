import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import {
	type Shortcut,
	matchesShortcut,
	shortcutGroups,
} from "@/lib/keyboard-shortcuts";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface KeyboardContextType {
	shortcuts: Shortcut[];
	isShortcutsDialogOpen: boolean;
	openShortcutsDialog: () => void;
	closeShortcutsDialog: () => void;
	isSearchOverlayOpen: boolean; // Added state for search overlay
	openSearchOverlay: () => void; // Added function to open search overlay
	closeSearchOverlay: () => void; // Added function to close search overlay
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

	// Initialize shortcuts with their actions
	useEffect(() => {
		// Flatten all shortcuts and add actions
		const allShortcuts: Shortcut[] = [];

		for (const group of shortcutGroups) {
			for (const shortcut of group.shortcuts) {
				let action: () => void;

				// Define actions based on shortcut ID
				switch (shortcut.id) {
					case "goto-home":
						action = () => navigate("/");
						break;
					case "goto-settings":
						action = () => navigate("/settings");
						break;
					case "goto-add":
						action = () => navigate("/add");
						break;
					case "goto-search":
						action = () => navigate("/search");
						break;
					case "create-new":
						action = () => navigate("/add");
						break;
					case "save-entry":
						action = () => {
							toast({
								title: "Save Action",
								description: "This action would save the current entry",
							});
						};
						break;
					case "search":
						action = () => navigate("/search");
						break;
					case "toggle-theme":
						action = () => {
							const newTheme = theme === "dark" ? "light" : "dark";
							setTheme(newTheme);
							toast({
								title: "Theme Changed",
								description: `Theme switched to ${newTheme} mode`,
							});
						};
						break;
					case "show-shortcuts":
						action = () => setIsShortcutsDialogOpen(true);
						break;
					case "focus-search": // Will be renamed later, now opens overlay
						action = () => setIsSearchOverlayOpen(true);
						break;
					case "delete-article":
						action = () => {
							// This action needs context (which article is selected).
							// It should be handled by the component displaying the article.
							console.log(
								"Delete shortcut pressed - requires context-specific handling.",
							);
							toast({
								title: "Delete Shortcut",
								description:
									"Press Delete when an article card or reader is active.",
								variant: "default",
							});
						};
						break;
					default:
						action = () =>
							console.log(`Action for ${shortcut.id} not implemented`);
				}

				allShortcuts.push({
					...shortcut,
					action,
				});
			}
		}

		setShortcuts(allShortcuts);
	}, [navigate, theme, setTheme, toast]);

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
