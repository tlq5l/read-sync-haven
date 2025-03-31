// src/setupTests.ts
import { expect } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Add any other global setup logic here if needed.