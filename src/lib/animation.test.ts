/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"; // Add beforeEach
import {
	DURATION,
	EASING,
	applyHardwareAcceleration,
	applyMotionPreference,
	applyOptimizedTiming,
	clearHardwareAcceleration,
	prefersReducedMotion,
	setupGlobalAnimationTimings, // Add this import
} from "./animation";

// Store original matchMedia to restore later if needed, though vi.unstubAllGlobals handles it
// const originalMatchMedia = window.matchMedia;

describe("lib/animation", () => {
	// Mock window.matchMedia using spyOn
	const mockMatchMedia = (matches: boolean) => {
		// Ensure window object exists (should in jsdom)
		if (typeof window === "undefined") return;

		vi.spyOn(window, "matchMedia").mockImplementation(
			(query: string) =>
				({
					matches:
						query === "(prefers-reduced-motion: reduce)" ? matches : false,
					media: query,
					onchange: null,
					addListener: vi.fn(), // deprecated
					removeListener: vi.fn(), // deprecated
					addEventListener: vi.fn(),
					removeEventListener: vi.fn(),
					dispatchEvent: vi.fn(),
				}) as MediaQueryList,
		); // Add type assertion
	};

	// Restore mocks after each test
	afterEach(() => {
		vi.restoreAllMocks(); // Use restoreAllMocks instead of unstubAllGlobals
	});

	describe("prefersReducedMotion", () => {
		it("should return true when prefers-reduced-motion is reduce", () => {
			mockMatchMedia(true);
			expect(prefersReducedMotion()).toBe(true);
		});

		it("should return false when prefers-reduced-motion is no-preference", () => {
			mockMatchMedia(false);
			expect(prefersReducedMotion()).toBe(false);
		});

		it("should return false for other media queries", () => {
			// Mock matchMedia to return false for the specific query
			vi.stubGlobal("matchMedia", (query: string) => ({
				matches: false, // Specifically return false regardless of query for this test
				media: query,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			}));
			expect(prefersReducedMotion()).toBe(false);
		});
	});

	describe("applyHardwareAcceleration", () => {
		it("should apply transform and backface-visibility", () => {
			const element = document.createElement("div");
			applyHardwareAcceleration(element);
			expect(element.style.transform).toBe("translateZ(0)");
			expect(element.style.backfaceVisibility).toBe("hidden");
			expect(element.style.willChange).toBe(""); // Should not be set by default
		});

		it("should apply will-change when permanent is true", () => {
			const element = document.createElement("div");
			applyHardwareAcceleration(element, true);
			expect(element.style.transform).toBe("translateZ(0)");
			expect(element.style.backfaceVisibility).toBe("hidden");
			expect(element.style.willChange).toBe("transform, opacity");
		});

		it("should not throw if element is null", () => {
			expect(() =>
				applyHardwareAcceleration(null as unknown as HTMLElement),
			).not.toThrow();
		});
	});

	describe("clearHardwareAcceleration", () => {
		it("should remove will-change property", () => {
			const element = document.createElement("div");
			// Apply first to have something to clear
			applyHardwareAcceleration(element, true);
			expect(element.style.willChange).toBe("transform, opacity");

			clearHardwareAcceleration(element);
			expect(element.style.willChange).toBe("");
		});

		it("should not throw if element is null", () => {
			expect(() =>
				clearHardwareAcceleration(null as unknown as HTMLElement),
			).not.toThrow();
		});
	});

	describe("applyOptimizedTiming", () => {
		it("should apply default timing properties", () => {
			const element = document.createElement("div");
			applyOptimizedTiming(element);
			expect(element.style.transitionProperty).toBe("all");
			expect(element.style.transitionDuration).toBe(`${DURATION.normal}ms`);
			expect(element.style.transitionTimingFunction).toBe(EASING.standard);
		});

		it("should apply specified timing properties", () => {
			const element = document.createElement("div");
			applyOptimizedTiming(
				element,
				"opacity",
				DURATION.fast,
				EASING.accelerate,
			);
			expect(element.style.transitionProperty).toBe("opacity");
			expect(element.style.transitionDuration).toBe(`${DURATION.fast}ms`);
			expect(element.style.transitionTimingFunction).toBe(EASING.accelerate);
		});

		it("should not throw if element is null", () => {
			expect(() =>
				applyOptimizedTiming(null as unknown as HTMLElement),
			).not.toThrow();
		});
	});

	describe("applyMotionPreference", () => {
		it("should apply reduced motion styles if prefersReducedMotion is true", () => {
			mockMatchMedia(true); // Mock prefers-reduced-motion: reduce
			const element = document.createElement("div");
			applyMotionPreference(element);
			expect(element.style.transitionDuration).toBe("0.01ms");
			expect(element.style.animationDuration).toBe("0.01ms");
			expect(element.style.animationIterationCount).toBe("1");
		});

		it("should not apply reduced motion styles if prefersReducedMotion is false", () => {
			mockMatchMedia(false); // Mock prefers-reduced-motion: no-preference
			const element = document.createElement("div");
			// Set some initial values to ensure they are not overwritten
			element.style.transitionDuration = "500ms";
			element.style.animationDuration = "1000ms";
			element.style.animationIterationCount = "infinite";

			applyMotionPreference(element);
			expect(element.style.transitionDuration).toBe("500ms"); // Should remain unchanged
			expect(element.style.animationDuration).toBe("1000ms"); // Should remain unchanged
			expect(element.style.animationIterationCount).toBe("infinite"); // Should remain unchanged
		});

		it("should not throw if element is null", () => {
			mockMatchMedia(true); // Set preference just in case
			expect(() =>
				applyMotionPreference(null as unknown as HTMLElement),
			).not.toThrow();
		});
	});

	describe("setupGlobalAnimationTimings", () => {
		// Helper to check root style properties
		const checkRootStyle = (property: string, expectedValue: string | null) => {
			expect(document.documentElement.style.getPropertyValue(property)).toBe(
				expectedValue ?? "",
			);
		};

		// Clear styles before each test in this suite
		beforeEach(() => {
			document.documentElement.removeAttribute("style");
		});

		it("should set standard animation variables when motion is not reduced", () => {
			mockMatchMedia(false); // prefersReducedMotion returns false
			setupGlobalAnimationTimings();

			checkRootStyle("--animation-duration-fast", `${DURATION.fast}ms`);
			checkRootStyle("--animation-duration-normal", `${DURATION.normal}ms`);
			checkRootStyle("--animation-duration-slow", `${DURATION.slow}ms`);
			checkRootStyle("--animation-timing-function-standard", EASING.standard);
			checkRootStyle(
				"--animation-timing-function-accelerate",
				EASING.accelerate,
			);
			checkRootStyle(
				"--animation-timing-function-decelerate",
				EASING.decelerate,
			);
		});

		it("should set reduced motion animation variables when motion is reduced", () => {
			mockMatchMedia(true); // prefersReducedMotion returns true
			setupGlobalAnimationTimings();

			checkRootStyle("--animation-duration-fast", "0.01ms");
			checkRootStyle("--animation-duration-normal", "0.01ms");
			checkRootStyle("--animation-duration-slow", "0.01ms");

			// Timing functions might still be set, or might be cleared/ignored by browser
			// Let's check they are NOT set to the standard ones if reduced motion is on
			// Depending on implementation, they might be unset or set to something else.
			// For this test, let's assume the function *only* sets durations when reduced.
			// If the function *also* clears timing functions, adjust the test.
			// Update: The function *only* sets durations when reduced, so timing functions remain unset.
			checkRootStyle("--animation-timing-function-standard", null);
			checkRootStyle("--animation-timing-function-accelerate", null);
			checkRootStyle("--animation-timing-function-decelerate", null);
		});
	});

	// TODO: Add tests for syncAnimateElements, batchAnimate, createAnimationFrame
});
