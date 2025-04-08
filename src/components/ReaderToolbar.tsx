import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet"; // Keep SheetTrigger
import {
	ArrowLeft,
	Bookmark,
	BookmarkCheck,
	Maximize2,
	Minimize2,
	PanelRightOpen,
} from "lucide-react";

interface ReaderToolbarProps {
	isFavorite: boolean;
	isFullscreen: boolean;
	isSidebarOpen: boolean; // Needed for Sheet state if controlled externally
	onGoBack: () => void;
	onToggleFavorite: () => void;
	onToggleFullscreen: () => void;
	onToggleSidebar: (open: boolean) => void; // Function to change sidebar state
}

export function ReaderToolbar({
	isFavorite,
	isFullscreen,
	isSidebarOpen,
	onGoBack,
	onToggleFavorite,
	onToggleFullscreen,
	onToggleSidebar,
}: ReaderToolbarProps) {
	return (
		<div className="border-b p-4 flex items-center justify-between">
			<Button variant="ghost" size="icon" onClick={onGoBack}>
				<ArrowLeft size={20} />
			</Button>
			<div className="flex items-center gap-2">
				<Button variant="ghost" size="icon" onClick={onToggleFavorite}>
					{isFavorite ? (
						<BookmarkCheck className="h-5 w-5 text-thinkara-500" />
					) : (
						<Bookmark className="h-5 w-5" />
					)}
				</Button>
				<Button variant="ghost" size="icon" onClick={onToggleFullscreen}>
					{isFullscreen ? (
						<Minimize2 className="h-5 w-5" />
					) : (
						<Maximize2 className="h-5 w-5" />
					)}
				</Button>
				{/* Sidebar Trigger - Sheet state controlled by parent */}
				<Sheet open={isSidebarOpen} onOpenChange={onToggleSidebar}>
					<SheetTrigger asChild>
						<Button variant="ghost" size="icon">
							<PanelRightOpen className="h-5 w-5" />
						</Button>
					</SheetTrigger>
					{/* SheetContent is rendered by the parent component */}
				</Sheet>
			</div>
		</div>
	);
}
