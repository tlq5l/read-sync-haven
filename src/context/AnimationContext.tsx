import type React from "react";
import {
	createContext,
	useContext,
	useState,
	useCallback,
	useEffect,
} from "react";

/**
 * Animation timing presets
 */
export const ANIMATION_TIMINGS = {
	fast: 150,
	normal: 200,
	slow: 300,
} as const;

/**
 * Animation easing presets
 */
export const ANIMATION_EASINGS = {
	standard: "cubic-bezier(0.4, 0, 0.2, 1)",
	accelerate: "cubic-bezier(0.4, 0, 1, 1)",
	decelerate: "cubic-bezier(0, 0, 0.2, 1)",
	bounce: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
} as const;

/**
 * Types for the animation context
 */
type TransitionGroup = {
	id: string;
	elements: string[];
	timeout: number;
	active: boolean;
};

type AnimationContextType = {
	registerTransitionElement: (groupId: string, elementId: string) => void;
	unregisterTransitionElement: (groupId: string, elementId: string) => void;
	createTransitionGroup: (id: string, timeout?: number | undefined) => void;
	triggerTransition: (groupId: string) => void;
	isElementAnimating: (groupId: string, elementId: string) => boolean;
	synchronizeAnimations: (callback: () => void) => void;
	animateAll: () => void;
	timings: typeof ANIMATION_TIMINGS;
	easings: typeof ANIMATION_EASINGS;
};

/**
 * Create context with default values
 */
const AnimationContext = createContext<AnimationContextType>({
	registerTransitionElement: () => {},
	unregisterTransitionElement: () => {},
	createTransitionGroup: () => {},
	triggerTransition: () => {},
	isElementAnimating: () => false,
	synchronizeAnimations: () => {},
	animateAll: () => {},
	timings: ANIMATION_TIMINGS,
	easings: ANIMATION_EASINGS,
});

/**
 * Animation Provider component
 */
export function AnimationProvider({ children }: { children: React.ReactNode }) {
	const [transitionGroups, setTransitionGroups] = useState<TransitionGroup[]>(
		[],
	);
	const [animationFrame, setAnimationFrame] = useState<number | null>(null);

	// Clean up requested animation frame on unmount
	useEffect(() => {
		return () => {
			if (animationFrame !== null) {
				cancelAnimationFrame(animationFrame);
			}
		};
	}, [animationFrame]);

	// Create a new transition group
	const createTransitionGroup = useCallback<
		AnimationContextType["createTransitionGroup"]
	>((id: string, timeout = ANIMATION_TIMINGS.normal) => {
		setTransitionGroups((prev) => {
			// Don't duplicate groups
			if (prev.some((group) => group.id === id)) {
				return prev;
			}
			return [...prev, { id, elements: [], timeout, active: false }];
		});
	}, []);

	// Register an element to a transition group
	const registerTransitionElement = useCallback(
		(groupId: string, elementId: string) => {
			setTransitionGroups((prev) => {
				const groupIndex = prev.findIndex((group) => group.id === groupId);

				// If group doesn't exist, create it
				if (groupIndex === -1) {
					return [
						...prev,
						{
							id: groupId,
							elements: [elementId],
							timeout: ANIMATION_TIMINGS.normal,
							active: false,
						},
					];
				}

				// Add element to existing group if not already present
				const group = prev[groupIndex];
				if (group.elements.includes(elementId)) {
					return prev;
				}

				const newGroups = [...prev];
				newGroups[groupIndex] = {
					...group,
					elements: [...group.elements, elementId],
				};

				return newGroups;
			});
		},
		[],
	);

	// Remove an element from a transition group
	const unregisterTransitionElement = useCallback(
		(groupId: string, elementId: string) => {
			setTransitionGroups((prev) => {
				const groupIndex = prev.findIndex((group) => group.id === groupId);
				if (groupIndex === -1) return prev;

				const group = prev[groupIndex];
				const newElements = group.elements.filter((id) => id !== elementId);

				const newGroups = [...prev];
				if (newElements.length === 0) {
					// Remove the group if it has no elements
					newGroups.splice(groupIndex, 1);
				} else {
					newGroups[groupIndex] = { ...group, elements: newElements };
				}

				return newGroups;
			});
		},
		[],
	);

	// Trigger transition for a group
	const triggerTransition = useCallback(
		(groupId: string) => {
			setTransitionGroups((prev) => {
				const newGroups = prev.map((group) => {
					if (group.id === groupId) {
						return { ...group, active: true };
					}
					return group;
				});

				return newGroups;
			});

			// Reset the active state after the transition completes
			const group = transitionGroups.find((g) => g.id === groupId);
			if (group) {
				setTimeout(() => {
					setTransitionGroups((prev) => {
						return prev.map((g) => {
							if (g.id === groupId) {
								return { ...g, active: false };
							}
							return g;
						});
					});
				}, group.timeout + 50); // Add a small buffer
			}
		},
		[transitionGroups],
	);

	// Trigger all animation groups
	const animateAll = useCallback(() => {
		// Use synchronizeAnimations to ensure all animations start together
		synchronizeAnimations(() => {
			// Trigger all transition groups
			for (const group of transitionGroups) {
				triggerTransition(group.id);
			}

			// Apply animation classes to transition items
			const items = document.querySelectorAll(".transition-item");
			for (const item of items) {
				item.classList.add("animate");
			}
		});
	}, [transitionGroups, triggerTransition]);

	// Check if an element is currently animating
	const isElementAnimating = useCallback(
		(groupId: string, elementId: string) => {
			const group = transitionGroups.find((g) => g.id === groupId);
			if (!group) return false;
			return group.active && group.elements.includes(elementId);
		},
		[transitionGroups],
	);

	// Synchronize animations by using requestAnimationFrame
	const synchronizeAnimations = useCallback(
		(callback: () => void) => {
			if (animationFrame !== null) {
				cancelAnimationFrame(animationFrame);
			}

			// Use double RAF to ensure all elements are ready to animate
			const frameId = requestAnimationFrame(() => {
				setAnimationFrame(
					requestAnimationFrame(() => {
						callback();
						setAnimationFrame(null);
					}),
				);
			});

			setAnimationFrame(frameId);
		},
		[animationFrame],
	);

	const value = {
		registerTransitionElement,
		unregisterTransitionElement,
		createTransitionGroup,
		triggerTransition,
		isElementAnimating,
		synchronizeAnimations,
		animateAll,
		timings: ANIMATION_TIMINGS,
		easings: ANIMATION_EASINGS,
	};

	return (
		<AnimationContext.Provider value={value}>
			{children}
		</AnimationContext.Provider>
	);
}

// Custom hook to access the animation context
export function useAnimation() {
	const context = useContext(AnimationContext);
	if (context === undefined) {
		throw new Error("useAnimation must be used within an AnimationProvider");
	}
	return context;
}
