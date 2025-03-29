import type {
	HttpFunction,
	Request,
	Response,
} from "@google-cloud/functions-framework";
import functions from "@google-cloud/functions-framework";
import {
	GoogleGenerativeAI,
	HarmBlockThreshold,
	HarmCategory,
} from "@google/generative-ai";
import cors from "cors";

// Read environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY)
	console.error("FATAL: GEMINI_API_KEY environment variable is not set.");

// Initialize CORS middleware
// TODO: Restrict origin in production to your frontend's domain
const corsHandler = cors({ origin: true });

const handleSummarizeRequest: HttpFunction = async (req, res) => {
	// Validation - Authentication is now handled by Google Cloud IAM based on the token
	if (req.method !== "POST")
		return res.status(405).send({ error: "Method Not Allowed" });
	// Removed custom authentication check
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
				return res.status(400).send({
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
			return res.status(400).send({
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

// Main exported function, handles CORS preflight and then the request
export const summarizeText: HttpFunction = (req: Request, res: Response) => {
	// Run CORS middleware first
	corsHandler(req, res, async (err?: any) => {
		if (err) {
			console.error("CORS error:", err);
			// Ensure response is sent even on CORS error if headers not sent
			if (!res.headersSent) {
				res.status(500).send({ error: "CORS configuration error." });
			}
			return;
		}

		// If it's a preflight (OPTIONS) request, CORS middleware handles it,
		// and we don't need to proceed further. Check if headers were sent.
		if (req.method === "OPTIONS" && res.headersSent) {
			// Preflight handled by cors middleware.
			// Note: Sometimes cors middleware might not automatically end the response.
			// If issues persist, uncomment the next line:
			// res.status(204).send('');
			return;
		}

		// If it's not OPTIONS or if CORS middleware didn't end the response,
		// proceed with the actual request handling for POST.
		if (req.method === "POST") {
			try {
				await handleSummarizeRequest(req, res);
			} catch (error) {
				console.error("Error in handleSummarizeRequest:", error);
				if (!res.headersSent) {
					res.status(500).send({ error: "Internal Server Error." });
				}
			}
		} else if (!res.headersSent) {
			// Handle methods other than POST and OPTIONS if not already handled
			res.status(405).send({ error: "Method Not Allowed" });
		}
	});
};

functions.http("summarizeText", summarizeText);
