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

**Initial Steps (The Plan):**

1.  **Target File:** We'll start with `src/lib/utils.ts`, which contains helper functions for CSS classes and keyboard shortcut logic.
2.  **Identify Test Candidates:** The functions `isInputElement` and `shouldIgnoreShortcut` are excellent first candidates. They are relatively isolated and crucial for the keyboard shortcut feature.
3.  **Create Test File:** A new file, `src/lib/utils.test.ts`, will be created alongside `utils.ts` to house the tests.
4.  **Write Tests for `isInputElement`:**
    *   Test cases for standard input elements (`<input>`, `<textarea>`, `<select>`).
    *   Test case for elements with the `contenteditable` attribute.
    *   Test cases for elements that should *not* be considered input elements (e.g., `<div>`, `<button>`).
    *   Test case for `null` input.
5.  **Write Tests for `shouldIgnoreShortcut`:**
    *   Test cases where the event target *is* an input element (should return `true`).
    *   Test cases where the event target *is not* an input element (should generally return `false`, unless other conditions apply).
    *   Test cases for common edit shortcuts (like Ctrl+C, Ctrl+V) when the active element *is* an input (should return `true`).
    *   Test cases for common edit shortcuts when the active element *is not* an input (should return `false`).
    *   Test cases for other key combinations that *should not* be ignored.
    *   *(Note: These tests will likely require mocking basic `KeyboardEvent` and `Element` objects, which Vitest handles well).*
6.  **Run Tests:** Execute the tests using your configured test script (likely `bun test` or similar) to ensure they pass.
7.  **Commit:** Commit the new test file and any necessary setup.

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