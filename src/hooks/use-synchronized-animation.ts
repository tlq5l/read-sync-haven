import { useAnimation } from "@/context/AnimationContext";
import { useEffect, useRef, useState } from "react";

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
		isElementAnimating,
		timings,
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

	// Update animation state when group animates
	useEffect(() => {
		if (disabled) return;

		const checkAnimation = () => {
			const newIsAnimating = isElementAnimating(
				groupId,
				uniqueElementId.current,
			);
			if (newIsAnimating !== isAnimating) {
				setIsAnimating(newIsAnimating);
			}
		};

		// Check regularly to catch animation state changes
		const intervalId = setInterval(checkAnimation, 100);

		return () => {
			clearInterval(intervalId);
		};
	}, [groupId, isElementAnimating, isAnimating, disabled]);

	// Apply styles to the element when it's referenced
	const animationRef = (element: HTMLElement | null) => {
		if (!element || disabled) {
			elementRef.current = null;
			return;
		}

		elementRef.current = element;

		// Apply animation-related styles
		element.style.transitionProperty = "transform, opacity, visibility";
		element.style.transitionDuration = `${duration || timings.normal}ms`;
		element.style.transitionTimingFunction = easing || easings.standard;

		if (delay > 0) {
			element.style.transitionDelay = `${delay}ms`;
		}

		// Apply hardware acceleration
		element.style.transform = "translateZ(0)";
		element.style.backfaceVisibility = "hidden";

		// Set will-change only during animation to avoid performance issues
		if (isAnimating) {
			element.style.willChange = "transform, opacity";
		} else {
			element.style.willChange = "auto";
		}
	};

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
