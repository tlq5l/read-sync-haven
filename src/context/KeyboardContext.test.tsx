// Removed unused React import
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardProvider, useKeyboard } from "./KeyboardContext";
// Removed unused Shortcut type import

// --- Mocks ---
const mockNavigate = vi.fn();
const mockSetTheme = vi.fn();
const mockToast = vi.fn();
const mockRefreshArticles = vi.fn().mockResolvedValue([]);
// Removed unused mockToggleSidebar

vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return {
		...actual,
		useNavigate: () => mockNavigate,
	};
});

vi.mock("@/context/ThemeContext", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/context/ThemeContext")>();
	return {
		...actual,
		useTheme: () => ({
			theme: "light",
			setTheme: mockSetTheme,
		}),
	};
});

vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ toast: mockToast }),
}));

// Mock useArticles to provide necessary functions like refreshArticles if tested
const mockArticleContextValue = {
	refreshArticles: mockRefreshArticles,
	// Add other properties if KeyboardContext depends on them
};
vi.mock("@/context/ArticleContext", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/context/ArticleContext")>();
	return {
		...actual,
		useArticles: () => mockArticleContextValue, // Return stable mock object
	};
});
// --- End Mocks ---

// Test component to consume and display context values
const KeyboardStateDisplay = () => {
	const { isShortcutsDialogOpen, isSearchOverlayOpen } = useKeyboard(); // Removed unused isSidebarCollapsed
	return (
		<div>
			<div data-testid="shortcuts-dialog-state">
				{isShortcutsDialogOpen.toString()}
			</div>
			<div data-testid="search-overlay-state">
				{isSearchOverlayOpen.toString()}
			</div>
			{/* Add other states if needed */}
			<input type="text" data-testid="input-element" />
		</div>
	);
};

describe("KeyboardContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset localStorage if necessary, though KeyboardProvider reads on mount
		localStorage.clear();
	});

	it("should open shortcuts dialog when Ctrl+/ is pressed", () => {
		act(() => {
			render(
				<KeyboardProvider>
					<KeyboardStateDisplay />
				</KeyboardProvider>,
			);
		});

		const dialogState = screen.getByTestId("shortcuts-dialog-state");
		expect(dialogState).toHaveTextContent("false"); // Initial state

		// Simulate the keydown event
		act(() => {
			fireEvent.keyDown(document, {
				key: "/",
				code: "Slash",
				ctrlKey: true,
			});
		});

		// Assert that the state updated
		expect(dialogState).toHaveTextContent("true");
		expect(mockNavigate).not.toHaveBeenCalled(); // Ensure other actions weren't triggered
	});

	it("should open search overlay when / is pressed", () => {
		act(() => {
			render(
				<KeyboardProvider>
					<KeyboardStateDisplay />
				</KeyboardProvider>,
			);
		});

		const overlayState = screen.getByTestId("search-overlay-state");
		expect(overlayState).toHaveTextContent("false"); // Initial state

		// Simulate the keydown event
		act(() => {
			fireEvent.keyDown(document, {
				key: "/",
				code: "Slash",
				ctrlKey: false, // No Ctrl
			});
		});

		// Assert that the state updated
		expect(overlayState).toHaveTextContent("true");
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("should navigate to add page when Alt+a is pressed", () => {
		act(() => {
			render(
				<KeyboardProvider>
					<KeyboardStateDisplay />
				</KeyboardProvider>,
			);
		});

		// Simulate the keydown event
		act(() => {
			fireEvent.keyDown(document, {
				key: "a",
				code: "KeyA",
				altKey: true,
			});
		});

		// Assert that navigate was called
		expect(mockNavigate).toHaveBeenCalledTimes(1);
		expect(mockNavigate).toHaveBeenCalledWith("/add");
	});

	it("should not trigger shortcut if modifier doesn't match (Ctrl+/)", () => {
		act(() => {
			render(
				<KeyboardProvider>
					<KeyboardStateDisplay />
				</KeyboardProvider>,
			);
		});

		const dialogState = screen.getByTestId("shortcuts-dialog-state");
		expect(dialogState).toHaveTextContent("false");

		act(() => {
			fireEvent.keyDown(document, {
				key: "/",
				code: "Slash",
				ctrlKey: false, // Incorrect modifier
			});
		});

		expect(dialogState).toHaveTextContent("false"); // State should not change
	});

	it("should not trigger shortcut if key doesn't match (Ctrl+/)", () => {
		act(() => {
			render(
				<KeyboardProvider>
					<KeyboardStateDisplay />
				</KeyboardProvider>,
			);
		});

		const dialogState = screen.getByTestId("shortcuts-dialog-state");
		expect(dialogState).toHaveTextContent("false");

		act(() => {
			fireEvent.keyDown(document, {
				key: "k", // Incorrect key
				code: "KeyK",
				ctrlKey: true,
			});
		});

		expect(dialogState).toHaveTextContent("false"); // State should not change
	});

	it("should not trigger shortcut when an input element is focused", () => {
		act(() => {
			render(
				<KeyboardProvider>
					<KeyboardStateDisplay />
				</KeyboardProvider>,
			);
		});

		const dialogState = screen.getByTestId("shortcuts-dialog-state");
		const inputElement = screen.getByTestId("input-element");
		expect(dialogState).toHaveTextContent("false");

		// Focus the input element
		act(() => {
			inputElement.focus();
		});

		// Simulate the keydown event on the input
		act(() => {
			fireEvent.keyDown(inputElement, {
				key: "/",
				code: "Slash",
				ctrlKey: true,
			});
		});

		// State should not change because input was focused
		expect(dialogState).toHaveTextContent("false");
	});

	// Test for saving/updating shortcuts could be added here if needed,
	// involving localStorage interaction and calling `updateShortcuts` from the context.
});
