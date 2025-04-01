import * as matchers from "@testing-library/jest-dom/matchers";
// src/setupTests.ts
import { expect } from "vitest";

// Ensure process.listeners exists for Vitest's error handlers
if (typeof process !== "undefined" && typeof process.listeners !== "function") {
	process.listeners = () => [];
}

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Add any other global setup logic here if needed.
