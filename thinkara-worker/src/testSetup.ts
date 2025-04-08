// thinkara-worker/src/testSetup.ts
// Setup file specifically for worker tests (Miniflare environment)

import { afterAll, afterEach, beforeAll } from "vitest";
// MSW Setup
import { server } from "../../src/mocks/server"; // Correct path to root mocks directory

// Establish API mocking before all tests.
beforeAll(() => server.listen({ onUnhandledRequest: "error" })); // Error on unhandled requests

// Reset any request handlers that we may add during the tests,
// so they don't affect other tests.
afterEach(() => server.resetHandlers());

// Clean up after the tests are finished.
afterAll(() => server.close());
