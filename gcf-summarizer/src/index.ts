import functions from "@google-cloud/functions-framework";
import {
	GoogleGenerativeAI,
	HarmCategory,
	HarmBlockThreshold,
} from "@google/generative-ai";
import type { HttpFunction } from "@google-cloud/functions-framework";

// Read environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EXPECTED_WORKER_AUTH_KEY = process.env.WORKER_AUTH_KEY;

if (!GEMINI_API_KEY)
	console.error("FATAL: GEMINI_API_KEY environment variable is not set.");
if (!EXPECTED_WORKER_AUTH_KEY)
	console.error("FATAL: WORKER_AUTH_KEY environment variable is not set.");

function authenticateRequest(req: functions.Request): boolean {
	if (!EXPECTED_WORKER_AUTH_KEY) {
		console.error("Auth skipped: WORKER_AUTH_KEY not configured.");
		return false; // Fail closed
	}
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		console.warn("Auth failed: Missing or invalid Authorization header.");
		return false;
	}
	const providedKey = authHeader.split(" ")[1];
	if (providedKey !== EXPECTED_WORKER_AUTH_KEY) {
		console.warn("Auth failed: Invalid token.");
		return false;
	}
	return true;
}

export const summarizeText: HttpFunction = async (req, res) => {
	// CORS
	res.set("Access-Control-Allow-Origin", "*"); // Adjust in production
	res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	if (req.method === "OPTIONS") {
		res.status(204).send("");
		return;
	}

	// Validation & Auth
	if (req.method !== "POST")
		return res.status(405).send({ error: "Method Not Allowed" });
	if (!authenticateRequest(req))
		return res.status(401).send({ error: "Unauthorized" });
	if (!GEMINI_API_KEY)
		return res
			.status(500)
			.send({ error: "Internal Server Error: AI service not configured." });

	const { content } = req.body;
	if (!content || typeof content !== "string")
		return res
			.status(400)
			.send({ error: 'Bad Request: Missing or invalid "content".' });

	// Call Gemini
	try {
		const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
		const model = genAI.getGenerativeModel({
			model: "gemini-1.5-flash-latest",
		});
		const generationConfig = { temperature: 0.7, maxOutputTokens: 2048 };
		const safetySettings = [
			{
				category: HarmCategory.HARM_CATEGORY_HARASSMENT,
				threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
			},
			{
				category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
				threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
			},
			{
				category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
				threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
			},
			{
				category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
				threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
			},
		];
		const prompt = `Summarize the following text concisely:\n\n${content}`;
		const result = await model.generateContent({
			contents: [{ role: "user", parts: [{ text: prompt }] }],
			generationConfig,
			safetySettings,
		});

		// Handle response/errors
		if (!result.response?.candidates?.length) {
			if (result.response?.promptFeedback?.blockReason) {
				console.error(
					`Prompt blocked: ${result.response.promptFeedback.blockReason}`,
				);
				return res
					.status(400)
					.send({
						error: `Content blocked: ${result.response.promptFeedback.blockReason}`,
					});
			}
			console.error("Gemini API returned no candidates:", result.response);
			return res
				.status(500)
				.send({ error: "AI service failed to generate summary." });
		}
		const firstCandidate = result.response.candidates[0];
		if (firstCandidate.finishReason && firstCandidate.finishReason !== "STOP") {
			console.error(
				`Gemini generation stopped: ${firstCandidate.finishReason}`,
				firstCandidate.safetyRatings,
			);
			return res
				.status(400)
				.send({
					error: `Content generation stopped: ${firstCandidate.finishReason}`,
				});
		}
		const summary = firstCandidate.content?.parts[0]?.text;
		if (!summary) {
			console.error("Gemini API returned empty summary.");
			return res
				.status(500)
				.send({ error: "AI service returned empty summary." });
		}

		res.status(200).send({ summary: summary });
	} catch (error) {
		console.error("Error calling Gemini API:", error);
		res.status(500).send({ error: "Internal Server Error." });
	}
};

functions.http("summarizeText", summarizeText);
