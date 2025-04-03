# Plan: Implement UI Virtualization for Inbox Page

**Goal:** Improve the initial load time and scrolling performance of the `InboxPage` by replacing the current `.map()` rendering of `ArticleCard` components with a virtualized grid using `react-virtuoso`.

**Problem Context:**
The `InboxPage` currently renders all 'inbox' articles fetched from `ArticleContext` using `.map()`. This causes slow initial load times when many articles are present. The articles are displayed in a responsive Tailwind CSS grid (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), and `ArticleCard` components have variable heights due to differing content.

**Chosen Library:** `react-virtuoso`
*   **Rationale:** Best support for variable item heights, responsive grids via CSS classes, good integration patterns, and suitable for dynamic content like `ArticleCard`s, based on research findings.

## Implementation Steps:

1.  **Install Dependency:**
    *   Add `react-virtuoso` to the project:
        ```bash
        bun add react-virtuoso
        ```

2.  **Create `VirtualizedArticleGrid` Component:**
    *   Location: `src/components/VirtualizedArticleGrid.tsx`.
    *   Props: Accepts an `articles` array.
    *   Implementation: Uses the `VirtuosoGrid` component.
    *   Configuration:
        *   `data`: The passed `articles` array.
        *   `listClassName`: `"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"` (preserves existing layout).
        *   `itemContent`: Function rendering `(index, article) => <MemoizedArticleCard key={article._id} article={article} ... />`.
        *   `defaultItemHeight`: Estimated height (e.g., `300`) for initial render smoothness (requires tuning).

3.  **Memoize `ArticleCard`:**
    *   Wrap `ArticleCard` with `React.memo` in `src/components/ArticleCard.tsx` or its usage point within the virtualizer.
    *   Ensure all props passed to it (including event handlers) are stable (using `useCallback` where needed).

4.  **Integrate into `InboxPage`:**
    *   Import `VirtualizedArticleGrid` into `src/pages/InboxPage.tsx`.
    *   Filter `processedArticles` from `useArticles()` context for `status === 'inbox'` *before* passing to the virtualizer: `const inboxArticles = processedArticles.filter(a => a.status === 'inbox');`
    *   Replace the `.map()` logic (currently lines ~188-199) with `<VirtualizedArticleGrid articles={inboxArticles} />`.
    *   Ensure the parent container (`div` on line 118) correctly constrains the `VirtuosoGrid` height (e.g., using `flex-1`, explicit height).

5.  **Handle State Updates & Actions:**
    *   Verify that actions passed to `ArticleCard` (e.g., `updateArticleStatus`) are stable references (likely already handled by `useCallback` in `ArticleContext`).
    *   Test actions (archive, favorite) trigger context updates correctly and UI reflects changes properly after scrolling items out/in view.

6.  **Accessibility (a11y):**
    *   Test keyboard navigation (tabbing).
    *   Test with screen readers.
    *   Ensure `role="list"` is applied to the grid container and `role="listitem"` to item wrappers (potentially via `VirtuosoGrid`'s `components` prop).

7.  **Testing:**
    *   Test basic functionality with few articles.
    *   Test performance (load time, scroll smoothness) with many articles (1000+).
    *   Test responsiveness across different screen sizes.
    *   Test edge cases (loading, error, empty states).

## Diagram:

```mermaid
graph TD
    A[useArticleSync] -->|All Articles| B(ArticleContext);
    B -->|All Processed Articles| C(InboxPage);
    C -->|Filters for 'inbox'| F[VirtualizedArticleGrid Component (using react-virtuoso)];
    F -- Renders only visible items --> G[Memoized ArticleCard];
    F -- Applies Tailwind classes --> I[Responsive Grid Layout];
    F --> H[Fast Initial Load & Smooth Scroll];

    subgraph Implementation Details
        direction LR
        F --> J{Uses VirtuosoGrid};
        J --> K[listClassName: "grid..."];
        J --> L[defaultItemHeight: ~300];
        F --> G;
    end

    style F fill:#ccf,stroke:#333,stroke-width:2px;
    style H fill:#cfc,stroke:#333,stroke-width:2px;
    style G fill:#e6e6fa,stroke:#333;