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

// Mock window.matchMedia for JSDOM environment (used by ThemeProvider)
Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		// Add type for query
		matches: false, // Default to light mode for tests
		media: query,
		onchange: null,
		addListener: vi.fn(), // Deprecated but may be called
		removeListener: vi.fn(), // Deprecated but may be called
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

// Add any other global setup logic here if needed.
