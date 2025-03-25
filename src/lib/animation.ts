/**
 * Animation utilities to improve performance and smoothness
 */

// Unused constant removed

const WILL_CHANGE_PROPERTIES = ["transform", "opacity"];

// Key performance optimizations:
// 1. Use transform and opacity for animations (most performant)
// 2. Use will-change property sparingly and only during animation
// 3. Force GPU rendering with translateZ(0)
// 4. Batch animations with requestAnimationFrame
// 5. Clean up hardware acceleration when not needed

/**
 * Apply hardware acceleration to an element
 * @param element - DOM element to optimize
 * @param permanent - Whether to keep will-change (use sparingly)
 */
export function applyHardwareAcceleration(
	element: HTMLElement,
	permanent = false,
): void {
	if (!element) return;

	// Apply CSS transform to force GPU rendering
	element.style.setProperty("transform", "translateZ(0)");

	// Only set will-change if animation is imminent or permanent
	// Overusing will-change can harm performance
	if (permanent) {
		element.style.setProperty("will-change", WILL_CHANGE_PROPERTIES.join(", "));
	}

	// Other optimization properties
	element.style.setProperty("backface-visibility", "hidden");
}

/**
 * Clear hardware acceleration settings
 * Should be called when animations complete to free up GPU resources
 * @param element - DOM element to clean up
 */
export function clearHardwareAcceleration(element: HTMLElement): void {
	if (!element) return;

	// Clear will-change to release resources
	element.style.removeProperty("will-change");
}

/**
 * Time conversion helpers - standardized for the entire app
 * Reduced from the original to create more consistency
 */
export const DURATION = {
	fast: 150, // ms
	normal: 200, // ms - reduced from 250ms for snappier transitions
	slow: 300, // ms - reduced from 400ms for better synchronization
};

/**
 * Easing functions - standardized for the entire app
 */
export const EASING = {
	// Material Design inspired easings
	standard: "cubic-bezier(0.4, 0.0, 0.2, 1)", // Default for most transitions
	accelerate: "cubic-bezier(0.4, 0.0, 1.0, 1.0)", // For elements exiting the screen
	decelerate: "cubic-bezier(0.0, 0.0, 0.2, 1.0)", // For elements entering the screen
	// Spring-like motion
	bounce: "cubic-bezier(0.175, 0.885, 0.32, 1.275)", // For attention-grabbing elements
};

/**
 * Apply preferred timing for better animations
 * @param element - DOM element to optimize
 * @param property - CSS property to animate
 * @param duration - Duration in ms
 * @param easing - Easing function
 */
export function applyOptimizedTiming(
	element: HTMLElement,
	property = "all",
	duration = DURATION.normal,
	easing = EASING.standard,
): void {
	if (!element) return;

	element.style.setProperty("transition-property", property);
	element.style.setProperty("transition-duration", `${duration}ms`);
	element.style.setProperty("transition-timing-function", easing);
}

/**
 * Check if the browser supports motion reduction
 */
export function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Apply reduced motion settings if user prefers it
 * @param element - DOM element to adjust
 */
export function applyMotionPreference(element: HTMLElement): void {
	if (prefersReducedMotion() && element) {
		element.style.setProperty("transition-duration", "0.01ms");
		element.style.setProperty("animation-duration", "0.01ms");
		element.style.setProperty("animation-iteration-count", "1");
	}
}

/**
 * Sync multiple elements to animate together with optimized performance
 * @param elements - Array of DOM elements to synchronize
 * @param property - CSS property to animate
 * @param duration - Duration in ms
 * @param easing - Easing function
 * @param staggerMs - Optional stagger time between animations in ms
 */
