# Plan to Resolve Vite Build Warnings

This plan outlines the steps to address the warnings encountered during the `bun run build` process.

## Warnings Addressed

1.  **`eval` Warning:** `Use of eval in "node_modules/vm-browserify/index.js" is strongly discouraged...`
2.  **Mixed Static/Dynamic Import Warnings:** For `src/services/epub.ts` and `src/services/pdf.ts`.
3.  **Large Chunk Size Warning:** `vendor-deps` chunk exceeds 1500 kB.

## Proposed Steps

1.  **Address `eval` Warning:**
    *   Investigate if the `vm` polyfill (provided by `vite-plugin-node-polyfills`) is strictly necessary for the project's functionality.
    *   If not necessary, configure `vite-plugin-node-polyfills` in `vite.config.ts` to exclude the `vm` module.
    *   If necessary and no alternative exists, document the reason and accept the warning (last resort).

2.  **Address Mixed Imports:**
    *   Convert the static imports of functions from `src/services/epub.ts` and `src/services/pdf.ts` to dynamic `await import(...)` calls in the following files:
        *   `src/components/EpubReader.tsx`
        *   `src/components/PdfReader.tsx`
        *   `src/services/db/migrations.ts`
    *   This standardizes the import method to dynamic, aligning with the usage in `src/hooks/useArticleActions.ts` and allowing Vite to potentially optimize chunking better.

3.  **Address Large Chunk Size:**
    *   Analyze the contents of the large `dist/assets/vendor-deps-*.js` chunk (using a bundle analyzer tool or manual inspection if necessary).
    *   Identify the largest remaining third-party libraries within this chunk.
    *   Refine the `build.rollupOptions.output.manualChunks` function in `vite.config.ts` to split these specific large libraries into their own dedicated chunks (e.g., `vendor-epubjs`, `vendor-libraryX`).
    *   If refining `manualChunks` is insufficient, identify application components/routes that heavily rely on the large vendor libraries and consider dynamically importing those *components* using `React.lazy`.
    *   As a fallback, consider adjusting the `build.chunkSizeWarningLimit` if the optimized size is deemed acceptable.

4.  **Verification:**
    *   Run `bun run build` after applying the changes.
    *   Confirm that all three types of warnings are resolved.

5.  **Commit:**
    *   Commit the changes following the project's contribution guidelines (e.g., `fix: resolve vite build warnings`).

## Mermaid Diagram

```mermaid
graph TD
    A[Start: Build Warnings] --> B(Analyze Warnings);
    B --> C[Eval Warning];
    B --> D[Mixed Imports];
    B --> E[Large Chunk];

    subgraph Plan Steps
        C --> F{Investigate vm polyfill};
        F -- Unneeded --> G[Exclude polyfill in vite.config];
        F -- Needed --> H[Accept Warning (Fallback)];

        D --> I[Convert static imports to dynamic];
        I --> I1[Modify EpubReader.tsx];
        I --> I2[Modify PdfReader.tsx];
        I --> I3[Modify migrations.ts];

        E --> J[Optimize Chunking];
        J --> K[Refine manualChunks in vite.config];
        J -- If Needed --> L[Dynamic Import App Components];
    end

    G --> M(Run bun run build);
    H --> M;
    I1 --> M;
    I2 --> M;
    I3 --> M;
    K --> M;
    L --> M;

    M --> N{Warnings Resolved?};
    N -- Yes --> O[Commit Changes];
    N -- No --> B;
    O --> P[End];