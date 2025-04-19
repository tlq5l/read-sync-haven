import { useEffect, useRef } from "react";

/**
 * Returns the previous value of a prop or state across renders.
 *
 * @param value - The current value to track.
 * @returns The value from the previous render, or `undefined` on the initial render.
 */
export function usePrevious<T>(value: T): T | undefined {
	const ref = useRef<T>();

	// Store current value in ref after rendering
	useEffect(() => {
		ref.current = value;
	}, [value]); // Only re-run if value changes

	// Return previous value (happens before update in useEffect)
	return ref.current;
}