export function syncAnimateElements(
	elements: HTMLElement[],
	property = "all",
	duration = DURATION.normal,
	easing = EASING.standard,
	staggerMs = 0,
): void {
	if (!elements.length) return;

	// Step 1: Prepare all elements before animation
	for (const element of elements) {
		// Temporarily add will-change for the animation duration
		element.style.setProperty("will-change", WILL_CHANGE_PROPERTIES.join(", "));
	}

	// Step 2: Force a reflow to ensure transitions happen together
	const forceReflow = () => {
		for (const el of elements) {
			el.offsetHeight;
		}
	};
	forceReflow();

	// Step 3: Use requestAnimationFrame for better timing
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			elements.forEach((element, index) => {
				// Either stagger animations or sync them
				const delay = staggerMs > 0 ? staggerMs * index : 0;

				// Apply the optimized timing with delay if needed
				element.style.setProperty("transition-property", property);
				element.style.setProperty("transition-duration", `${duration}ms`);
				element.style.setProperty("transition-timing-function", easing);

				if (delay > 0) {
					element.style.setProperty("transition-delay", `${delay}ms`);
				}
			});

			// Apply the actual styles that will trigger the transitions
			// This will be implemented in the caller function
		});
	});

	// Step 4: Clean up hardware acceleration after animation completes
	const totalDuration = duration + staggerMs * (elements.length - 1);
	setTimeout(() => {
		for (const element of elements) {
			// Clear will-change after animation completes
			element.style.removeProperty("will-change");
		}
	}, totalDuration + 50); // Add a little buffer
}

/**
 * Create a class-based animation that ensures all elements animate together
 * @param className - The CSS class that triggers the animation
 * @param elements - DOM elements to animate together
 * @param delayMs - Optional delay before applying classes
 * @param cleanup - Optional function to run after animation
 */
export function batchAnimate(
	className: string,
	elements: HTMLElement[],
	delayMs = 0,
	cleanup?: () => void,
): void {
	if (!elements.length) return;

	// Prepare elements for animation
	for (const el of elements) {
		// Temporarily set will-change
		el.style.setProperty("will-change", WILL_CHANGE_PROPERTIES.join(", "));
	}

	// Force layout recalculation
	for (const el of elements) {
		el.offsetHeight;
	}

	// Wait for next frame to ensure batch processing
	setTimeout(() => {
		requestAnimationFrame(() => {
			// Double RAF for more reliable synchronization
			requestAnimationFrame(() => {
				for (const el of elements) {
					el.classList.add(className);
				}

				// Clean up after animation completes
				if (cleanup) {
					// Estimate animation duration from CSS (or use default)
					const styles = window.getComputedStyle(elements[0]);
					const duration =
						parseFloat(styles.transitionDuration) * 1000 || DURATION.normal;

					setTimeout(() => {
						for (const el of elements) {
							el.style.removeProperty("will-change");
						}
						cleanup();
					}, duration + 50);
				}
			});
		});
	}, delayMs);
}

/**
 * Apply consistent transition timing to all animated elements in the app
 * Call this once on app initialization
 */
export function setupGlobalAnimationTimings(): void {
	// Define transition elements
	const root = document.documentElement;

	// Only apply if motion is not reduced
	if (!prefersReducedMotion()) {
		root.style.setProperty("--animation-duration-fast", `${DURATION.fast}ms`);
		root.style.setProperty(
			"--animation-duration-normal",
			`${DURATION.normal}ms`,
		);
		root.style.setProperty("--animation-duration-slow", `${DURATION.slow}ms`);
		root.style.setProperty(
			"--animation-timing-function-standard",
			EASING.standard,
		);
		root.style.setProperty(
			"--animation-timing-function-accelerate",
			EASING.accelerate,
		);
		root.style.setProperty(
			"--animation-timing-function-decelerate",
			EASING.decelerate,
		);
	} else {
		// Apply reduced motion values
		root.style.setProperty("--animation-duration-fast", "0.01ms");
		root.style.setProperty("--animation-duration-normal", "0.01ms");
		root.style.setProperty("--animation-duration-slow", "0.01ms");
	}
}

/**
 * RAF-based animation coordinator for synchronizing animations
 * @returns A function that when called will synchronize multiple animations
 */
export function createAnimationFrame() {
	let frameId: number | null = null;

	return {
		/**
		 * Schedule an animation to run on the next animation frame
		 * @param callback Function to run on next animation frame
		 */
		schedule: (callback: () => void) => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
			}

			// Use double requestAnimationFrame for better synchronization
			frameId = requestAnimationFrame(() => {
				frameId = requestAnimationFrame(() => {
					callback();
					frameId = null;
				});
			});
		},

		/**
		 * Cancel the scheduled animation frame
		 */
		cancel: () => {
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
				frameId = null;
			}
		},
	};
}
