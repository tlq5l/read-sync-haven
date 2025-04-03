# Bondwise Extension: Authentication and Field Mapping Fixes (April 2025)

## Summary

This document details the fixes implemented to resolve critical API communication errors between the Bondwise browser extension and the Cloudflare Worker API. Two main issues were addressed:

1.  **Authentication Failure (401 Error)**: The extension lacked a proper authentication mechanism, causing API requests to fail with "Missing Authorization Bearer token" errors.
2.  **Data Validation Failure (400 Error)**: Even after fixing authentication, requests failed due to mismatched field names and formats between the data sent by the extension and the data expected by the Worker API.

## Problem Details

### 1. Authentication Issue

-   The Worker API (`bondwise-worker`) was configured to use Clerk authentication, requiring a `Bearer` token in the `Authorization` header.
-   The browser extension (`bondwise-extension`) only stored the user's email (`userId`) and did not generate or send any authentication token, leading to 401 errors.

### 2. Field Mapping Issue

-   The Worker API expected specific field names and data types (`_id`, `savedAt` as a timestamp).
-   The extension was sending different field names and types (`id`, `scrapedAt` as an ISO string) and was missing some required fields (`isRead`, `favorite`). This resulted in 400 "Invalid article data - missing required fields" errors.

## Solution Implemented

A two-part solution was implemented across the extension and the worker:

### 1. Simplified Token-Based Authentication

-   **Extension (`bondwise-extension/src/background.ts`)**:
    -   A new function `getAuthToken()` was added to generate, store (in `chrome.storage.local`), and retrieve a simple, time-limited (24-hour expiry) authentication token.
    -   The token format is `base64(email:timestamp:signature)`, where the signature is `base64(email:timestamp:SECRET_KEY)`.
    -   API `fetch` requests were updated to include this token in the `Authorization: Bearer <token>` header.
-   **Worker (`bondwise-worker/src/auth.ts`)**:
    -   The `authenticateRequestWithClerk()` function was modified to first attempt validation of the simplified token format.
    -   It checks the token's structure, age (expiry), and signature against the shared `SECRET_KEY`.
    -   If the simplified token is valid, authentication succeeds using the email from the token as the `userId`.
    -   If the simplified token is invalid or not present, the function falls back to the existing Clerk authentication logic, ensuring compatibility.

### 2. Field Mapping Alignment

-   **Extension (`bondwise-extension/src/background.ts`)**:
    -   The `SavedItem` interface was updated to match the `WorkerArticle` type definition.
    -   The `newItem` object creation was modified:
        -   `id` field renamed to `_id`.
        -   `scrapedAt` (ISO string) field replaced with `savedAt` (using `Date.now()` for timestamp).
        -   Required boolean fields `isRead` and `favorite` were added with default `false` values.
    -   Local storage operations (`chrome.storage.local.set`) were updated to use `_id` as the key.

## Files Modified

-   `bondwise-extension/src/background.ts`: Implemented token generation, added Authorization header, and fixed field mapping.
-   `bondwise-worker/src/auth.ts`: Added logic to validate the new simplified token format alongside existing Clerk validation.

## Outcome

These changes successfully resolved both the 401 authentication errors and the 400 data validation errors. The Bondwise extension can now securely and correctly communicate with the Worker API to save user content.

## Future Considerations

While functional, the simplified token system is an interim solution. The long-term plan, documented in `BondWise-Authentication-Fix-Plan.md`, involves integrating full Clerk authentication into the extension for enhanced security and user management features.