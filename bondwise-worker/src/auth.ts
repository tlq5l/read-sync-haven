// bondwise-worker/src/auth.ts

import { createClerkClient } from "@clerk/backend";
import type { Env, AuthResult } from "./types";
import { errorResponse } from "./utils"; // Import errorResponse helper

/**
 * Authenticates an incoming request using Clerk backend SDK.
 * Verifies the Authorization Bearer token.
 *
 * @param request - The incoming Request object.
 * @param env - The worker environment variables and bindings.
 * @returns An AuthResult object indicating success (with userId) or error (with Response).
 */
export async function authenticateRequestWithClerk(
	request: Request,
	env: Env,
): Promise<AuthResult> {
	const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
	try {
		// Check for Authorization header before calling Clerk
		const authHeader = request.headers.get("Authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			console.warn("Authentication failed: Missing Authorization Bearer token.");
			return {
				status: "error",
				response: errorResponse("Missing Authorization Bearer token", 401),
			};
		}

		// Use Clerk's robust request authentication
		const requestState = await clerk.authenticateRequest(request, {
			secretKey: env.CLERK_SECRET_KEY,
			publishableKey: env.CLERK_PUBLISHABLE_KEY,
		});

		if (requestState.status !== "signed-in") {
			console.warn(
				`Clerk authentication failed: ${requestState.reason || "Unknown reason"}`,
			);
			return {
				status: "error",
				response: errorResponse(
					`Authentication failed: ${requestState.reason || "Invalid session"}`,
					401,
				),
			};
		}

		const userId = requestState.toAuth().userId;
		if (!userId) {
			console.error("Clerk authentication succeeded but userId is missing.");
			return {
				status: "error",
				response: errorResponse(
					"Authentication succeeded but user ID could not be determined.",
					500, // Internal server error seems more appropriate
				),
			};
		}

		console.log(`Clerk token verified successfully for user: ${userId}`);
		return { status: "success", userId: userId };
	} catch (clerkError: any) {
		console.error("Clerk token verification failed:", clerkError);
		// Check if the error is specifically about the header format/missing token
		let message = "Invalid or expired session token";
		if (clerkError.message?.includes("header")) {
			message = "Invalid Authorization header format or token.";
		} else if (clerkError.message) {
			// Use Clerk's error message if available and not header-related
			message = clerkError.message;
		}

		return {
			status: "error",
			response: errorResponse(message, 401, clerkError.message), // Include original error in details
		};
	}
}