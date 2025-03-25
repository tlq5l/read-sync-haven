import { useNavigate } from "react-router-dom";
import { useTheme } from "@/context/ThemeContext";

export interface ShortcutKey {
	key: string;
	modifiers: {
		ctrl?: boolean;
		alt?: boolean;
		shift?: boolean;
		meta?: boolean;
	};
}

export interface Shortcut {
	id: string;
	name: string;
	description: string;
	category: string;
	keys: ShortcutKey;
	action: () => void;
}

export type ShortcutCategory = "navigation" | "content" | "interface";

export interface ShortcutGroup {
	category: ShortcutCategory;
	title: string;
	description: string;
	shortcuts: Omit<Shortcut, "action">[];
}

// Define shortcut groups without actions (will be added when context is initialized)
export const shortcutGroups: ShortcutGroup[] = [
	{
		category: "navigation",
		title: "Navigation",
		description: "Shortcuts for navigating between pages",
		shortcuts: [
			{
				id: "goto-home",
				name: "Go to Home",
				description: "Navigate to the home page",
				category: "navigation",
				keys: {
					key: "h",
					modifiers: { alt: true },
				},
			},
			{
				id: "goto-settings",
				name: "Go to Settings",
				description: "Navigate to the settings page",
				category: "navigation",
				keys: {
					key: "s",
					modifiers: { alt: true },
				},
			},
			{
				id: "goto-add",
				name: "Go to Add Page",
				description: "Navigate to the add page",
				category: "navigation",
				keys: {
					key: "a",
					modifiers: { alt: true },
				},
			},
			{
				id: "goto-search",
				name: "Go to Search",
				description: "Navigate to the search page",
				category: "navigation",
				keys: {
					key: "r",
					modifiers: { alt: true },
				},
			},
		],
	},
	{
		category: "content",
		title: "Content",
		description: "Shortcuts for managing content",
		shortcuts: [
			{
				id: "create-new",
				name: "Create New Entry",
				description: "Create a new entry",
				category: "content",
				keys: {
					key: "n",
					modifiers: { ctrl: true },
				},
			},
			{
				id: "save-entry",
				name: "Save Current Entry",
				description: "Save the current entry",
				category: "content",
				keys: {
					key: "Enter",
					modifiers: { ctrl: true },
				},
			},
			{
				id: "search",
				name: "Search",
				description: "Search for content",
				category: "content",
				keys: {
					key: "f",
					modifiers: { ctrl: true },
				},
			},
		],
	},
	{
		category: "interface",
		title: "Interface",
		description: "Shortcuts for interface controls",
		shortcuts: [
			{
				id: "toggle-theme",
				name: "Toggle Dark Mode",
				description: "Switch between light and dark mode",
				category: "interface",
				keys: {
					key: "d",
					modifiers: { ctrl: true },
				},
			},
			{
				id: "show-shortcuts",
				name: "Show Keyboard Shortcuts",
				description: "Display a list of all keyboard shortcuts",
				category: "interface",
				keys: {
					key: "/",
					modifiers: { ctrl: true },
				},
			},
		],
	},
];

// Helper function to check if a keyboard event matches a shortcut key
export function matchesShortcut(
	event: KeyboardEvent,
	shortcutKey: ShortcutKey,
): boolean {
	const { key, modifiers } = shortcutKey;
	const { ctrlKey, altKey, shiftKey, metaKey } = event;

	// Check if the main key matches (case insensitive for letter keys)
	const keyMatches = event.key.toLowerCase() === key.toLowerCase();

	// Check if modifier keys match
	const ctrlMatches = Boolean(modifiers.ctrl) === ctrlKey;
	const altMatches = Boolean(modifiers.alt) === altKey;
	const shiftMatches = Boolean(modifiers.shift) === shiftKey;
	const metaMatches = Boolean(modifiers.meta) === metaKey;

	return keyMatches && ctrlMatches && altMatches && shiftMatches && metaMatches;
}

// Helper function to format shortcut for display
export function formatShortcut(shortcutKey: ShortcutKey): string {
	const { key, modifiers } = shortcutKey;
	const parts: string[] = [];

	if (modifiers.ctrl) parts.push("Ctrl");
	if (modifiers.alt) parts.push("Alt");
	if (modifiers.shift) parts.push("Shift");
	if (modifiers.meta) parts.push("Meta");

	// Format key nicely (capitalize, use symbols when appropriate)
	let formattedKey = key;
	if (key.length === 1) {
		formattedKey = key.toUpperCase();
	}

	parts.push(formattedKey);

	return parts.join(" + ");
}
