# Cloud Sync Deletion Fix Plan

## Problem

When a user deletes an article locally, the local PouchDB document is marked with `_deleted: true` (a "tombstone"), and a `DELETE` request is sent to the cloud backend. However, a race condition can occur:

1.  The cloud synchronization process (`useArticleSync`) fetches all articles from the backend *before* the backend has processed the `DELETE` request.
2.  The sync process receives the non-deleted version of the article from the backend.
3.  The `saveArticle` function in the local database service (`src/services/db/articles.ts`) is called with this non-deleted data.
4.  `saveArticle` currently overwrites the local `_deleted: true` tombstone, causing the deleted article to reappear locally.

## Solution

Modify the `saveArticle` function in `src/services/db/articles.ts` to prevent overwriting local deletions.

**Steps:**

1.  **Fetch Local Document:** Inside `saveArticle`, before attempting to save the incoming article data, fetch the current corresponding document from the local PouchDB using `articlesDb.get(docId)`. Handle potential "not found" errors gracefully (treat as non-deleted).
2.  **Check Deletion Status:**
    *   If the local document exists and has `_deleted: true`.
    *   Check if the incoming article data (passed as a parameter to `saveArticle`) is *also* marked as deleted (e.g., `incomingArticle._deleted === true`).
3.  **Conditional Save Logic:**
    *   **Block Save:** If the local document *is* deleted (`localDoc._deleted === true`) BUT the incoming article data is **NOT** deleted, **skip** the `articlesDb.put()` call for this article. Log a message indicating the save was skipped to preserve the local deletion state.
    *   **Allow Save:** If the local document does not exist, is *not* deleted, or *both* the local and incoming documents are marked as deleted, proceed with the existing `articlesDb.put()` logic.

## Flow Diagram

```mermaid
graph TD
    A[Start saveArticle(incomingArticle)] --> B{Get Current Local Doc by ID};
    B -- Error (Not Found) --> D[Proceed with Normal Save Logic];
    B -- Success (Found Local Doc) --> C{Is Local Doc _deleted: true?};
    C -- No --> D;
    C -- Yes --> E{Is incomingArticle _deleted: true?};
    E -- Yes --> D;
    E -- No --> F[Skip Save - Preserve Local Deletion];
    D --> G[Execute articlesDb.put(incomingArticle)];
    F --> H[End Function (No Save)];
    G --> H;
```

This ensures that a sync operation fetching non-deleted data from the cloud will not overwrite a document that the user has already explicitly deleted locally.