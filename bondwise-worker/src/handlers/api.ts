// bondwise-worker/src/handlers/api.ts

import { authenticateRequestWithClerk } from "../auth"; // Import auth function
import type { Env } from "../types";
import { errorResponse, jsonResponse } from "../utils";

/**
 * Handles POST /api/summarize requests.
 */
export async function handleSummarize(
	request: Request,
	env: Env,
): Promise<Response> {
	console.log("Processing /api/summarize request...");
	console.log(
		"[handleSummarize] Received env:",
		JSON.stringify(Object.keys(env)),
	); // Log keys to check presence
	try {
		// Authentication is required
		const authResult = await authenticateRequestWithClerk(request, env);
		if (authResult.status === "error") return authResult.response;

		const gcfUrl = env.GCF_SUMMARIZE_URL;
		if (!gcfUrl)
			return errorResponse(
				"AI summarization service URL is not configured.",
				503,
			);
		if (!env.GCF_AUTH_SECRET)
			return errorResponse(
				"Worker is missing configuration for backend authentication.",
				500,
			);

		const { content } = (await request.json()) as { content?: string };
		if (!content)
			return errorResponse("Missing 'content' in request body", 400);

		console.log(`Calling Summarize GCF at ${gcfUrl} with shared secret...`);
		const gcfResponse = await fetch(gcfUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Worker-Authorization": `Bearer ${env.GCF_AUTH_SECRET}`,
			},
			body: JSON.stringify({ content: content }),
		});

		if (!gcfResponse.ok) {
			const errorBody = await gcfResponse.text();
			console.error(
				`Summarize GCF call failed with status ${gcfResponse.status}: ${errorBody}`,
			);
			let errorMessage = `Summarization service request failed (Status: ${gcfResponse.status})`;
			try {
				errorMessage = JSON.parse(errorBody).error || errorMessage;
			} catch (e) {
				/* ignore parsing error */
			}
			return errorResponse(
				errorMessage,
				gcfResponse.status === 401 ? 401 : 502,
			);
		}

		const gcfResult = (await gcfResponse.json()) as { summary?: string };
		if (!gcfResult.summary)
			return errorResponse(
				"Summarization service returned an invalid response.",
				502,
			);

		console.log("Successfully processed /api/summarize request.");
		return jsonResponse({ status: "success", summary: gcfResult.summary });
	} catch (error: any) {
		console.error("Error processing /api/summarize:", error);
		if (error instanceof SyntaxError) {
			return errorResponse("Invalid JSON format in request body", 400);
		}
		return errorResponse(
			error.message || "Internal worker error processing summary request.",
			500,
		);
	}
}

/**
 * Handles POST /api/chat requests.
 */
export async function handleChat(
	request: Request,
	env: Env,
): Promise<Response> {
	console.log("Processing /api/chat request...");
	console.log("[handleChat] Received env:", JSON.stringify(Object.keys(env))); // Log keys to check presence
	try {
		// Authentication is required
		const authResult = await authenticateRequestWithClerk(request, env);
		if (authResult.status === "error") return authResult.response;

		const gcfChatUrl = env.GCF_CHAT_URL;
		if (!gcfChatUrl)
			return errorResponse("AI chat service URL is not configured.", 503);
		if (!env.GCF_AUTH_SECRET)
			return errorResponse(
				"Worker is missing configuration for backend authentication.",
				500,
			);

		const { content, message } = (await request.json()) as {
			content?: string;
			message?: string;
		};
		if (!content || !message)
			return errorResponse(
				"Missing 'content' or 'message' in request body",
				400,
			);

		console.log(`Calling Chat GCF at ${gcfChatUrl} with shared secret...`);
		const gcfResponse = await fetch(gcfChatUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Worker-Authorization": `Bearer ${env.GCF_AUTH_SECRET}`,
			},
			body: JSON.stringify({ content: content, message: message }),
		});

		if (!gcfResponse.ok) {
			const errorBody = await gcfResponse.text();
			console.error(
				`Chat GCF call failed with status ${gcfResponse.status}: ${errorBody}`,
			);
			let errorMessage = `Chat service request failed (Status: ${gcfResponse.status})`;
			try {
				errorMessage = JSON.parse(errorBody).error || errorMessage;
			} catch (e) {
				/* ignore */
			}
			return errorResponse(
				errorMessage,
				gcfResponse.status === 401 ? 401 : 502,
			);
		}

		const gcfResult = (await gcfResponse.json()) as { response?: string };
		if (!gcfResult.response)
			return errorResponse("Chat service returned an invalid response.", 502);

		console.log("Successfully processed /api/chat request.");
		return jsonResponse({ status: "success", response: gcfResult.response });
	} catch (error: any) {
		console.error("Error processing /api/chat:", error);
		if (error instanceof SyntaxError) {
			return errorResponse("Invalid JSON format in request body", 400);
		}
		return errorResponse(
			error.message || "Internal worker error processing chat request.",
			500,
		);
	}
}
