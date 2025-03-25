import { useAnimation } from "@/context/AnimationContext";
import { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";

interface UseAnimationSyncOptions {
	/**
	 * Animation priority (lower numbers animate first)
	 */
	priority?: number;

	/**
	 * Whether to automatically start the animation on mount
	 */
	autoStart?: boolean;

	/**
	 * Duration of the animation in milliseconds
	 */
	duration?: number;

	/**
	 * Whether to participate in synchronized animations
	 */
	synchronized?: boolean;
}

/**
 * Hook to synchronize animations across components
 */
export function useAnimationSync(options: UseAnimationSyncOptions = {}) {
	const {
		priority = 0,
		autoStart = true,
		duration = 250,
		synchronized = true,
	} = options;

	const animation = useAnimation();
	// Create local variables for missing properties to avoid TS errors
	const syncAnimations = animation.synchronizeAnimations;
	// Using empty functions with underscore prefixed parameters to avoid unused parameter warnings
	const registerComponent = (_id: string, _priority: number) => {};
	const unregisterComponent = (_id: string) => {};
	const reducedMotion = false;
	const [isAnimating, setIsAnimating] = useState(false);
	const [hasAnimated, setHasAnimated] = useState(false);
	const componentId = useRef(uuidv4());
	const elementRef = useRef<HTMLElement | null>(null);

	// Register this component for synchronized animations
	useEffect(() => {
		if (synchronized) {
			registerComponent(componentId.current, priority);

			return () => {
				unregisterComponent(componentId.current);
			};
		}
		return undefined;
	}, [registerComponent, unregisterComponent, priority, synchronized]);

	// Listen for global animation triggers
	useEffect(() => {
		if (!synchronized || !syncAnimations) return undefined;

		const handleAnimationTrigger = () => {
			startAnimation();
		};

		// Listen for animation events
		document.addEventListener("animate-components", handleAnimationTrigger);

		return () => {
			document.removeEventListener(
				"animate-components",
				handleAnimationTrigger,
			);
		};
	}, [synchronized, syncAnimations]);

	// Auto-start animation if enabled
	useEffect(() => {
		if (autoStart && !hasAnimated) {
			// Small delay to ensure component is mounted
			const timer = setTimeout(() => {
				startAnimation();
			}, 10);

			return () => clearTimeout(timer);
		}
		return undefined;
	}, [autoStart, hasAnimated]);

	// Start animation with proper performance optimizations
	const startAnimation = () => {
		if (reducedMotion) {
			// Skip animation but update state
			setIsAnimating(false);
			setHasAnimated(true);
			return;
		}

		setIsAnimating(true);

		if (elementRef.current) {
			// Apply hardware acceleration during animation
			elementRef.current.classList.add("transitioning");
			elementRef.current.style.willChange = "opacity, transform";

			// Apply animation class
			elementRef.current.classList.add("sync-active");
		}

		// Clear hardware acceleration after animation completes
		const timer = setTimeout(() => {
			setIsAnimating(false);
			setHasAnimated(true);

			if (elementRef.current) {
				elementRef.current.classList.remove("transitioning");
				elementRef.current.classList.add("transitioning-done");
				elementRef.current.style.willChange = "auto";
			}
		}, duration);

		return () => clearTimeout(timer);
	};

	// Reset animation state for repeating animations
	const resetAnimation = () => {
		setHasAnimated(false);

		if (elementRef.current) {
			elementRef.current.classList.remove("sync-active", "transitioning-done");
		}
	};

	return {
		ref: elementRef,
		isAnimating,
		hasAnimated,
		startAnimation,
		resetAnimation,
		className: synchronized ? "transition-group-item" : "",
	};
}
