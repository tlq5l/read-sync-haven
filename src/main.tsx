/* eslint-disable */
import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./lib/polyfills";

// Explicitly make React available globally
window.React = React;

const rootElement = document.getElementById("root");
if (rootElement) {
	createRoot(rootElement).render(<App />);
} else {
	console.error("Root element not found");
}
