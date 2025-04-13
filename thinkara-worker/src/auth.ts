import { verifyToken } from "@clerk/backend"; // Use verifyToken directly
import type { JwtPayload } from "@clerk/types";
// No need to import from itty-router if extending the standard Request
import type { ExecutionContext } from "@cloudflare/workers-types";

// Define the shape of the auth state added to the request
export interface RequestAuthState {
	claims: JwtPayload | null; // Store the verified token claims
	userId: string | null; // Convenience accessor for Clerk's 'sub' claim
}

// Define the expected environment variables/secrets for authentication
export interface AuthEnv {
	CLERK_SECRET_KEY: string;
	// Add other secrets/variables if needed by Clerk (e.g., JWKS URL, Issuer)
	// CLERK_JWKS_URL?: string;
	// CLERK_ISSUER?: string;
}

// Extend the standard Request type to include our auth property
// This helps with TypeScript checks in route handlers
export interface AuthenticatedRequest extends Request {
	auth?: RequestAuthState;
}

// Removed unused ClerkClient/getClerkClient code block
/**
 * Middleware to authenticate requests using Clerk JWT.
 * Verifies the Bearer token and attaches auth state to the request.
 * Returns a Response object for auth failures, otherwise allows execution to continue.
 */
export const authenticateRequest = async (
	request: AuthenticatedRequest,
	env: AuthEnv,
	_ctx: ExecutionContext, // Use _ctx if ctx is not needed to avoid unused var linting
): Promise<Response | undefined> => {
	// Replace void with undefined
	const authorizationHeader = request.headers.get("Authorization");

	if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
		return new Response(
			JSON.stringify({ error: "Missing or invalid Authorization header" }),
			{
				status: 401,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	const token = authorizationHeader.substring(7); // Remove "Bearer " prefix

	try {
		if (!env.CLERK_SECRET_KEY) {
			console.error("Missing CLERK_SECRET_KEY in authenticateRequest env.");
			throw new Error("Authentication configuration error.");
		}
		// Call verifyToken directly, providing the secret key
		const claims: JwtPayload = await verifyToken(token, {
			secretKey: env.CLERK_SECRET_KEY,
			// issuer: env.CLERK_ISSUER, // Add issuer if needed
			// other options...
		});

		// Attach authentication data to the request object for downstream use
		// Clerk uses 'sub' (subject) claim for the user ID.
		// Attach claims and userId to the request object
		request.auth = {
			claims: claims,
			userId: claims.sub,
		};

		// In itty-router, returning void (or nothing) allows the middleware chain to continue
	} catch (error: any) {
		console.error("Clerk token verification failed:", error.message || error);
		// Provide a generic error message to the client
		return new Response(
			JSON.stringify({ error: "Unauthorized: Invalid token" }),
			{
				status: 403, // Use 403 Forbidden for valid token format but failed verification
				headers: { "Content-Type": "application/json" },
			},
		);
	}
};

/**
 * Helper function to safely get the user ID from an authenticated request.
 * Throws an error if the request wasn't properly authenticated (should be caught by caller).
 */
export const getUserId = (request: AuthenticatedRequest): string => {
	const userId = request.auth?.userId;
	if (!userId) {
		// This should ideally not happen if authenticateRequest middleware ran successfully
		console.error("getUserId called on a request without valid auth state.");
		throw new Error(
			"Internal server error: User ID not found after authentication.",
		);
	}
	return userId;
};
