import React, { useEffect, useState } from "react";
import { useTransitionGroup } from "@/hooks/use-synchronized-animation";
import { cn } from "@/lib/utils";

export interface TransitionGroupProps
	extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	groupId: string;
	timeout?: number;
	autoAnimate?: boolean;
	staggerChildren?: boolean;
	staggerDelay?: number;
	className?: string;
}

const TransitionGroup = React.forwardRef<HTMLDivElement, TransitionGroupProps>(
	(
		{
			children,
			groupId,
			timeout,
			autoAnimate = false,
			staggerChildren = false,
			staggerDelay = 50,
			className,
			...props
		},
		ref,
	) => {
		const { animateGroup } = useTransitionGroup(groupId, timeout);
		const [hasAnimated, setHasAnimated] = useState(false);

		// Apply staggered delays to children if requested
		const childrenWithStagger = React.Children.map(children, (child, index) => {
			if (!React.isValidElement(child) || !staggerChildren) {
				return child;
			}

			return React.cloneElement(child, {
				...child.props,
				style: {
					...child.props.style,
					transitionDelay: `${index * staggerDelay}ms`,
				},
			});
		});

		// Auto-animate on mount if requested
		useEffect(() => {
			if (autoAnimate && !hasAnimated) {
				// Delay slightly to ensure all children are mounted
				const timeoutId = setTimeout(() => {
					animateGroup();
					setHasAnimated(true);
				}, 50);

				return () => clearTimeout(timeoutId);
			}
			return undefined;
		}, [autoAnimate, animateGroup, hasAnimated]);

		// Create safe HTML attributes that won't be passed to the DOM
		const safeProps = { ...props };
		// Remove any props that are not valid HTML attributes
		const propsToRemove = ["stagger", "synchronized"] as const;
		propsToRemove.forEach((prop) => {
			if (prop in safeProps) {
				delete (safeProps as any)[prop];
			}
		});

		return (
			<div
				ref={ref}
				className={cn("transition-group", className)}
				data-group-id={groupId}
				data-stagger-children={staggerChildren ? "true" : "false"}
				data-auto-animate={autoAnimate ? "true" : "false"}
				{...safeProps}
			>
				{childrenWithStagger}
			</div>
		);
	},
);

TransitionGroup.displayName = "TransitionGroup";

export interface TransitionItemProps
	extends React.HTMLAttributes<HTMLDivElement> {
	children: React.ReactNode;
	showFrom?: "top" | "bottom" | "left" | "right" | "none";
	duration?: number;
	className?: string;
}

const TransitionItem = React.forwardRef<HTMLDivElement, TransitionItemProps>(
	({ children, showFrom = "none", duration, className, ...props }, ref) => {
		// Determine the transform based on the showFrom prop
		const getInitialTransform = () => {
			switch (showFrom) {
				case "top":
					return "translateY(-20px)";
				case "bottom":
					return "translateY(20px)";
				case "left":
					return "translateX(-20px)";
				case "right":
					return "translateX(20px)";
				case "none":
					return "none";
				default:
					return "none";
			}
		};

		return (
			<div
				ref={ref}
				className={cn("transition-item", "gpu-accelerated", className)}
				style={{
					transform: getInitialTransform(),
					opacity: 0,
					...(duration ? { transitionDuration: `${duration}ms` } : {}),
				}}
				data-show-from={showFrom}
				{...props}
			>
				{children}
			</div>
		);
	},
);

TransitionItem.displayName = "TransitionItem";

export { TransitionGroup, TransitionItem };
