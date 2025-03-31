# Testing Plan for read-sync-haven

**Goal:** Establish a testing foundation and add initial, high-value unit tests using the existing Vitest setup.

**Rationale:** While the application is functional, adding tests will:
*   Prevent regressions (breaking existing functionality) when making future changes.
*   Improve code maintainability and make refactoring safer.
*   Serve as documentation for how specific functions are expected to behave.
*   Build confidence in the codebase.

**Proposed Strategy:**

1.  **Start Small:** Begin with unit tests for utility functions, as they are often the most straightforward to test and provide a good return on investment.
2.  **Focus on Core Logic:** Prioritize testing functions that implement critical application logic.
3.  **Gradual Expansion:** Once a foundation is laid, incrementally add tests for hooks, components, and services.

**Initial Steps (Completed - 2025-04-01):**

1.  **Target File:** `src/lib/utils.ts` - ✅ Completed.
2.  **Identify Test Candidates:** `isInputElement` and `shouldIgnoreShortcut` - ✅ Completed.
3.  **Create Test File:** `src/lib/utils.test.ts` created - ✅ Completed.
4.  **Write Tests for `isInputElement`:** Tests added - ✅ Completed.
    *   Test cases for standard input elements (`<input>`, `<textarea>`, `<select>`).
    *   Test case for elements with the `contenteditable` attribute.
    *   Test cases for elements that should *not* be considered input elements (e.g., `<div>`, `<button>`).
    *   Test case for `null` input.
5.  **Write Tests for `shouldIgnoreShortcut`:** Tests added - ✅ Completed.
    *   Test cases where the event target *is* an input element (should return `true`).
    *   Test cases where the event target *is not* an input element (should generally return `false`, unless other conditions apply).
    *   Test cases for common edit shortcuts (like Ctrl+C, Ctrl+V) when the active element *is* an input (should return `true`).
    *   Test cases for common edit shortcuts when the active element *is not* an input (should return `false`).
    *   Test cases for other key combinations that *should not* be ignored.
    *   *(Note: Initial environment issues were encountered, requiring mocking `document.activeElement` and type assertions).*
   6.  **Run Tests & Debug:** Initial runs with `bun test` revealed failures in tests requiring a DOM environment (`src/lib/animation.test.ts`) and PouchDB initialization (`src/lib/articleUtils.test.ts`). Debugging identified:
       *   An incompatibility where `bun test` did not correctly load the `jsdom` environment specified in `vitest.config.ts`.
       *   PouchDB required explicit configuration with `pouchdb-adapter-memory` for the test environment.
       *   **Resolution:** Tests now pass reliably using `bunx vitest run`. The `package.json` `test` script has been updated to use `vitest run`, so `bun test` now works correctly. PouchDB configuration was updated for the test environment. - ✅ Completed.
7.  **Commit:** Changes committed with message "test: Add unit tests for utils" - ✅ Completed.

**Future Steps (Beyond Initial Implementation):**

*   Add tests for other utility functions in `src/lib`.
*   Write tests for custom hooks in `src/hooks`, potentially mocking dependencies where necessary.
*   Introduce component testing (using Vitest's DOM environment or potentially integrating React Testing Library) for key UI elements in `src/components`.
*   Consider tests for data fetching and manipulation logic in `src/services`.

**Mermaid Diagram (Illustrating Focus):**

```mermaid
graph TD
    A[Project Codebase] --> B(src/);
    B --> C(lib/);
    B --> D(hooks/);
    B --> E(components/);
    B --> F(services/);
    B --> G(pages/);

    C --> H(utils.ts);
    H --> I(isInputElement);
    H --> J(shouldIgnoreShortcut);

    style I fill:#f9f,stroke:#333,stroke-width:2px;
    style J fill:#f9f,stroke:#333,stroke-width:2px;
    style H fill:#ccf,stroke:#333,stroke-width:2px;

    subgraph "Initial Test Focus"
        direction LR
        I; J;
    end

    subgraph "Potential Future Focus"
        direction TB
        D; E; F;
    end