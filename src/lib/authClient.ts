import { createAuthClient } from "better-auth/react";
// We might need to import specific plugins later, e.g.:
// import { oauthPlugin } from "better-auth/plugins/generic-oauth/client"; // Hypothetical client-side plugin import

// Import Better Auth configuration from environment variables
// const clientId = import.meta.env.VITE_BETTER_AUTH_CLIENT_ID; // Keep for potential plugin config later
const domain = import.meta.env.VITE_BETTER_AUTH_DOMAIN;

// Removed clientId check as it's not a direct option
// if (!clientId) {
//   throw new Error(
//     "Missing VITE_BETTER_AUTH_CLIENT_ID environment variable. " +
//     "Ensure it is set in your .env file."
//   );
// }
if (!domain) {
	throw new Error(
		"Missing VITE_BETTER_AUTH_DOMAIN environment variable. " +
			"Ensure it is set in your .env file.",
	);
}

// Initialize the Better Auth client
export const authClient = createAuthClient({
	// Use domain for baseURL
	baseURL: domain,
	// plugins array: We'll add configured plugins here later (e.g., for OAuth)
	// plugins: [
	//   oauthPlugin({ // Hypothetical plugin usage
	//     clientId: clientId,
	//     redirectUri: window.location.origin + "/callback",
	//     // ... other plugin options
	//   })
	// ],
	// Other ClientOptions like fetchOptions, basePath can be added if needed
});

// Type helper for convenience (Optional, based on library structure)
// export type AuthClient = typeof authClient;
