import React, { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Create a QueryClient instance specifically for tests
// We create it once here to be shared across tests using this wrapper
const testQueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: false, // Disable retries for tests
			gcTime: Number.POSITIVE_INFINITY, // Prevent garbage collection during tests
		},
	},
});

// Define and export the wrapper component
export function QueryClientWrapper({ children }: { children: ReactNode }): JSX.Element {
	return (
		<QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
	);
}

// Function to get the client instance if needed directly in tests (e.g., for clearing)
export function getTestQueryClient(): QueryClient {
	return testQueryClient;
}