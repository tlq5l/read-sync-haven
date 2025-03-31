import { describe, expect, it, vi } from "vitest";
import type { ShortcutKey } from "./keyboard-shortcuts";
import { formatShortcut, matchesShortcut } from "./keyboard-shortcuts";

// Helper to create mock KeyboardEvent
const createMockEvent = (
	key: string,
	ctrlKey = false,
	altKey = false,
	shiftKey = false,
	metaKey = false,
): Partial<KeyboardEvent> => {
	return {
		key,
		ctrlKey,
		altKey,
		shiftKey,
		metaKey,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
	} as Partial<KeyboardEvent>;
};

describe("lib/keyboard-shortcuts", () => {
	describe("matchesShortcut", () => {
		it("should match simple key without modifiers", () => {
			const shortcut: ShortcutKey = { key: "a", modifiers: {} };
			const event = createMockEvent("a");
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true);
		});

		it("should not match simple key with wrong case", () => {
			// matchesShortcut converts both to lowercase for comparison
			const shortcut: ShortcutKey = { key: "a", modifiers: {} };
			const event = createMockEvent("A");
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true); // Case insensitive match
		});

		it("should match key with Ctrl modifier", () => {
			const shortcut: ShortcutKey = { key: "c", modifiers: { ctrl: true } };
			const event = createMockEvent("c", true);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true);
		});

		it("should not match key with Ctrl modifier if Ctrl is not pressed", () => {
			const shortcut: ShortcutKey = { key: "c", modifiers: { ctrl: true } };
			const event = createMockEvent("c", false);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(false);
		});

		it("should not match key without Ctrl modifier if Ctrl is pressed", () => {
			const shortcut: ShortcutKey = { key: "c", modifiers: {} };
			const event = createMockEvent("c", true);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(false);
		});

		it("should match key with Alt modifier", () => {
			const shortcut: ShortcutKey = { key: "h", modifiers: { alt: true } };
			const event = createMockEvent("h", false, true);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true);
		});

		it("should match key with Shift modifier", () => {
			const shortcut: ShortcutKey = { key: "S", modifiers: { shift: true } }; // Key 'S' implies Shift is needed
			const event = createMockEvent("S", false, false, true);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true);
		});

		it("should match key with Meta modifier", () => {
			const shortcut: ShortcutKey = { key: "k", modifiers: { meta: true } };
			const event = createMockEvent("k", false, false, false, true);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true);
		});

		it("should match key with multiple modifiers (Ctrl+Shift)", () => {
			const shortcut: ShortcutKey = {
				key: "X",
				modifiers: { ctrl: true, shift: true },
			};
			const event = createMockEvent("X", true, false, true);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true);
		});

		it("should not match key with multiple modifiers if one is missing", () => {
			const shortcut: ShortcutKey = {
				key: "X",
				modifiers: { ctrl: true, shift: true },
			};
			const event = createMockEvent("X", true, false, false); // Shift missing
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(false);
		});

		it("should not match key with multiple modifiers if an extra one is pressed", () => {
			const shortcut: ShortcutKey = { key: "c", modifiers: { ctrl: true } };
			const event = createMockEvent("c", true, true); // Alt pressed extra
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(false);
		});

		it("should match non-letter keys like Enter", () => {
			const shortcut: ShortcutKey = { key: "Enter", modifiers: { ctrl: true } };
			const event = createMockEvent("Enter", true);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true);
		});

		it("should match non-letter keys like /", () => {
			const shortcut: ShortcutKey = { key: "/", modifiers: { ctrl: true } };
			const event = createMockEvent("/", true);
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(true);
		});

		it("should not match if the key is different", () => {
			const shortcut: ShortcutKey = { key: "a", modifiers: {} };
			const event = createMockEvent("b");
			expect(matchesShortcut(event as KeyboardEvent, shortcut)).toBe(false);
		});
	});

	describe("formatShortcut", () => {
		it("should format simple key", () => {
			const shortcut: ShortcutKey = { key: "a", modifiers: {} };
			expect(formatShortcut(shortcut)).toBe("A");
		});

		it("should format key with Ctrl", () => {
			const shortcut: ShortcutKey = { key: "c", modifiers: { ctrl: true } };
			expect(formatShortcut(shortcut)).toBe("Ctrl + C");
		});

		it("should format key with Alt", () => {
			const shortcut: ShortcutKey = { key: "h", modifiers: { alt: true } };
			expect(formatShortcut(shortcut)).toBe("Alt + H");
		});

		it("should format key with Shift", () => {
			const shortcut: ShortcutKey = { key: "s", modifiers: { shift: true } };
			expect(formatShortcut(shortcut)).toBe("Shift + S"); // Key should be uppercase
		});

		it("should format key with Meta", () => {
			const shortcut: ShortcutKey = { key: "k", modifiers: { meta: true } };
			expect(formatShortcut(shortcut)).toBe("Meta + K");
		});

		it("should format key with multiple modifiers (Ctrl+Alt)", () => {
			const shortcut: ShortcutKey = {
				key: "x",
				modifiers: { ctrl: true, alt: true },
			};
			expect(formatShortcut(shortcut)).toBe("Ctrl + Alt + X");
		});

		it("should format key with all modifiers", () => {
			const shortcut: ShortcutKey = {
				key: "y",
				modifiers: { ctrl: true, alt: true, shift: true, meta: true },
			};
			expect(formatShortcut(shortcut)).toBe("Ctrl + Alt + Shift + Meta + Y");
		});

		it("should format non-letter keys like Enter", () => {
			const shortcut: ShortcutKey = { key: "Enter", modifiers: { ctrl: true } };
			expect(formatShortcut(shortcut)).toBe("Ctrl + Enter");
		});

		it("should format non-letter keys like /", () => {
			const shortcut: ShortcutKey = { key: "/", modifiers: { ctrl: true } };
			expect(formatShortcut(shortcut)).toBe("Ctrl + /");
		});

		it("should format non-letter keys like ArrowUp", () => {
			const shortcut: ShortcutKey = { key: "ArrowUp", modifiers: {} };
			expect(formatShortcut(shortcut)).toBe("ArrowUp");
		});

		it("should maintain modifier order (Ctrl, Alt, Shift, Meta)", () => {
			const shortcut: ShortcutKey = {
				key: "z",
				modifiers: { shift: true, ctrl: true, meta: true, alt: true },
			};
			expect(formatShortcut(shortcut)).toBe("Ctrl + Alt + Shift + Meta + Z");
		});
	});
});
