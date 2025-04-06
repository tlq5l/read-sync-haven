import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";
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

	// --- Text Size Tests Removed (Feature Removed) ---
});
