// bondwise-worker/src/auth.ts

import { createClerkClient } from "@clerk/backend";
import type { AuthResult, Env } from "./types";
import { errorResponse } from "./utils"; // Import errorResponse helper

/**
 * Authenticates an incoming request using Clerk backend SDK.
 * Verifies the Authorization Bearer token.
 *
 * @param request - The incoming Request object.
 * @param env - The worker environment variables and bindings.
 * @returns An AuthResult object indicating success (with userId) or error (with Response).
 */
/**
 * Authenticates an incoming request using Clerk or simplified token.
 */
export async function authenticateRequestWithClerk(
	request: Request,
	env: Env,
): Promise<AuthResult> {
	// Check for Authorization header
	const authHeader = request.headers.get("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		console.warn("Authentication failed: Missing Authorization Bearer token.");
		return {
			status: "error",
			response: errorResponse("Missing Authorization Bearer token", 401),
		};
	}

	const token = authHeader.substring(7); // Remove "Bearer " prefix

	// First try to validate as a simplified token
	try {
		const decodedToken = atob(token);
		const tokenParts = decodedToken.split(":");

		if (tokenParts.length === 3) {
			const [email, timestamp, signature] = tokenParts;

			// Verify the token isn't too old (24 hour validity)
			const tokenAge = Date.now() - Number(timestamp);
			if (tokenAge > 24 * 60 * 60 * 1000) {
				console.warn("Simplified token is expired");
				return {
					status: "error",
					response: errorResponse("Token expired", 401),
				};
			}

			// Decode and verify signature
			try {
				const decodedSignature = atob(signature);
				const signatureParts = decodedSignature.split(":");

				if (signatureParts.length === 3) {
					const [sigEmail, sigTimestamp, secret] = signatureParts;

					// Verify all parts match and secret is correct
					if (
						sigEmail === email &&
						sigTimestamp === timestamp &&
						secret === "bondwise-secure-key-2025"
					) {
						console.log(
							`Simplified token authentication successful for: ${email}`,
						);
						return { status: "success", userId: email };
					}
				}
			} catch (e) {
				// Signature decode failed, continue to Clerk auth
				console.log(
					"Simplified token signature validation failed, trying Clerk",
				);
			}
		}
	} catch (e) {
		// Token decode failed, continue to Clerk auth
		console.log("Simplified token format invalid, trying Clerk");
	}

	// If simplified token validation fails, try Clerk authentication
	const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
	try {
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
