// src/services/db/utils.ts

/**
 * Checks if an error is likely transient (e.g., network issue, temporary server error)
 * and suitable for retrying.
 * @param error - The error object to check.
 * @returns True if the error is considered transient, false otherwise.
 */
export function isTransientError(error: any): boolean {
	if (!error) return false;

	// Network or connection related errors
	if (error.name === "NetworkError") return true;
	if (error.name === "timeout" || error.message?.includes("timeout"))
		return true;
	if (
		error.name === "connection_error" ||
		error.message?.includes("connection")
	)
		return true;

	// Common HTTP status codes indicating temporary server issues
	if (
		error.status === 500 || // Internal Server Error
		error.status === 502 || // Bad Gateway
		error.status === 503 || // Service Unavailable
		error.status === 504 // Gateway Timeout
	)
		return true;

	// PouchDB specific retry conditions
	// 'unknown_error' can sometimes be transient network issues
	if (error.name === "unknown_error") return true;
	// Explicitly do not retry conflicts, as they require specific handling
	if (error.name === "conflict" || error.message?.includes("conflict"))
		return false;
	// Other network/offline related messages
	if (error.message?.includes("network") || error.message?.includes("offline"))
		return true;

	return false;
}

/**
 * Executes an asynchronous operation with automatic retries for transient errors.
 * Uses exponential backoff for delays between retries.
 * @param operation - The async function to execute.
 * @param maxRetries - Maximum number of retry attempts (default: 3).
 * @param initialDelay - Initial delay in ms before the first retry (default: 300).
 * @returns A promise that resolves with the result of the operation if successful.
 * @throws The last error encountered if all retries fail or if a non-transient error occurs.
 */
export async function executeWithRetry<T>(
	operation: () => Promise<T>,
	maxRetries = 3,
	initialDelay = 300,
): Promise<T> {
	let lastError: any;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (err) {
			console.warn(`Operation failed (attempt ${attempt}/${maxRetries}):`, err);
			lastError = err;

			// Only retry on transient errors
			if (!isTransientError(err)) {
				console.error("Non-transient error encountered, not retrying.", err);
				throw err;
			}

			// Don't wait after the last attempt
			if (attempt < maxRetries) {
				// Exponential backoff with a cap
				const delay = Math.min(
					initialDelay * 2 ** (attempt - 1),
					5000, // Cap delay at 5 seconds
				);
				console.log(`Retrying after ${delay}ms...`);
				await new Promise((resolve) => setTimeout(resolve, delay));
			}
		}
	}

	console.error(`Operation failed after ${maxRetries} attempts.`);
	throw lastError; // Throw the last error after all retries fail
}

/**
 * Checks the current online status of the browser.
 * @returns True if the browser is offline, false otherwise.
 */
export function isOffline(): boolean {
	return typeof navigator !== "undefined" && !navigator.onLine;
}

/**
 * Registers event listeners for browser online/offline status changes.
 * @param onStatusChange - Callback function invoked with the current offline status (true if offline).
 * @returns A cleanup function to remove the event listeners.
 */
export function registerOfflineListeners(
	onStatusChange: (isOffline: boolean) => void,
): () => void {
	if (typeof window === "undefined") {
		// Return a no-op function if not in a browser environment
		return () => {};
	}

	const updateStatus = () => onStatusChange(!navigator.onLine);

	window.addEventListener("online", updateStatus);
	window.addEventListener("offline", updateStatus);

	// Call immediately to set initial status
	updateStatus();

	// Return cleanup function
	return () => {
		window.removeEventListener("online", updateStatus);
		window.removeEventListener("offline", updateStatus);
	};
}

/**
 * Converts an ArrayBuffer to a Base64 encoded string using chunking.
 * This is useful for handling potentially large binary data without causing
 * "Maximum call stack size exceeded" errors.
 *
 * @param buffer - The ArrayBuffer to encode.
 * @param chunkSize - The size of chunks to process (default: 32KB).
 * @returns The Base64 encoded string.
 * @throws Error if encoding fails.
 */
export function arrayBufferToBase64(
	buffer: ArrayBuffer,
	chunkSize = 0x8000, // 32KB
): string {
	try {
		const bytes = new Uint8Array(buffer);
		const chunks: string[] = [];

		for (let i = 0; i < bytes.length; i += chunkSize) {
			const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
			// `String.fromCharCode.apply` is generally faster for smaller arrays
			// but `TextDecoder` might be considered for very large chunks if performance issues arise.
			// However, `fromCharCode` avoids potential UTF-8 issues with binary data.
			chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
		}

		const binaryString = chunks.join("");
		return btoa(binaryString);
	} catch (error) {
		console.error("Error converting ArrayBuffer to Base64:", error);
		throw new Error(
			`Failed to encode ArrayBuffer to Base64: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}
