import { act, renderHook } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./ThemeContext";

// Helper component to use the hook
const HookWrapper = ({ children }: { children: React.ReactNode }) => (
	<ThemeProvider>{children}</ThemeProvider>
);

describe("ThemeContext", () => {
	const originalLocalStorage = window.localStorage;
	let localStorageMock: Record<string, string>;

	beforeEach(() => {
		// Mock localStorage
		localStorageMock = {};
		Object.defineProperty(window, "localStorage", {
			value: {
				getItem: vi.fn((key) => localStorageMock[key] || null),
				setItem: vi.fn((key, value) => {
					localStorageMock[key] = value;
				}),
				removeItem: vi.fn((key) => {
					delete localStorageMock[key];
				}),
				clear: vi.fn(() => {
					localStorageMock = {};
				}),
				length: 0, // Add length property
				key: vi.fn(), // Add key method if needed
			},
			writable: true,
		});

		// Mock matchMedia
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: vi.fn().mockImplementation((query) => ({
				matches: query === "(prefers-color-scheme: dark)", // Simulate dark mode based on query
				media: query,
				onchange: null,
				addListener: vi.fn(), // Deprecated but included for completeness
				removeListener: vi.fn(), // Deprecated but included for completeness
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});

		// Reset documentElement attributes
		document.documentElement.removeAttribute("class");
		document.documentElement.removeAttribute("data-text-size");
	});

	afterEach(() => {
		// Restore original localStorage and matchMedia
		Object.defineProperty(window, "localStorage", {
			value: originalLocalStorage,
			writable: true,
		});
		vi.restoreAllMocks(); // Restore matchMedia mock
		// Clean up documentElement attributes again just in case
		document.documentElement.removeAttribute("class");
		document.documentElement.removeAttribute("data-text-size");
	});

	// --- Theme Tests ---

	it("initializes with default theme 'system'", () => {
		const { result } = renderHook(() => useTheme(), { wrapper: HookWrapper });
		expect(result.current.theme).toBe("system");
		// Check if class is applied based on system preference (mocked as dark)
		expect(document.documentElement.classList.contains("dark")).toBe(true);
	});

	it("initializes with theme from localStorage", () => {
		localStorageMock["bondwise-ui-theme"] = "light";
		const { result } = renderHook(() => useTheme(), { wrapper: HookWrapper });
		expect(result.current.theme).toBe("light");
		expect(document.documentElement.classList.contains("light")).toBe(true);
	});

	it("updates theme and localStorage when setTheme is called", () => {
		const { result } = renderHook(() => useTheme(), { wrapper: HookWrapper });

		act(() => {
			result.current.setTheme("dark");
		});

		expect(result.current.theme).toBe("dark");
		expect(localStorageMock["bondwise-ui-theme"]).toBe("dark");
		expect(document.documentElement.classList.contains("dark")).toBe(true);
		expect(document.documentElement.classList.contains("light")).toBe(false);
	});

	it("applies system theme correctly", () => {
		// Mock system preference to light
		vi.mocked(window.matchMedia).mockImplementation((query) => ({
			matches: false, // Simulate light mode
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));

		const { result } = renderHook(() => useTheme(), { wrapper: HookWrapper });
		expect(result.current.theme).toBe("system");
		expect(document.documentElement.classList.contains("light")).toBe(true);
	});

	// --- Text Size Tests ---

	it("initializes with default text size 3", () => {
		const { result } = renderHook(() => useTheme(), { wrapper: HookWrapper });
		expect(result.current.textSize).toBe(3);
		expect(document.documentElement.getAttribute("data-text-size")).toBe("3");
	});

	it("initializes with text size from localStorage", () => {
		localStorageMock["bondwise-ui-text-size"] = "5";
		const { result } = renderHook(() => useTheme(), { wrapper: HookWrapper });
		expect(result.current.textSize).toBe(5);
		expect(document.documentElement.getAttribute("data-text-size")).toBe("5");
	});

	it("updates text size and localStorage when setTextSize is called", () => {
		const { result } = renderHook(() => useTheme(), { wrapper: HookWrapper });

		act(() => {
			result.current.setTextSize(1);
		});

		expect(result.current.textSize).toBe(1);
		expect(localStorageMock["bondwise-ui-text-size"]).toBe("1");
		expect(document.documentElement.getAttribute("data-text-size")).toBe("1");

		act(() => {
			result.current.setTextSize(4);
		});

		expect(result.current.textSize).toBe(4);
		expect(localStorageMock["bondwise-ui-text-size"]).toBe("4");
		expect(document.documentElement.getAttribute("data-text-size")).toBe("4");
	});

	it("handles invalid text size from localStorage by using default", () => {
		localStorageMock["bondwise-ui-text-size"] = "invalid"; // or "0" or "6"
		const { result } = renderHook(() => useTheme(), { wrapper: HookWrapper });
		// The hook logic currently uses Number() which results in NaN for "invalid",
		// then || defaultTextSize kicks in. For "0" or "6", it would initially set that,
		// but the type safety should prevent invalid values later.
		// Let's test the default fallback.
		expect(result.current.textSize).toBe(3);
		expect(document.documentElement.getAttribute("data-text-size")).toBe("3");
	});
});
