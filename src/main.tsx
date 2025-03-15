/* eslint-disable */
import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/polyfills";

// Ensure JSZip is available globally for EPUB.js
declare global {
	interface Window {
		JSZip: any;
	}
}

// Check for JSZip at initialization
if (window.JSZip) {
	console.log("JSZip is available globally");
} else {
	console.warn(
		"JSZip not found in window global. EPUB functionality may be limited.",
	);
	// Try to create a simple access point in case it was loaded but not accessible
	try {
		// @ts-ignore
		if (typeof JSZip !== "undefined") {
			// @ts-ignore
			window.JSZip = JSZip;
			console.log("JSZip assigned from global scope");
		}
	} catch (e) {
		console.error("Error setting JSZip global:", e);
	}
}

// Explicitly make React available globally
window.React = React;

// Load scripts in the correct order
const rootElement = document.getElementById("root");
if (rootElement) {
	createRoot(rootElement).render(<App />);
} else {
	console.error("Root element not found");
}
