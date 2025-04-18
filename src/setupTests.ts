// src/setupTests.ts
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect, vi } from "vitest"; // Import vi

// Polyfill EventTarget for JSDOM environment if it's missing
if (typeof global.EventTarget === "undefined") {
	// A simple polyfill or assign from a known source if available
	// For basic cases, assigning Event might work if Event itself exists
	// Or use a more robust polyfill if needed
	// Example: global.EventTarget = require('event-target-shim'); // If using a shim
	// For now, let's try assigning Event if it exists, otherwise a basic object
	global.EventTarget =
		typeof Event !== "undefined"
			? EventTarget // Assign the EventTarget constructor directly
			: class EventTargetShim {
					addEventListener() {}
					removeEventListener() {}
					dispatchEvent() {
						return true;
					}
				};
}

// // Ensure process.listeners exists for Vitest's error handlers - Removed as it might cause issues
// if (typeof process !== "undefined" && typeof process.listeners !== "function") {
// 	process.listeners = () => [];
// }

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

// Mock ResizeObserver more robustly
global.ResizeObserver = class ResizeObserver {
	callback: ResizeObserverCallback;
	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
	}
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
};

// Add any other global setup logic here if needed.

import { afterAll, afterEach, beforeAll } from "vitest";
// MSW Setup
import { server } from "./mocks/server"; // Import the server instance

// Establish API mocking before all tests.
beforeAll(() => server.listen({ onUnhandledRequest: "error" })); // Error on unhandled requests

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => server.resetHandlers());

// Clean up after the tests are finished.
afterAll(() => server.close());
