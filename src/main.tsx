/* eslint-disable */
// Sentry initialization should be imported first!
import "./instrument.js";

import JSZip from "jszip";
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
	console.log(
		"JSZip not found in window global, setting it from imported package",
	);
	// Set JSZip from the imported package
	window.JSZip = JSZip;
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
