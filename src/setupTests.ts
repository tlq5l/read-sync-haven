// src/setupTests.ts
import * as matchers from "@testing-library/jest-dom/matchers";
import { expect, vi } from "vitest"; // Import vi
import "fake-indexeddb/auto"; // Mock IndexedDB for tests
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

// Mock DOMMatrix for JSDOM environment
// Based on https://developer.mozilla.org/en-US/docs/Web/API/DOMMatrix
if (typeof global.DOMMatrix === "undefined") {
	global.DOMMatrix = class DOMMatrixMock {
		// Renamed to avoid confusion in scope
		m11: number;
		m12: number;
		m13: number;
		m14: number;
		m21: number;
		m22: number;
		m23: number;
		m24: number;
		m31: number;
		m32: number;
		m33: number;
		m34: number;
		m41: number;
		m42: number;
		m43: number;
		m44: number;
		is2D: boolean;
		isIdentity: boolean;

		// Add 2D properties for compatibility
		get a() {
			return this.m11;
		}
		set a(val) {
			this.m11 = val;
		}
		get b() {
			return this.m12;
		}
		set b(val) {
			this.m12 = val;
		}
		get c() {
			return this.m21;
		}
		set c(val) {
			this.m21 = val;
		}
		get d() {
			return this.m22;
		}
		set d(val) {
			this.m22 = val;
		}
		get e() {
			return this.m41;
		}
		set e(val) {
			this.m41 = val;
		}
		get f() {
			return this.m42;
		}
		set f(val) {
			this.m42 = val;
		}

		// Add missing static methods to satisfy TypeScript interface
		static fromFloat32Array = vi
			.fn()
			.mockImplementation((_array32: Float32Array) => new DOMMatrix());
		static fromFloat64Array = vi
			.fn()
			.mockImplementation((_array64: Float64Array) => new DOMMatrix());
		static fromMatrix = vi
			.fn()
			.mockImplementation((_other?: any) => new DOMMatrix());

		constructor(init?: number[] | string) {
			// Simplified identity matrix for mocking purposes
			this.m11 = 1;
			this.m12 = 0;
			this.m13 = 0;
			this.m14 = 0;
			this.m21 = 0;
			this.m22 = 1;
			this.m23 = 0;
			this.m24 = 0;
			this.m31 = 0;
			this.m32 = 0;
			this.m33 = 1;
			this.m34 = 0;
			this.m41 = 0;
			this.m42 = 0;
			this.m43 = 0;
			this.m44 = 1;
			this.is2D = true; // Assume 2D for simplicity
			this.isIdentity = true; // Assume identity

			// Basic parsing if needed (very simplified)
			if (typeof init === "string") {
				// TODO: Implement basic string parsing if required by tests
			} else if (Array.isArray(init)) {
				// TODO: Implement array initialization if required by tests
				if (init.length === 6) {
					// 2D matrix elements
					this.m11 = init[0];
					this.m12 = init[1];
					this.m21 = init[2];
					this.m22 = init[3];
					this.m41 = init[4];
					this.m42 = init[5];
					this.isIdentity = false; // Assume not identity if initialized
				} else if (init.length === 16) {
					// 3D matrix elements
					// Assign all 16 if needed
					this.is2D = false;
					this.isIdentity = false;
				}
			}
		}

		// Add common methods as needed, potentially mocked with vi.fn()
		translateSelf = vi.fn().mockReturnThis();
		scaleSelf = vi.fn().mockReturnThis();
		rotateSelf = vi.fn().mockReturnThis();
		multiplySelf = vi.fn().mockReturnThis();
		invertSelf = vi.fn().mockReturnThis();
		// Add non-modifying versions too if needed by tests
		translate = vi.fn().mockImplementation(() => new DOMMatrixMock());
		scale = vi.fn().mockImplementation(() => new DOMMatrixMock());
		rotate = vi.fn().mockImplementation(() => new DOMMatrixMock());
		multiply = vi.fn().mockImplementation(() => new DOMMatrixMock());
		invert = vi.fn().mockImplementation(() => new DOMMatrixMock());
		transformPoint = vi
			.fn()
			.mockImplementation((p: { x: number; y: number }) => ({
				x: p.x,
				y: p.y,
			})); // Basic identity transform
		toFloat32Array = vi
			.fn()
			.mockImplementation(() => new Float32Array(16).fill(0));
		toFloat64Array = vi
			.fn()
			.mockImplementation(() => new Float64Array(16).fill(0));
		toJSON = vi.fn().mockImplementation(() => ({
			/* simplified JSON */
		}));
	} as any; // Use type assertion to bypass strict prototype checks
}

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
