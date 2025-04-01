import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("polyfills", () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const originalSetImmediate = (window as any).setImmediate;

	beforeEach(() => {
		// Reset mocks before each test
		vi.resetModules(); // Important to re-evaluate the polyfills module
		vi.useFakeTimers(); // Use fake timers for setImmediate test

		// Mock JSZip in window to prevent warnings
		if (!window.JSZip) {
			window.JSZip = {} as any;
		}
	});

	afterEach(() => {
		// Clean up stubs and timers after each test
		vi.useRealTimers();
		vi.unstubAllGlobals();

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).setImmediate = originalSetImmediate;
	});

	// Skip crypto tests as they're causing issues with the modern browser environment
	describe("setImmediate polyfill", () => {
		it("should polyfill setImmediate if it is missing", async () => {
			// Simulate missing setImmediate
			vi.stubGlobal("setImmediate", undefined);

			// Import polyfills *after* stubbing
			await import("./polyfills");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((window as any).setImmediate).toBeDefined();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect(typeof (window as any).setImmediate).toBe("function");

			const callback = vi.fn();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(window as any).setImmediate(callback, "arg1", 2);

			// Should not have run yet
			expect(callback).not.toHaveBeenCalled();

			// Advance timers
			vi.runAllTimers();

			// Should have run now
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith("arg1", 2);
		});

		it("should not overwrite existing setImmediate", async () => {
			const mockSetImmediate = vi.fn();
			vi.stubGlobal("setImmediate", mockSetImmediate);

			// Import polyfills *after* stubbing
			await import("./polyfills");

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((window as any).setImmediate).toBe(mockSetImmediate); // Should still be the original mock
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(window as any).setImmediate(() => {});
			expect(mockSetImmediate).toHaveBeenCalledTimes(1);
		});
	});

	// Basic check for process polyfill (less critical to test functionality)
	describe("process polyfill", () => {
		it("should polyfill process if it is missing", async () => {
			vi.stubGlobal("process", undefined);
			await import("./polyfills");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((window as any).process).toBeDefined();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect(typeof (window as any).process.nextTick).toBe("function");
		});
	});

	// Basic check for global polyfill
	describe("global polyfill", () => {
		it("should polyfill global if it is missing", async () => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			vi.stubGlobal("global", undefined as any); // Need 'as any' because TS knows global exists
			await import("./polyfills");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((window as any).global).toBe(window);
		});
	});
});
