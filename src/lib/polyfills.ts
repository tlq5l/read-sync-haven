// Simplified browser polyfills - focusing on essential functionality
if (typeof window !== "undefined") {
	// Ensure JSZip is available to EPUB.js
	if (window.JSZip) {
		console.log("JSZip loaded from global scope");
	} else {
		console.warn("JSZip not found. EPUB functionality may be limited.");
	}
	// Ensure process is defined for React and other libs that expect it
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const proc = (window as any).process;

	if (typeof proc === "undefined") {
		// If process is completely missing, define a minimal version
		// (Avoid doing this during Vitest runs unless explicitly testing the polyfill)
		if (!import.meta.env.VITEST) {
			// Define minimal process object
			const minimalProcess = {
				env: {},
				versions: { node: "0.0.0" /* ... other versions */ },
				nextTick: (cb: () => void) => setTimeout(cb, 0),
				// Add dummy listeners method
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				listeners: (_event: string) => [] as Array<() => void>,
			};
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(window as any).process = minimalProcess;
		}
	} else if (typeof proc.listeners === "undefined") {
		// If process exists but listeners is missing, add the dummy listeners method
		// This might help stabilize Vitest's error handling in certain environments
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).process.listeners = (_event: string) => [] as Array<() => void>;
	}


	// Required for PouchDB in some environments
	if (
		typeof window.crypto === "undefined" ||
		typeof window.crypto.getRandomValues === "undefined"
	) {
		// Simple polyfill for crypto.getRandomValues
		(
			window as Window &
				typeof globalThis & {
					crypto?: Partial<Crypto>;
				}
		).crypto = {
			...(
				window as Window &
					typeof globalThis & {
						crypto?: Partial<Crypto>;
					}
			).crypto,
			getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
				if (array instanceof Uint8Array) {
					for (let i = 0; i < array.length; i++) {
						array[i] = Math.floor(Math.random() * 256);
					}
				}
				return array;
			},
		};
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
