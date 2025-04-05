import { Button } from "@/components/ui/button"; // Added Button import
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShortcutDisplay } from "@/components/ui/shortcut-display";
import { useKeyboard } from "@/context/KeyboardContext"; // Assuming context provides update function later
import type { Shortcut } from "@/lib/keyboard-shortcuts"; // Import Shortcut type
import { Keyboard, Pencil, Save, X } from "lucide-react"; // Added icons
import { useEffect, useState } from "react"; // Added useState, useEffect

export function KeyboardShortcutsTab() {
	const { shortcuts: initialShortcuts, updateShortcuts } = useKeyboard(); // Get updateShortcuts
	const [isEditing, setIsEditing] = useState(false);
	const [editedShortcuts, setEditedShortcuts] = useState<Shortcut[]>([]);

	// Initialize editedShortcuts when component mounts or initialShortcuts change
	useEffect(() => {
		// Deep clone to prevent modifying original context state directly
		setEditedShortcuts(JSON.parse(JSON.stringify(initialShortcuts)));
	}, [initialShortcuts]);

	const handleEdit = () => {
		setIsEditing(true);
	};

	const handleCancel = () => {
		// Reset changes
		setEditedShortcuts(JSON.parse(JSON.stringify(initialShortcuts)));
		setIsEditing(false);
	};

	const handleSave = () => {
		const success = updateShortcuts(editedShortcuts);
		if (success) {
			setIsEditing(false);
			// Optionally update local state if context doesn't force re-render,
			// but relying on context update is generally better.
			// setEditedShortcuts(JSON.parse(JSON.stringify(editedShortcuts))); // Reflect saved state
		}
		// If success is false, validation failed, stay in editing mode
	};

	// Placeholder for handling changes within the editable display
	const handleShortcutChange = (updatedShortcut: Shortcut) => {
		setEditedShortcuts((prev) =>
			prev.map((sc) => (sc.id === updatedShortcut.id ? updatedShortcut : sc)),
		);
	};

	return (
		<Card>
			<CardHeader className="flex flex-row items-center">
				<div className="flex items-center space-x-2">
					<Keyboard className="h-5 w-5" />
					<CardTitle>Keyboard Shortcuts</CardTitle>
				</div>
				<div className="ml-auto">
					{isEditing ? (
						<div className="flex space-x-2">
							<Button variant="outline" size="sm" onClick={handleCancel}>
								<X className="mr-2 h-4 w-4" /> Cancel
							</Button>
							<Button size="sm" onClick={handleSave}>
								<Save className="mr-2 h-4 w-4" /> Save
							</Button>
						</div>
					) : (
						<Button variant="outline" size="sm" onClick={handleEdit}>
							<Pencil className="mr-2 h-4 w-4" /> Edit
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground mb-4">
					These keyboard shortcuts can help you navigate and use the application
					more efficiently. Use Alt+/ to quickly view this list at any time.
				</p>

				<Separator className="my-4" />

				{isEditing ? (
					// Placeholder for the editable shortcut display
					<div className="p-4 border rounded bg-muted/40">
						<p className="text-center text-muted-foreground">
							Editing UI will go here...
						</p>
						{/* Pass editing props to ShortcutDisplay */}
						<ShortcutDisplay
							shortcuts={editedShortcuts}
							isEditing={true}
							onShortcutChange={handleShortcutChange}
						/>
					</div>
				) : (
					// Pass potentially updated shortcuts from context
					<ShortcutDisplay shortcuts={initialShortcuts} />
				)}

				<div className="mt-6 text-sm text-muted-foreground">
					<p className="font-medium">Note:</p>
					<p>
						Shortcuts don't work when typing in text fields or when focused on
						editable content.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
