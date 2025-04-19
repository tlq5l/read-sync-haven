import { Button } from "@/components/ui/button";
import {
	type Shortcut,
	type ShortcutKey,
	formatShortcut,
	shortcutGroups,
} from "@/lib/keyboard-shortcuts"; // Consolidated imports, added shortcutGroups
import { cn } from "@/lib/utils";
import { PlusCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react"; // Removed React import

interface ShortcutItemProps {
	shortcut: Shortcut;
	isEditing?: boolean; // Added prop
	onChange?: (updatedShortcut: Shortcut) => void; // Added prop
}

/**
 * Displays a single shortcut action with its associated keys and allows editing of shortcut keys.
 *
 * When editing is enabled, users can add new shortcut keys by capturing keyboard input or remove existing keys (except the last one). Changes are propagated via the {@link onChange} callback.
 *
 * @param shortcut - The shortcut action and its keys to display and edit.
 * @param isEditing - Enables editing controls for adding or removing shortcut keys.
 * @param onChange - Callback invoked with the updated shortcut when keys are added or removed.
 *
 * @remark
 * Only one shortcut key can be removed at a time, and the last remaining key cannot be deleted.
 */
export function ShortcutItem({
	shortcut,
	isEditing = false,
	onChange,
}: ShortcutItemProps) {
	const [isRecording, setIsRecording] = useState(false);

	// Effect to handle key capture when recording
	useEffect(() => {
		if (!isRecording || !onChange) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();

			// Ignore modifier-only key presses for capture
			if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
				return;
			}

			const newKey: ShortcutKey = {
				key: event.key,
				modifiers: {
					ctrl: event.ctrlKey,
					alt: event.altKey,
					shift: event.shiftKey,
					meta: event.metaKey,
				},
			};

			// Basic check for duplicate within the same shortcut action
			const isDuplicate = shortcut.keys.some(
				(existingKey) =>
					existingKey.key.toLowerCase() === newKey.key.toLowerCase() &&
					!!existingKey.modifiers.ctrl === newKey.modifiers.ctrl &&
					!!existingKey.modifiers.alt === newKey.modifiers.alt &&
					!!existingKey.modifiers.shift === newKey.modifiers.shift &&
					!!existingKey.modifiers.meta === newKey.modifiers.meta,
			);

			if (!isDuplicate) {
				onChange({ ...shortcut, keys: [...shortcut.keys, newKey] });
			} else {
				// Optional: Add user feedback about duplicate
				console.warn("Shortcut already exists for this action.");
			}

			setIsRecording(false); // Stop recording
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true }); // Use capture phase

		// Cleanup listener
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [isRecording, shortcut, onChange]);

	const handleStartRecording = () => {
		setIsRecording(true); // Start recording
	};

	const handleRemoveShortcut = (keyToRemove: ShortcutKey) => {
		if (onChange && shortcut.keys.length > 1) {
			// Prevent removing the last key
			const updatedKeys = shortcut.keys.filter(
				(existingKey) =>
					!(
						// Correctly compare key objects
						(
							existingKey.key.toLowerCase() === keyToRemove.key.toLowerCase() &&
							!!existingKey.modifiers.ctrl === !!keyToRemove.modifiers.ctrl &&
							!!existingKey.modifiers.alt === !!keyToRemove.modifiers.alt &&
							!!existingKey.modifiers.shift === !!keyToRemove.modifiers.shift &&
							!!existingKey.modifiers.meta === !!keyToRemove.modifiers.meta
						)
					),
			);
			// Ensure keys were actually removed before calling onChange
			if (updatedKeys.length < shortcut.keys.length) {
				onChange({ ...shortcut, keys: updatedKeys });
			}
		} else {
			// Optionally notify user they can't remove the last key
			console.warn("Cannot remove the last shortcut key.");
		}
	};

	return (
		<div className="flex justify-between items-start py-3">
			{" "}
			{/* Changed items-center to items-start */}
			<div className="flex-1 mr-4">
				{" "}
				{/* Added flex-1 and margin */}
				<p className="font-medium">{shortcut.name}</p>
				<p className="text-sm text-muted-foreground">{shortcut.description}</p>
			</div>
			<div className="flex flex-col items-end space-y-1">
				{" "}
				{/* Changed layout to vertical stack */}
				{shortcut.keys.map(
					(
						key, // Removed unused index parameter
					) => (
						<div
							key={formatShortcut([key])}
							className="flex items-center group"
						>
							{" "}
							{/* Use formatted string as key */}
							<kbd className="inline-flex h-7 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-sm font-medium text-muted-foreground">
								{formatShortcut([key])} {/* Format single key */}
							</kbd>
							{isEditing &&
								shortcut.keys.length > 1 && ( // Show remove button only if editing and not the last key
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6 ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={() => handleRemoveShortcut(key)}
										title="Remove shortcut"
									>
										<Trash2 className="h-4 w-4 text-destructive" />
									</Button>
								)}
						</div>
					),
				)}
				{isEditing && (
					<Button // Restored the missing opening Button tag
						variant="outline"
						size="sm"
						className="h-7 text-xs mt-1"
						onClick={handleStartRecording}
						disabled={isRecording} // Disable button while recording
					>
						{isRecording ? (
							"Recording... Press keys"
						) : (
							<>
								<PlusCircle className="mr-1 h-3 w-3" /> Add Shortcut
							</>
						)}
					</Button>
				)}
			</div>
		</div>
	);
}

