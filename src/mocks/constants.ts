// src/mocks/constants.ts

/**
 * A consistent mock JWT token for use across tests and MSW handlers.
 */
export const MOCK_CLERK_TOKEN = "mock-clerk-jwt-token";

/**
 * Base URL for the production worker API used in MSW handlers.
 */
export const WORKER_BASE_URL = "https://bondwise-sync-api.vikione.workers.dev";

/**
 * Default mock summary response.
 */
export const MOCK_SUMMARY = "This is a mock summary.";

/**
 * Default mock chat response.
 */
export const MOCK_CHAT_RESPONSE = "This is a mock AI chat response.";
