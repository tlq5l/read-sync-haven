// Simplified browser polyfills - focusing on essential functionality
if (typeof window !== "undefined") {
	// Ensure process is defined for React and other libs that expect it
	if (typeof window.process === "undefined") {
		(window as Window & typeof globalThis & { process?: unknown }).process = {
			env: {},
			browser: true,
			nextTick: (cb: () => void) => setTimeout(cb, 0),
		};
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
			getRandomValues: (buffer: Uint8Array) => {
				for (let i = 0; i < buffer.length; i++) {
					buffer[i] = Math.floor(Math.random() * 256);
				}
				return buffer;
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
	if (
		typeof (
			window as Window &
				typeof globalThis & {
					setImmediate?: (...args: unknown[]) => number;
				}
		).setImmediate === "undefined"
	) {
		(
			window as Window &
				typeof globalThis & {
					setImmediate?: (...args: unknown[]) => number;
				}
		).setImmediate = (
			callback: (...args: unknown[]) => void,
			...args: unknown[]
		) => setTimeout(() => callback(...args), 0);
	}
}

export {};
