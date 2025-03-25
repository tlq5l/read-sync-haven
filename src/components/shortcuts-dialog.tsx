import React from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ShortcutDisplay } from "@/components/ui/shortcut-display";
import { useKeyboard } from "@/context/KeyboardContext";

export function ShortcutsDialog() {
	const { shortcuts, isShortcutsDialogOpen, closeShortcutsDialog } =
		useKeyboard();

	return (
		<Dialog open={isShortcutsDialogOpen} onOpenChange={closeShortcutsDialog}>
			<DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Keyboard Shortcuts</DialogTitle>
					<DialogDescription>
						These keyboard shortcuts help you navigate and use the application
						more efficiently.
					</DialogDescription>
				</DialogHeader>
				<div className="py-4">
					<ShortcutDisplay shortcuts={shortcuts} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