interface ShortcutCategoryProps {
	title: string;
	description: string;
	shortcuts: Shortcut[];
	isEditing?: boolean; // Added prop
	onShortcutChange?: (updatedShortcut: Shortcut) => void; // Added prop
}

/**
 * Displays a category of keyboard shortcuts with optional editing capabilities.
 *
 * Renders the category title, description, and a list of shortcut items. If editing is enabled, allows shortcut keys within the category to be modified via provided handlers.
 *
 * @param title - The title of the shortcut category.
 * @param description - A brief description of the category.
 * @param shortcuts - The list of shortcuts belonging to this category.
 * @param isEditing - If true, enables editing controls for the shortcuts.
 * @param onShortcutChange - Callback invoked when a shortcut in the category is updated.
 */
export function ShortcutCategory({
	title,
	description,
	shortcuts,
	isEditing = false, // Added prop
	onShortcutChange, // Added prop
}: ShortcutCategoryProps) {
	return (
		<div className="space-y-4 pt-4">
			<div>
				<h3 className="text-lg font-semibold">{title}</h3>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<div className="space-y-2 divide-y">
				{shortcuts.map((shortcut) => (
					<ShortcutItem
						key={shortcut.id}
						shortcut={shortcut}
						isEditing={isEditing}
						onChange={onShortcutChange} // Pass handler down
					/>
				))}
			</div>
		</div>
	);
}

interface ShortcutDisplayProps {
	shortcuts: Shortcut[];
	className?: string;
	isEditing?: boolean; // Added prop
	onShortcutChange?: (updatedShortcut: Shortcut) => void; // Added prop
}

/**
 * Displays a grouped list of keyboard shortcuts by category, with optional editing capabilities.
 *
 * @param shortcuts - The array of shortcut definitions to display and manage.
 * @param className - Optional additional CSS classes for the container.
 * @param isEditing - If true, enables editing mode for adding or removing shortcut keys.
 * @param onShortcutChange - Optional callback invoked when a shortcut is updated.
 */
export function ShortcutDisplay({
	shortcuts,
	className,
	isEditing = false, // Added prop
	onShortcutChange, // Added prop
}: ShortcutDisplayProps) {
	// Group shortcuts by category
	const groupedShortcuts = shortcuts.reduce(
		(groups, shortcut) => {
			const category = shortcut.category;
			if (!groups[category]) {
				groups[category] = [];
			}
			groups[category].push(shortcut);
			return groups;
		},
		{} as Record<string, Shortcut[]>,
	);

	// Find the corresponding group information for each category
	const categories = Object.keys(groupedShortcuts).map((category) => {
		// Find the group info from shortcutGroups
		const groupInfo = shortcutGroups.find(
			(group) => group.category === category,
		);

		return {
			category,
			title:
				groupInfo?.title ||
				category.charAt(0).toUpperCase() + category.slice(1),
			description: groupInfo?.description || "",
			shortcuts: groupedShortcuts[category],
		};
	});

	return (
		<div className={cn("space-y-6", className)}>
			{categories.map((category) => (
				<ShortcutCategory
					key={category.category}
					title={category.title}
					description={category.description}
					shortcuts={category.shortcuts}
					isEditing={isEditing} // Pass prop down
					onShortcutChange={onShortcutChange} // Pass handler down
				/>
			))}
		</div>
	);
}

// Import shortcutGroups at the top level since it's used in the component
// Removed duplicate import - moved to top
