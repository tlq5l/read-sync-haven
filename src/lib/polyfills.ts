// Simplified browser polyfills - focusing on essential functionality
if (typeof window !== "undefined") {
	// Ensure JSZip is available to EPUB.js
	// Skip JSZip check in test environment
	const isTestEnv =
		typeof process !== "undefined" &&
		process.env &&
		(process.env.NODE_ENV === "test" || process.env.VITEST);

	if (!isTestEnv) {
		if (window.JSZip) {
			console.log("JSZip loaded from global scope");
		} else {
			console.warn("JSZip not found. EPUB functionality may be limited.");
		}
	}

	// Ensure process is defined for React and other libs that expect it
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const proc = (window as any).process;

	if (typeof proc === "undefined") {
		// If process is completely missing, define a minimal version
		// Always define a minimal process object, even during Vitest runs
		const minimalProcess = {
			env: {},
			versions: { node: "0.0.0" /* ... other versions */ },
			nextTick: (cb: () => void) => setTimeout(cb, 0),
			// Add dummy listeners method that always returns an empty array
			listeners: (_event: string) => [] as Array<() => void>,
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).process = minimalProcess;
	} else if (typeof proc.listeners === "undefined") {
		// If process exists but listeners is missing, add the dummy listeners method
		// This helps stabilize Vitest's error handling in all environments
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).process.listeners = (_event: string) =>
			[] as Array<() => void>;
	}

	// Required for PouchDB in some environments
	if (
		typeof window.crypto === "undefined" ||
		typeof window.crypto.getRandomValues === "undefined"
	) {
		// Simple polyfill for crypto.getRandomValues
		if (typeof window.crypto === "undefined") {
			// If crypto is completely missing, create a minimal implementation
			Object.defineProperty(window, "crypto", {
				value: {
					getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
						if (array instanceof Uint8Array) {
							for (let i = 0; i < array.length; i++) {
								array[i] = Math.floor(Math.random() * 256);
							}
						}
						return array;
					},
				},
				configurable: true,
			});
		} else if (typeof window.crypto.getRandomValues === "undefined") {
			// If only getRandomValues is missing, add it
			Object.defineProperty(window.crypto, "getRandomValues", {
				value: <T extends ArrayBufferView | null>(array: T): T => {
					if (array instanceof Uint8Array) {
						for (let i = 0; i < array.length; i++) {
							array[i] = Math.floor(Math.random() * 256);
						}
					}
					return array;
				},
				configurable: true,
			});
		}
	}

	// Anti-recursion protection for Date methods
	// This prevents infinite recursion between setTime and _set methods
	// which can be caused by fingerprinting protection extensions
	try {
		const originalDatePrototype = Date.prototype;
		const originalSetTime = originalDatePrototype.setTime;

		// Detect if setTime is already wrapped or modified
		if (originalSetTime && typeof originalSetTime === "function") {
			// Use a recursion counter to break infinite loops
			const recursionGuard = new WeakMap<Function, Map<Date, number>>();

			// Override setTime with a version that has recursion protection
			Object.defineProperty(Date.prototype, "setTime", {
				value: function setTimeWithGuard(time: number): number {
					// Initialize recursion tracking if needed
					if (!recursionGuard.has(originalSetTime)) {
						recursionGuard.set(originalSetTime, new Map<Date, number>());
					}

					const guardsForThis = recursionGuard.get(originalSetTime)!;
					const currentCount = guardsForThis.get(this) || 0;

					// If we detect too many recursive calls, break the chain
					if (currentCount > 10) {
						guardsForThis.delete(this);
						return 0; // Return a default value to break recursion
					}

					// Track this call
					guardsForThis.set(this, currentCount + 1);

					try {
						// Call the original method
						return originalSetTime.call(this, time);
					} finally {
						// Clean up our tracking
						if (currentCount <= 1) {
							guardsForThis.delete(this);
						} else {
							guardsForThis.set(this, currentCount - 1);
						}
					}
				},
				configurable: true,
				writable: true,
			});
		}
	} catch (e) {
		console.warn("Failed to apply Date recursion protection:", e);
	}

	// Ensure global is defined (needed for PouchDB)
	if (
		typeof (window as Window & typeof globalThis & { global?: unknown })
			.global === "undefined"
	) {
		(window as Window & typeof globalThis & { global?: unknown }).global =
			window;
	}

	// Ensure setImmediate is defined (needed for some PouchDB operations)
	// Simplified setImmediate polyfill to avoid complex typing issues
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (typeof (window as any).setImmediate === "undefined") {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).setImmediate = function setImmediate(
			callback: (...args: unknown[]) => void,
			...args: unknown[]
		) {
			return setTimeout(() => callback(...args), 0);
		};

		// Add minimal __promisify__ property to satisfy TypeScript
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).setImmediate.__promisify__ = () => Promise.resolve();
	}
}

export {};
