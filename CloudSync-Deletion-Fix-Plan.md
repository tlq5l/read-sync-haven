# Cloud Sync Deletion Error Fix Plan

## Problem

The application logs repeated `401 Unauthorized` errors when attempting to delete items via the cloud sync API (`bondwise-sync-api.vikione.workers.dev`). This occurs during the processing of the offline queue (`_processOfflineQueue` in `useArticleSync.ts`) and is caused by a retry loop due to the initial deletion failure.

## Root Cause

The functions `deleteItemFromCloud` and `saveItemToCloud` in `src/services/cloudSync.ts` are called from `_processOfflineQueue` in `src/hooks/useArticleSync.ts` without the necessary Clerk authentication token. The token is fetched in the parent function (`_performCloudSync`) but not passed down into the queue processing logic, causing the API calls to fail authentication.

## Detailed Plan

1.  **Modify `src/services/cloudSync.ts`:**
    *   Update `deleteItemFromCloud` signature to accept `token: string`.
    *   Add `Authorization: \`Bearer ${token}\`` header to `deleteItemFromCloud`'s `fetch` call.
    *   Update `saveItemToCloud` signature to accept `token: string`.
    *   Add `Authorization: \`Bearer ${token}\`` header to `saveItemToCloud`'s `fetch` call.

2.  **Modify `src/hooks/useArticleSync.ts`:**
    *   Update `_processOfflineQueue` signature to accept `token: string`.
    *   Pass the received `token` to `deleteItemFromCloud` call within `_processOfflineQueue`.
    *   Pass the received `token` to `saveItemToCloud` call within `_processOfflineQueue`.
    *   In `_performCloudSync`:
        *   Fetch the token using `getToken()` *before* calling `_processOfflineQueue`.
        *   Add error handling: If `token` is `null`, log an error and skip calling `_processOfflineQueue`.
        *   Pass the valid `token` to the `_processOfflineQueue` call.
        *   Pass the `token` to the `deleteItemFromCloud` call inside the reconciliation loop.

## Plan Summary Diagram

```mermaid
graph TD
    A[useArticleSync Hook] --> B(_performCloudSync);
    B --> C{Get Auth Token};
    C -- Token OK --> D[_processOfflineQueue(token)];
    C -- Token Missing --> E[Skip Queue Processing + Log Error];
    D --> F[deleteItemFromCloud(id, token)];
    D --> G[saveItemToCloud(article, token)];
    B --> H[fetchCloudItems(token, email)];
    B --> I[Reconcile Logic];
    I -- Cloud Delete Re-attempt --> F;
    F --> J[API Call w/ Auth Header];
    G --> J;
    H --> J;

    subgraph cloudSync.ts
        direction LR
        F;
        G;
    end

    subgraph useArticleSync.ts
        direction TB
        A; B; C; D; E; H; I;
    end

    style J fill:#f9f,stroke:#333,stroke-width:2px
```

## Next Steps

Switch to Code mode to implement the changes outlined in this plan.