// thinkara-worker/src/auth.ts

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
	console.log("[WorkerAuth] authenticateRequestWithClerk: Entry");
	// Check for Authorization header
	const authHeader = request.headers.get("Authorization");
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		console.warn(
			"[WorkerAuth] Authentication failed: Missing or invalid Authorization Bearer header.",
		);
		return {
			status: "error",
			response: errorResponse("Missing Authorization Bearer token", 401),
		};
	}

	const token = authHeader.substring(7);
	console.log(
		"[WorkerAuth] Extracted token:",
		token ? `${token.substring(0, 10)}...` : "null/empty",
	); // Log prefix only

	// First try to validate as a simplified token
	console.log("[WorkerAuth] Attempting simplified token validation...");
	try {
		const decodedToken = atob(token);
		const tokenParts = decodedToken.split(":");

		if (tokenParts.length === 3) {
			const [email, timestamp, signature] = tokenParts;

			// Verify the token isn't too old (24 hour validity)
			const tokenAge = Date.now() - Number(timestamp);
			if (tokenAge > 24 * 60 * 60 * 1000) {
				console.warn("[WorkerAuth] Simplified token is expired.");
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
						secret === "thinkara-secure-key-2025"
					) {
						console.log(
							`[WorkerAuth] Simplified token authentication SUCCESS for: ${email}`,
						);
						return { status: "success", userId: email };
					}
					console.log(
						"[WorkerAuth] Simplified token signature mismatch or incorrect secret.",
					);
				}
			} catch (e) {
				// Simplified token signature decode failed
				console.log(
					"[WorkerAuth] Simplified token signature validation failed (decode error), trying Clerk.",
					e,
				);
			}
		}
	} catch (e) {
		// Simplified token format/decode failed
		console.log(
			"[WorkerAuth] Simplified token format invalid or decode error, trying Clerk.",
			e,
		);
	}

	// If simplified token validation fails, try Clerk authentication
	console.log("[WorkerAuth] Attempting Clerk SDK authentication...");
	const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
	try {
		// Log keys just before use for debugging
		console.log(
			`[WorkerAuth] Using Publishable Key: ${env.CLERK_PUBLISHABLE_KEY}`,
		);
		console.log(
			`[WorkerAuth] Using Secret Key: ${env.CLERK_SECRET_KEY ? "Exists" : "MISSING!"}`,
		);
		// Use Clerk's robust request authentication
		const requestState = await clerk.authenticateRequest(request, {
			secretKey: env.CLERK_SECRET_KEY,
			publishableKey: env.CLERK_PUBLISHABLE_KEY,
			clockSkewInMs: 300000, // Increase tolerance for clock skew (5 minutes)
		});

		if (requestState.status !== "signed-in") {
			console.warn(
				`[WorkerAuth] Clerk authentication FAILED: Status=${requestState.status}, Reason=${requestState.reason || "Unknown reason"}`,
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
			console.error(
				"[WorkerAuth] Clerk authentication succeeded but userId is MISSING in auth state.",
			);
			return {
				status: "error",
				response: errorResponse(
					"Authentication succeeded but user ID could not be determined.",
					500, // Internal server error seems more appropriate
				),
			};
		}

		console.log(
			`[WorkerAuth] Clerk token verification SUCCESS for user: ${userId}`,
		);
		return { status: "success", userId: userId };
	} catch (clerkError: any) {
		console.error(
			"[WorkerAuth] Clerk token verification threw an ERROR:",
			clerkError,
		);
		// Determine specific error message
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
