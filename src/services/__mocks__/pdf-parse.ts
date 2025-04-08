import { vi } from "vitest";

// Create a mock function that will represent the default export of pdf-parse
const mockPdfParse = vi.fn();

// Export it as the default export, matching the original module's structure
export default mockPdfParse;

// If pdf-parse had other named exports, you could mock them here too, e.g.:
// export const namedExportMock = vi.fn();
