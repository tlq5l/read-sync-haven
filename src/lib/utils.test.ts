/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cn, isInputElement, shouldIgnoreShortcut } from "./utils";

// Mocking minimal Element-like objects for testing
const createMockElement = (
	tagName: string,
	contentEditable = "inherit",
): Partial<Element> => {
	// Return a plain object mimicking the necessary Element properties/methods
	return {
		tagName: tagName.toUpperCase(),
		hasAttribute: (attr: string) =>
			attr === "contenteditable" && contentEditable === "true",
		// Add other properties if needed by the functions under test
	};
};

describe("lib/utils", () => {
	describe("isInputElement", () => {
		it("should return true for <input> elements", () => {
			const inputEl = createMockElement("input");
			expect(isInputElement(inputEl as Element)).toBe(true);
		});

		it("should return true for <textarea> elements", () => {
			const textareaEl = createMockElement("textarea");
			expect(isInputElement(textareaEl as Element)).toBe(true);
		});

		it("should return true for <select> elements", () => {
			const selectEl = createMockElement("select");
			expect(isInputElement(selectEl as Element)).toBe(true);
		});

		it("should return true for elements with contenteditable='true'", () => {
			const editableDiv = createMockElement("div", "true");
			expect(isInputElement(editableDiv as Element)).toBe(true);
		});

		it("should return false for elements with contenteditable='false'", () => {
			const nonEditableDiv = createMockElement("div", "false");
			expect(isInputElement(nonEditableDiv as Element)).toBe(false);
		});

		it("should return false for elements with contenteditable='inherit' (or missing)", () => {
			const inheritEditableDiv = createMockElement("div");
			expect(isInputElement(inheritEditableDiv as Element)).toBe(false);
		});

		it("should return false for non-input elements like <div>", () => {
			const divEl = createMockElement("div");
			expect(isInputElement(divEl as Element)).toBe(false);
		});

		it("should return false for non-input elements like <button>", () => {
			const buttonEl = createMockElement("button");
			expect(isInputElement(buttonEl as Element)).toBe(false);
		});

		it("should return false for null input", () => {
			expect(isInputElement(null)).toBe(false);
		});
	});

	describe("shouldIgnoreShortcut", () => {
		// Helper to create mock KeyboardEvent
		const createMockEvent = (
			key: string,
			targetTagName: string,
			ctrlKey = false,
			altKey = false,
			shiftKey = false,
			targetContentEditable = "inherit",
		): Partial<KeyboardEvent> => {
			// Return Partial as we don't mock everything
			const target = createMockElement(
				targetTagName,
				targetContentEditable,
			) as Element; // Cast for the target property
			return {
				key,
				ctrlKey,
				altKey,
				shiftKey,
				target,
				// Mock preventDefault and stopPropagation if needed, but not required for this function
				preventDefault: vi.fn(),
				stopPropagation: vi.fn(),
			} as Partial<KeyboardEvent>;
		};

		// Mock document.activeElement using vi.spyOn
		const setActiveElement = (element: Partial<Element> | null) => {
			// Ensure global.document exists (jsdom should provide this, but let's be safe)
			if (typeof global.document === "undefined") {
				// @ts-ignore - Define document if it doesn't exist in the test env
				global.document = {};
			}
			vi.spyOn(global.document, "activeElement", "get").mockReturnValue(
				element as Element,
			); // Mock the getter
		};

		// Reset activeElement after each test in this suite
		afterEach(() => {
			vi.restoreAllMocks(); // Restore any spies after each test
		});

		it("should return true if event target is an input element", () => {
			const event = createMockEvent("a", "input");
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(true);
		});

		it("should return true if event target is a textarea element", () => {
			const event = createMockEvent("b", "textarea");
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(true);
		});

		it("should return true if event target is a select element", () => {
			const event = createMockEvent("c", "select");
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(true);
		});

		it("should return true if event target is contenteditable='true'", () => {
			const event = createMockEvent("d", "div", false, false, false, "true");
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(true);
		});

		it("should return false if event target is not an input element", () => {
			const event = createMockEvent("e", "div");
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
		});

		it("should return false if event target is a button", () => {
			const event = createMockEvent("f", "button");
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
		});

		// --- Tests for Ctrl + common edit keys ---
		const commonEditKeys = ["c", "v", "x", "a", "z"];

		for (const key of commonEditKeys) {
			it(`should return true for Ctrl+${key} when activeElement is an input`, () => {
				const inputEl = createMockElement("input");
				setActiveElement(inputEl);
				const event = createMockEvent(key, "div", true); // Target doesn't matter here, activeElement does
				expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(true);
			});

			it(`should return true for Ctrl+${key} when activeElement is contenteditable`, () => {
				const editableDiv = createMockElement("div", "true");
				setActiveElement(editableDiv);
				const event = createMockEvent(key, "div", true);
				expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(true);
			});

			it(`should return false for Ctrl+${key} when activeElement is NOT an input`, () => {
				const divEl = createMockElement("div");
				setActiveElement(divEl);
				const event = createMockEvent(key, "div", true);
				expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
			});

			it(`should return false for Ctrl+Shift+${key} even if activeElement is an input (modifier check)`, () => {
				const inputEl = createMockElement("input");
				setActiveElement(inputEl);
				const event = createMockEvent(key, "div", true, false, true);
				expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
			});

			it(`should return false for Ctrl+Alt+${key} even if activeElement is an input (modifier check)`, () => {
				const inputEl = createMockElement("input");
				setActiveElement(inputEl);
				const event = createMockEvent(key, "div", true, true, false);
				expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
			});
		}

		// --- Tests for other keys ---
		it("should return false for regular keys when target is not input", () => {
			const event = createMockEvent("k", "div");
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
		});

		it("should return false for Ctrl+OtherKey when target is not input", () => {
			const event = createMockEvent("k", "div", true);
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
		});

		it("should return false for Alt+Key when target is not input", () => {
			const event = createMockEvent("k", "div", false, true);
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
		});

		it("should return false for Shift+Key when target is not input", () => {
			const event = createMockEvent("k", "div", false, false, true);
			expect(shouldIgnoreShortcut(event as KeyboardEvent)).toBe(false);
		});
	});
});

describe("cn", () => {
	it("should concatenate basic strings", () => {
		expect(cn("a", "b", "c")).toBe("a b c");
	});

	it("should handle conditional classes (object syntax)", () => {
		expect(cn("a", { b: true, c: false, d: true })).toBe("a b d");
	});

	it("should handle conditional classes (array syntax)", () => {
		expect(cn("a", ["b", true && "c", false && "d"])).toBe("a b c");
	});

	it("should handle mixed types", () => {
		expect(cn("a", { b: true }, ["c", null, undefined, "d"], "e")).toBe(
			"a b c d e",
		);
	});

	it("should merge tailwind classes correctly (last one wins)", () => {
		expect(cn("p-4", "p-2")).toBe("p-2");
		expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
		expect(cn("bg-black", "p-4", "bg-white", "p-2")).toBe("bg-white p-2");
	});

	it("should handle null, undefined, and false values gracefully", () => {
		expect(cn("a", null, "b", undefined, false, "c")).toBe("a b c");
	});

	it("should handle empty inputs", () => {
		expect(cn()).toBe("");
		expect(cn("")).toBe("");
		expect(cn("", "", "")).toBe("");
	});

	it("should handle complex nested arrays and objects", () => {
		expect(
			cn("base", [
				"p-4",
				{ "m-2": true, "m-4": false },
				["text-red-500", undefined, { "font-bold": true }],
			]),
		).toBe("base p-4 m-2 text-red-500 font-bold");
	});
});
