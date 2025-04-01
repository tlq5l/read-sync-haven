import * as matchers from "@testing-library/jest-dom/matchers";
// src/setupTests.ts
import { expect, vi } from "vitest"; // Import vi
// import { expect } from "vitest"; // Removed duplicate import

// Ensure process.listeners exists for Vitest's error handlers
if (typeof process !== "undefined" && typeof process.listeners !== "function") {
	process.listeners = () => [];
}

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock window.matchMedia more robustly for JSDOM
// See: https://jestjs.io/docs/manual-mocks#mocking-methods-which-are-not-implemented-in-jsdom
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: (query: string): MediaQueryList => ({
		matches: query === "(prefers-color-scheme: dark)", // Make it respond to the specific query
		media: query,
		onchange: null,
		addListener: vi.fn(), // Deprecated
		removeListener: vi.fn(), // Deprecated
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	}),
});

// Add any other global setup logic here if needed.
