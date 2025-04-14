// thinkara-worker/src/testSetup.ts
// Setup file specifically for worker tests (Miniflare environment)

import { afterAll, afterEach, beforeAll, vi } from "vitest"; // Import vi

// MSW Setup
import { server } from "../../src/mocks/server"; // Adjust path if needed (relative to root potentially)

// Establish API mocking before all tests.
beforeAll(() => server.listen({ onUnhandledRequest: "error" })); // Error on unhandled requests

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => {
    server.resetHandlers();
    // No longer need to reset Clerk mock here, it will be managed per-test suite if needed
});

// Clean up after the tests are finished.
afterAll(() => server.close());

// Removed global Clerk mock setup (vi.doMock and mockVerifyToken export)
// Tests will now inject mocks directly if needed.
