import type { Shortcut } from "@/lib/keyboard-shortcuts";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutItem } from "./shortcut-display"; // Import the specific component

// Mock lucide icons used in ShortcutItem
vi.mock("lucide-react", () => ({
	PlusCircle: (props: any) => <svg data-testid="icon-plus" {...props} />,
	Trash2: (props: any) => <svg data-testid="icon-trash" {...props} />,
}));

// --- Mock Shortcut Data ---

const mockShortcutSimple: Omit<Shortcut, "action"> = {
	id: "test-simple",
	name: "Simple Action",
	description: "Just a simple key",
	category: "test",
	keys: [{ key: "a", modifiers: {} }],
};

const mockShortcutCtrl: Omit<Shortcut, "action"> = {
	id: "test-ctrl",
	name: "Ctrl Action",
	description: "Ctrl modifier",
	category: "test",
	keys: [{ key: "b", modifiers: { ctrl: true } }],
};

const mockShortcutMultiModifier: Omit<Shortcut, "action"> = {
	id: "test-multi-mod",
	name: "Multi Modifier Action",
	description: "Ctrl+Shift modifiers",
	category: "test",
	keys: [{ key: "c", modifiers: { ctrl: true, shift: true } }],
};

const mockShortcutMultiKeys: Omit<Shortcut, "action"> = {
	id: "test-multi-keys",
	name: "Multi Key Action",
	description: "Two ways to trigger",
	category: "test",
	keys: [
		{ key: "d", modifiers: { alt: true } },
		{ key: "e", modifiers: { meta: true } },
	],
};

// Add dummy action to satisfy the Shortcut type for the component prop
const dummyAction = () => {};
const shortcutSimple: Shortcut = { ...mockShortcutSimple, action: dummyAction };
const shortcutCtrl: Shortcut = { ...mockShortcutCtrl, action: dummyAction };
const shortcutMultiModifier: Shortcut = {
	...mockShortcutMultiModifier,
	action: dummyAction,
};
const shortcutMultiKeys: Shortcut = {
	...mockShortcutMultiKeys,
	action: dummyAction,
};

// --- Tests ---
describe("ShortcutItem Component", () => {
	it("renders shortcut name and description", () => {
		render(<ShortcutItem shortcut={shortcutSimple} />);
		expect(screen.getByText(shortcutSimple.name)).toBeInTheDocument();
		expect(screen.getByText(shortcutSimple.description)).toBeInTheDocument();
	});

	it("renders simple key correctly", () => {
		render(<ShortcutItem shortcut={shortcutSimple} />);
		// formatShortcut capitalizes single keys
		expect(screen.getByText("A")).toBeInTheDocument();
	});

	it("renders key with Ctrl modifier correctly", () => {
		render(<ShortcutItem shortcut={shortcutCtrl} />);
		expect(screen.getByText("Ctrl + B")).toBeInTheDocument();
	});

	it("renders key with multiple modifiers correctly", () => {
		render(<ShortcutItem shortcut={shortcutMultiModifier} />);
		expect(screen.getByText("Ctrl + Shift + C")).toBeInTheDocument();
	});

	it("renders multiple keys for one action correctly", () => {
		render(<ShortcutItem shortcut={shortcutMultiKeys} />);
		// Should render both key combinations
		expect(screen.getByText("Alt + D")).toBeInTheDocument();
		expect(screen.getByText("Meta + E")).toBeInTheDocument();
	});

	it("does not show editing controls when isEditing is false", () => {
		render(<ShortcutItem shortcut={shortcutMultiKeys} />);
		expect(
			screen.queryByRole("button", { name: /add shortcut/i }),
		).not.toBeInTheDocument();
		expect(screen.queryByTestId("icon-trash")).not.toBeInTheDocument();
	});

	it("shows 'Add Shortcut' button when isEditing is true", () => {
		render(<ShortcutItem shortcut={shortcutSimple} isEditing={true} />);
		const addButton = screen.getByRole("button", { name: /add shortcut/i });
		expect(addButton).toBeInTheDocument();
		expect(screen.getByTestId("icon-plus")).toBeInTheDocument(); // Check icon within button
	});

	it("shows remove button next to keys when isEditing is true and multiple keys exist", () => {
		render(<ShortcutItem shortcut={shortcutMultiKeys} isEditing={true} />);
		// Should be two trash icons, one for each key display
		expect(screen.getAllByTestId("icon-trash").length).toBe(2);
	});

	it("does NOT show remove button when isEditing is true but only one key exists", () => {
		render(<ShortcutItem shortcut={shortcutSimple} isEditing={true} />);
		// Should NOT show trash icon if only one key exists
		expect(screen.queryByTestId("icon-trash")).not.toBeInTheDocument();
	});

	// Optional: Test button click handlers if needed, mocking onChange prop
	it("calls onChange when remove button is clicked (and >1 key exists)", () => {
		const mockOnChange = vi.fn();
		render(
			<ShortcutItem
				shortcut={shortcutMultiKeys}
				isEditing={true}
				onChange={mockOnChange}
			/>,
		);

		const removeButtons = screen.getAllByRole("button", {
			name: /remove shortcut/i,
		});
		expect(removeButtons.length).toBe(2); // One for each key

		fireEvent.click(removeButtons[0]); // Click remove on the first key ('Alt + D')

		expect(mockOnChange).toHaveBeenCalledTimes(1);
		// Expect the call with the shortcut data excluding the first key
		expect(mockOnChange).toHaveBeenCalledWith(
			expect.objectContaining({
				id: shortcutMultiKeys.id,
				keys: [shortcutMultiKeys.keys[1]], // Only the second key should remain
			}),
		);
	});

	it("does NOT call onChange when remove button is clicked and only 1 key exists", () => {
		const mockOnChange = vi.fn();
		render(
			<ShortcutItem
				shortcut={shortcutSimple}
				isEditing={true}
				onChange={mockOnChange}
			/>,
		);

		// No remove button should exist
		expect(
			screen.queryByRole("button", { name: /remove shortcut/i }),
		).not.toBeInTheDocument();
		expect(mockOnChange).not.toHaveBeenCalled();
	});

	// Test for recording state could be added here, checking button text/disabled state
	// and simulating key presses to trigger onChange via the useEffect hook.
});
