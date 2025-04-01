import { useEffect, useState } from "react";

/**
 * Custom hook to debounce a value.
 * @param value - The value to debounce.
 * @param delay - The debounce delay in milliseconds.
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay: number): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		// Set timeout to update debounced value after delay
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		// Clear timeout if value changes (or delay changes) or on unmount
		// This is how we prevent debounced value from updating if value is changed
		// within the delay period. Timeout gets cleared and restarted.
		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]); // Only re-call effect if value or delay changes

	return debouncedValue;
}
