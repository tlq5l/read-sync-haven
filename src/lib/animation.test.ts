// Removed /** @vitest-environment jsdom */ to rely on vitest.config.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"; // Add beforeEach
import {
	DURATION,
	EASING,
	applyHardwareAcceleration,
	applyMotionPreference,
	applyOptimizedTiming,
	batchAnimate, // Sorted
	clearHardwareAcceleration, // Sorted
	createAnimationFrame, // Sorted
	prefersReducedMotion, // Sorted
	setupGlobalAnimationTimings, // Sorted
	syncAnimateElements, // Sorted
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
			// Replace stubGlobal with spyOn for consistency
			vi.spyOn(window, "matchMedia").mockImplementation(
				(query: string) =>
					({
						matches: false, // Specifically return false regardless of query for this test
						media: query,
						onchange: null,
						addListener: vi.fn(),
						removeListener: vi.fn(),
						addEventListener: vi.fn(),
						removeEventListener: vi.fn(),
						dispatchEvent: vi.fn(),
					}) as MediaQueryList,
			);
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

	describe("syncAnimateElements", () => {
		beforeEach(() => {
			vi.useFakeTimers(); // Use fake timers for setTimeout and RAF
		});

		afterEach(() => {
			vi.useRealTimers(); // Restore real timers
		});

		it("should not throw if elements array is empty", () => {
			expect(() => syncAnimateElements([])).not.toThrow();
		});

		it("should apply will-change immediately and remove it after duration", () => {
			const el1 = document.createElement("div");
			const el2 = document.createElement("div");
			const elements = [el1, el2];
			const duration = DURATION.fast;

			syncAnimateElements(elements, "opacity", duration);

			// Check will-change is applied immediately (before RAF/setTimeout)
			expect(el1.style.willChange).toBe("transform, opacity");
			expect(el2.style.willChange).toBe("transform, opacity");

			// Fast-forward timers past the animation duration + buffer
			vi.advanceTimersByTime(duration + 100);

			// Check will-change is removed
			expect(el1.style.willChange).toBe("");
			expect(el2.style.willChange).toBe("");
		});

		it("should apply transition properties after double RAF", () => {
			const el1 = document.createElement("div");
			const elements = [el1];
			const duration = DURATION.slow;
			const easing = EASING.bounce;
			const property = "transform";

			syncAnimateElements(elements, property, duration, easing);

			// Properties should NOT be set immediately
			expect(el1.style.transitionProperty).toBe("");
			expect(el1.style.transitionDuration).toBe("");
			expect(el1.style.transitionTimingFunction).toBe("");

			// Run pending timers to execute RAF callbacks
			vi.runOnlyPendingTimers(); // Execute first RAF
			vi.runOnlyPendingTimers(); // Execute second RAF

			// Now properties should be set
			expect(el1.style.transitionProperty).toBe(property);
			expect(el1.style.transitionDuration).toBe(`${duration}ms`);
			expect(el1.style.transitionTimingFunction).toBe(easing);
			expect(el1.style.transitionDelay).toBe(""); // No stagger
		});

		it("should apply stagger delays correctly", () => {
			const el1 = document.createElement("div");
			const el2 = document.createElement("div");
			const el3 = document.createElement("div");
			const elements = [el1, el2, el3];
			const staggerMs = 50;

			syncAnimateElements(
				elements,
				"all",
				DURATION.normal,
				EASING.standard,
				staggerMs,
			);

			// Run pending timers to execute RAF callbacks
			vi.runOnlyPendingTimers(); // Execute first RAF
			vi.runOnlyPendingTimers(); // Execute second RAF

			expect(el1.style.transitionDelay).toBe(""); // First element has no delay
			expect(el2.style.transitionDelay).toBe(`${staggerMs}ms`);
			expect(el3.style.transitionDelay).toBe(`${staggerMs * 2}ms`);

			// Fast-forward past the total animation time to check cleanup
			const totalDuration = DURATION.normal + staggerMs * (elements.length - 1);
			vi.advanceTimersByTime(totalDuration + 100);
			expect(el1.style.willChange).toBe("");
			expect(el2.style.willChange).toBe("");
			expect(el3.style.willChange).toBe("");
		});
	});

	describe("batchAnimate", () => {
		beforeEach(() => {
			vi.useFakeTimers();
			// Mock getComputedStyle as it's used internally by batchAnimate
			vi.spyOn(window, "getComputedStyle").mockImplementation(
				(
					_elt: Element, // Prefix unused parameter with _
				) =>
					({
						transitionDuration: `${DURATION.normal}s`, // Return seconds string
						getPropertyValue: (prop: string) => {
							if (prop === "transition-duration") {
								return `${DURATION.normal / 1000}s`; // Return seconds string
							}
							return "";
						},
					}) as CSSStyleDeclaration, // Type assertion
			);
		});

		afterEach(() => {
			vi.useRealTimers();
			vi.restoreAllMocks(); // Restore getComputedStyle mock
		});

		it("should not throw if elements array is empty", () => {
			expect(() => batchAnimate("test-class", [])).not.toThrow();
		});

		it("should apply class to elements after delay and RAF", () => {
			const el1 = document.createElement("div");
			const el2 = document.createElement("div");
			const elements = [el1, el2];
			const className = "fade-in";
			const delayMs = 100;

			batchAnimate(className, elements, delayMs);

			// Class should not be applied immediately or after delay only
			expect(el1.classList.contains(className)).toBe(false);
			vi.advanceTimersByTime(delayMs);
			expect(el1.classList.contains(className)).toBe(false);

			// Run RAF timers
			vi.runOnlyPendingTimers(); // setTimeout's RAF
			vi.runOnlyPendingTimers(); // Inner RAF

			// Class should now be applied
			expect(el1.classList.contains(className)).toBe(true);
			expect(el2.classList.contains(className)).toBe(true);
		});

		it("should apply will-change immediately and remove it after animation", () => {
			const el1 = document.createElement("div");
			const elements = [el1];
			const className = "slide-up";
			// const estimatedDuration = DURATION.normal; // Unused variable removed

			batchAnimate(className, elements);

			// Check will-change applied immediately
			expect(el1.style.willChange).toBe("transform, opacity");

			// Run all timers: initial delay setTimeout -> RAF -> RAF -> cleanup setTimeout
			vi.runAllTimers();

			// Check will-change is removed (assuming cleanup runs)
			// Note: The cleanup logic inside batchAnimate relies on getComputedStyle
			// which we mocked.
			expect(el1.style.willChange).toBe("");
		});

		it("should call cleanup function after animation", () => {
			const el1 = document.createElement("div");
			const elements = [el1];
			const className = "pop-in";
			const cleanupMock = vi.fn();
			// const estimatedDuration = DURATION.normal; // Unused variable removed

			batchAnimate(className, elements, 0, cleanupMock);

			// Run all timers: initial delay setTimeout -> RAF -> RAF -> cleanup setTimeout
			vi.runAllTimers();

			// Cleanup should have been called
			expect(cleanupMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("createAnimationFrame", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should schedule a callback using double requestAnimationFrame", () => {
			const coordinator = createAnimationFrame();
			const callback = vi.fn();

			coordinator.schedule(callback);

			// Callback should not run immediately
			expect(callback).not.toHaveBeenCalled();

			// Run first RAF
			vi.runOnlyPendingTimers();
			expect(callback).not.toHaveBeenCalled();

			// Run second RAF
			vi.runOnlyPendingTimers();
			expect(callback).toHaveBeenCalledTimes(1);
		});

		it("should cancel a scheduled callback", () => {
			const coordinator = createAnimationFrame();
			const callback = vi.fn();

			coordinator.schedule(callback);
			coordinator.cancel();

			// Run timers - callback should not execute
			vi.runAllTimers();
			expect(callback).not.toHaveBeenCalled();
		});

		it("should cancel the previous callback if schedule is called again", () => {
			const coordinator = createAnimationFrame();
			const callback1 = vi.fn();
			const callback2 = vi.fn();

			coordinator.schedule(callback1);
			coordinator.schedule(callback2); // This should cancel callback1

			// Run timers
			vi.runAllTimers();

			expect(callback1).not.toHaveBeenCalled();
			expect(callback2).toHaveBeenCalledTimes(1);
		});

		it("cancel should do nothing if no callback is scheduled", () => {
			const coordinator = createAnimationFrame();
			expect(() => coordinator.cancel()).not.toThrow();
		});
	});
});
