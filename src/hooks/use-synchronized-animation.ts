import { useAnimation } from "@/context/AnimationContext";
import { useCallback, useEffect, useRef, useState } from "react"; // Add useCallback

interface SynchronizedAnimationOptions {
	groupId?: string;
	elementId?: string;
	duration?: number;
	delay?: number;
	easing?: string;
	disabled?: boolean;
}

/**
 * Hook for creating synchronized animations between components
 */
export function useSynchronizedAnimation({
	groupId = "default",
	elementId,
	duration,
	delay = 0,
	easing,
	disabled = false,
}: SynchronizedAnimationOptions = {}) {
	const {
		registerTransitionElement,
		unregisterTransitionElement,
		// isElementAnimating, // Removed as it's no longer used in this hook
		timings,
		// isElementAnimating is no longer needed directly in this hook
		easings,
	} = useAnimation();

	const [isAnimating, setIsAnimating] = useState(false);
	const elementRef = useRef<HTMLElement | null>(null);
	const uniqueElementId = useRef(
		elementId || `element-${Math.random().toString(36).substring(2, 9)}`,
	);

	// Register this element with the animation context
	useEffect(() => {
		if (disabled) return;

		registerTransitionElement(groupId, uniqueElementId.current);

		return () => {
			unregisterTransitionElement(groupId, uniqueElementId.current);
		};
	}, [
		groupId,
		registerTransitionElement,
		unregisterTransitionElement,
		disabled,
	]);

	// Removed polling useEffect. State will be managed via transitionend.

	// Apply styles to the element when it's referenced
	// Effect to handle transition end
	useEffect(() => {
		const node = elementRef.current;
		if (!node || disabled) return;

		const handleTransitionEnd = (event: TransitionEvent) => {
			// Ensure the event is for the element itself and not a child
			// And check if the transition property is one we care about (optional but good practice)
			if (
				event.target ===
				node /* && (event.propertyName === 'opacity' || event.propertyName === 'transform') */
			) {
				// console.log(`Transition ended for ${uniqueElementId.current}`);
				setIsAnimating(false);
				node.style.willChange = "auto"; // Reset will-change when animation ends
			}
		};

		// Set initial animating state (assuming it starts animating immediately upon mount/trigger)
		// This might need adjustment based on how triggerTransition works
		// For now, let's assume it starts animating if not disabled.
		// A better approach would be to have triggerTransition directly set this state.
		setIsAnimating(true);
		node.style.willChange = "transform, opacity"; // Set will-change when animation starts

		node.addEventListener("transitionend", handleTransitionEnd);

		return () => {
			node.removeEventListener("transitionend", handleTransitionEnd);
			// Reset will-change on cleanup if it was animating
			if (isAnimating) {
				node.style.willChange = "auto";
			}
		};
	}, [disabled, isAnimating]); // Rerun if disabled changes or isAnimating changes (to reset will-change)

	const animationRef = useCallback(
		(element: HTMLElement | null) => {
			if (!element || disabled) {
				elementRef.current = null;
				return;
			}

			elementRef.current = element;

			// Apply animation-related styles - These define the transition itself
			element.style.transitionProperty = "transform, opacity, visibility";
			element.style.transitionDuration = `${duration || timings.normal}ms`;
			element.style.transitionTimingFunction = easing || easings.standard;
			if (delay > 0) {
				element.style.transitionDelay = `${delay}ms`;
			}

			// Apply hardware acceleration hints
			element.style.transform = "translateZ(0)"; // Ensure this doesn't conflict with animation transforms
			element.style.backfaceVisibility = "hidden";

			// Initial will-change state is handled in the useEffect now
			// element.style.willChange = 'auto'; // Set initial state
		},
		[disabled, duration, delay, easing, timings, easings],
	);

	return {
		ref: animationRef,
		isAnimating,
		elementId: uniqueElementId.current,
	};
}

/**
 * Hook for creating transition groups that animate together
 */
export function useTransitionGroup(groupId: string, timeout?: number) {
	const { createTransitionGroup, triggerTransition, synchronizeAnimations } =
		useAnimation();

	// Create the transition group on mount
	useEffect(() => {
		createTransitionGroup(groupId, timeout);
	}, [groupId, createTransitionGroup, timeout]);

	// Function to trigger all animations in this group
	const animateGroup = () => {
		synchronizeAnimations(() => {
			triggerTransition(groupId);
		});
	};

	return {
		animateGroup,
		groupId,
	};
}
