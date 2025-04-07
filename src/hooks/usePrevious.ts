import { useEffect, useRef } from "react";

/**
 * Custom hook to get the previous value of a prop or state.
 * @param value The value to track
 * @returns The previous value
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
