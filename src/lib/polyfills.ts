// Browser polyfills for JSDOM
if (typeof window !== "undefined") {
	// Ensure process is defined
	if (typeof window.process === "undefined") {
		(window as Window & typeof globalThis & { process?: unknown }).process = {
			env: {},
			browser: true,
			version: "v16.0.0",
			nextTick: (cb: () => void) => setTimeout(cb, 0),
		};
	}

	// Add JSDOM-related polyfills if needed
	if (typeof window.TextEncoder === "undefined") {
		try {
			// Use the global TextEncoder if available
			(
				window as Window &
					typeof globalThis & {
						TextEncoder?: typeof TextEncoder;
						TextDecoder?: typeof TextDecoder;
					}
			).TextEncoder = TextEncoder;
			(
				window as Window &
					typeof globalThis & {
						TextEncoder?: typeof TextEncoder;
						TextDecoder?: typeof TextDecoder;
					}
			).TextDecoder = TextDecoder;
		} catch (e) {
			console.warn("TextEncoder/TextDecoder not available in this environment");
		}
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
					clearImmediate?: (id: number) => void;
				}
		).setImmediate === "undefined"
	) {
		(
			window as Window &
				typeof globalThis & {
					setImmediate?: (...args: unknown[]) => number;
					clearImmediate?: (id: number) => void;
				}
		).setImmediate = (
			callback: (...args: unknown[]) => void,
			...args: unknown[]
		) => setTimeout(() => callback(...args), 0);
		(
			window as Window &
				typeof globalThis & { clearImmediate?: (id: number) => void }
		).clearImmediate = (id: number) => {
			clearTimeout(id);
		};
	}

	// Console logging for polyfill initialization
	console.log("Polyfills initialized for browser environment");
}

export {};
