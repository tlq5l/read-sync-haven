// Unused imports removed

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
	keys: ShortcutKey[]; // Changed to array
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
				keys: [
					// Changed to array
					{
						key: "h",
						modifiers: { alt: true },
					},
					{
						// Example second shortcut
						key: "1",
						modifiers: { ctrl: true },
					},
				],
			},
			{
				id: "goto-settings",
				name: "Go to Settings",
				description: "Navigate to the settings page",
				category: "navigation",
				keys: [
					// Changed to array
					{
						key: "s",
						modifiers: { alt: true },
					},
				],
			},
			{
				id: "goto-add",
				name: "Go to Add Page",
				description: "Navigate to the add page",
				category: "navigation",
				keys: [
					// Changed to array
					{
						key: "a",
						modifiers: { alt: true },
					},
				],
			},
			{
				id: "goto-search",
				name: "Go to Search",
				description: "Navigate to the search page",
				category: "navigation",
				keys: [
					// Changed to array
					{
						key: "r",
						modifiers: { alt: true },
					},
				],
			},
			{
				id: "open-search-overlay", // Renamed ID
				name: "Open Search",
				description: "Open the global search overlay", // Updated description
				category: "navigation",
				keys: [
					// Changed to array
					{
						key: "/",
						modifiers: {},
					},
				],
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
				keys: [
					// Changed to array
					{
						key: "n",
						modifiers: { ctrl: true },
					},
				],
			},
			{
				id: "save-entry",
				name: "Save Current Entry",
				description: "Save the current entry",
				category: "content",
				keys: [
					// Changed to array
					{
						key: "Enter",
						modifiers: { ctrl: true },
					},
				],
			},
			{
				id: "search",
				name: "Search",
				description: "Search for content",
				category: "content",
				keys: [
					// Changed to array
					{
						key: "f",
						modifiers: { ctrl: true },
					},
				],
			},
			{
				id: "delete-article",
				name: "Delete Article",
				description: "Delete the currently selected/viewed article",
				category: "content",
				keys: [
					// Changed to array
					{
						key: "Delete",
						modifiers: {},
					},
				],
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
				keys: [
					// Changed to array
					{
						key: "d",
						modifiers: { ctrl: true },
					},
				],
			},
			{
				id: "show-shortcuts",
				name: "Show Keyboard Shortcuts",
				description: "Display a list of all keyboard shortcuts",
				category: "interface",
				keys: [
					// Changed to array
					{
						key: "/",
						modifiers: { ctrl: true },
					},
				],
			},
		],
	},
];

// Helper function to check if a keyboard event matches a shortcut key
export function matchesShortcut(
	event: KeyboardEvent,
	shortcutKeys: ShortcutKey[], // Changed to accept array
): boolean {
	// Check if the event matches ANY of the keys in the array
	for (const shortcutKey of shortcutKeys) {
		const { key, modifiers } = shortcutKey;
		const { ctrlKey, altKey, shiftKey, metaKey } = event;

		// Check if the main key matches (case insensitive for letter keys)
		const keyMatches = event.key.toLowerCase() === key.toLowerCase();

		// Check if modifier keys match
		const ctrlMatches = Boolean(modifiers.ctrl) === ctrlKey;
		const altMatches = Boolean(modifiers.alt) === altKey;
		const shiftMatches = Boolean(modifiers.shift) === shiftKey;
		const metaMatches = Boolean(modifiers.meta) === metaKey;

		if (
			keyMatches &&
			ctrlMatches &&
			altMatches &&
			shiftMatches &&
			metaMatches
		) {
			return true; // Match found
		}
	}
	return false; // No match found in the array
}

// Helper function to format shortcut for display
export function formatShortcut(shortcutKeys: ShortcutKey[]): string {
	// Helper function to format a single key
	const formatSingleKey = (shortcutKey: ShortcutKey): string => {
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
	};

	// Format all keys in the array and join with " or "
	return shortcutKeys.map(formatSingleKey).join(" or ");
}
