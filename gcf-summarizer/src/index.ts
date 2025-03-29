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

// Wrap the main handler with CORS
export const summarizeText: HttpFunction = (req: Request, res: Response) => {
	corsHandler(req, res, () => {
		handleSummarizeRequest(req, res).catch((err: unknown) => {
			console.error("Unhandled error in handleSummarizeRequest:", err);
			if (!res.headersSent) {
				res.status(500).send({ error: "Internal Server Error." });
			}
		});
	});
};

functions.http("summarizeText", summarizeText);
