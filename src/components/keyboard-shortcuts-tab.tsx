
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShortcutDisplay } from "@/components/ui/shortcut-display";
import { useKeyboard } from "@/context/KeyboardContext";
import { Separator } from "@/components/ui/separator";
import { Keyboard } from "lucide-react";

export function KeyboardShortcutsTab() {
	const { shortcuts } = useKeyboard();

	return (
		<Card>
			<CardHeader className="flex flex-row items-center">
				<div className="flex items-center space-x-2">
					<Keyboard className="h-5 w-5" />
					<CardTitle>Keyboard Shortcuts</CardTitle>
				</div>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground mb-4">
					These keyboard shortcuts can help you navigate and use the application
					more efficiently. Use Alt+/ to quickly view this list at any time.
				</p>

				<Separator className="my-4" />

				<ShortcutDisplay shortcuts={shortcuts} />

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
