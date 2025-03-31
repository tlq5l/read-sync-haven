// src/services/db.ts
/**
 * This file serves as a compatibility layer, re-exporting the functionalities
 * from the refactored database modules located in the `src/services/db/` directory.
 *
 * Please update imports to point directly to `src/services/db` or specific modules
 * (e.g., `src/services/db/articles`) for new code.
 */

export * from "./db/index";

// Note: Functions like saveEpubFile and savePdfFile that were previously here
// have been removed as they involved logic beyond just database operations
// (file reading, metadata extraction). This logic should now reside in
// higher-level services that utilize the exported DB functions.
