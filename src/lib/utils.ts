import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// Keyboard shortcut utils
export function isInputElement(element: Element | null): boolean {
	if (!element) return false;

	const tagName = element.tagName.toLowerCase();
	return (
		tagName === "input" ||
		tagName === "textarea" ||
		tagName === "select" ||
		element.hasAttribute("contenteditable")
	);
}

export function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
	// Don't trigger shortcuts in input elements
	if (isInputElement(event.target as Element)) {
		return true;
	}

	// Don't trigger shortcuts if modifiers are pressed with common edit operations
	// (like Ctrl+C, Ctrl+V, etc.)
	const commonEditKeys = ["c", "v", "x", "a", "z"];
	if (
		event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey &&
		commonEditKeys.includes(event.key.toLowerCase())
	) {
		const isInInput = isInputElement(document.activeElement);
		// Allow edit shortcuts in inputs, but block them as global shortcuts
		return isInInput;
	}

	return false;
}

// Debounce utility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
	func: T,
	wait: number,
): (...args: Parameters<T>) => void {
	let timeoutId: NodeJS.Timeout | null = null;

	return (...args: Parameters<T>) => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		timeoutId = setTimeout(() => {
			func(...args);
			timeoutId = null;
		}, wait);
	};
}
