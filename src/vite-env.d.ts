/// <reference types="vite/client" />

// Ensure React is properly typed when using JSX
declare namespace JSX {
	interface IntrinsicElements {
		[elemName: string]: any;
	}
}
