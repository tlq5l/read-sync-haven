import type {
	HttpFunction,
	Request,
	Response,
} from "@google-cloud/functions-framework";
import functions from "@google-cloud/functions-framework";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import {
	GoogleGenerativeAI,
	HarmBlockThreshold,
	HarmCategory,
} from "@google/generative-ai";
import cors from "cors";

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();
const projectNumber = "98706481155"; // Your Google Cloud Project Number

// Helper function to access secrets
async function accessSecretVersion(secretName: string): Promise<string | null> {
	try {
		const [version] = await secretClient.accessSecretVersion({
			name: `projects/${projectNumber}/secrets/${secretName}/versions/latest`,
		});
		const payload = version.payload?.data?.toString();
		if (!payload) {
			console.error(`Secret payload is empty for ${secretName}`);
			return null;
		}
		return payload;
	} catch (error) {
		console.error(`Error accessing secret ${secretName}:`, error);
		return null;
	}
}

// Define allowed origins (adjust if needed for chat function)
const allowedOrigins = [
	"http://localhost:8080", // Local development
	"https://read-sync-haven.pages.dev", // Cloudflare Pages deployment
];

// Configure CORS middleware
const corsOptions: cors.CorsOptions = {
	origin: (origin, callback) => {
		if (!origin) return callback(null, true);
		if (allowedOrigins.indexOf(origin) === -1) {
			const msg =
				"The CORS policy for this site does not allow access from the specified Origin.";
			return callback(new Error(msg), false);
		}
		return callback(null, true);
	},
	methods: ["POST", "OPTIONS"],
	allowedHeaders: ["Content-Type", "Authorization", "X-Worker-Authorization"], // Ensure X-Worker-Authorization is allowed
	credentials: true,
};

const corsHandler = cors(corsOptions);

// Function to handle the chat request
const handleChatRequest = async (
	req: Request,
	res: Response,
	geminiApiKey: string,
) => {
	// Validation
	if (req.method !== "POST")
		return res.status(405).send({ error: "Method Not Allowed" });
	if (!geminiApiKey)
		return res
			.status(500)
			.send({ error: "Internal Server Error: AI service not configured." });

	const { content, message } = req.body; // Expect content and message
	if (!content || typeof content !== "string")
		return res
			.status(400)
			.send({ error: 'Bad Request: Missing or invalid "content".' });
	if (!message || typeof message !== "string")
		return res
			.status(400)
			.send({ error: 'Bad Request: Missing or invalid "message".' });

	// Call Gemini
	try {
		const genAI = new GoogleGenerativeAI(geminiApiKey);
		// Remove Cloudflare AI Gateway baseUrl
		const model = genAI.getGenerativeModel(
			{ model: "gemini-2.5-pro-exp-03-25" }, // Using flash for potentially faster responses
			// No baseUrl option needed
		);
		const generationConfig = { temperature: 0.7, maxOutputTokens: 2048 }; // Adjust as needed
		const safetySettings = [
			// Keep safety settings
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

		// Construct the prompt for chat with context
		const prompt = `Based on the following text content, answer the user's question.
--- TEXT CONTENT START ---
${content}
--- TEXT CONTENT END ---

User Question: ${message}

Answer:`;

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
				.send({ error: "AI service failed to generate chat response." });
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
		const aiResponse = firstCandidate.content?.parts[0]?.text;
		if (!aiResponse) {
			console.error("Gemini API returned empty response.");
			return res
				.status(500)
				.send({ error: "AI service returned empty response." });
		}

		// Return the AI's response
		res.status(200).send({ response: aiResponse }); // Changed 'summary' to 'response'
	} catch (error) {
		console.error("Error calling Gemini API for chat:", error);
		res
			.status(500)
			.send({ error: "Internal Server Error during chat generation." });
	}
};

// Main exported function, handles CORS preflight and then the request
export const chatWithContent: HttpFunction = async (
	// Renamed function
	req: Request,
	res: Response,
) => {
	corsHandler(req, res, async (err?: any) => {
		if (err) {
			console.error("CORS error:", err);
			if (!res.headersSent) {
				res.status(500).send({ error: "CORS configuration error." });
			}
			return;
		}

		// Fetch secrets from Secret Manager
		const GEMINI_API_KEY = await accessSecretVersion("gcf-gemini-api-key");
		const WORKER_AUTH_SECRET = await accessSecretVersion(
			"gcf-worker-auth-secret",
		);

		if (!GEMINI_API_KEY || !WORKER_AUTH_SECRET) {
			console.error("Failed to fetch required secrets from Secret Manager.");
			return res
				.status(500)
				.send({ error: "Internal Server Error: Configuration failed." });
		}

		if (req.method === "OPTIONS" && res.headersSent) {
			return;
		}

		if (req.method === "POST") {
			// --- Shared Secret Authentication ---
			const authHeader = req.headers["x-worker-authorization"];
			const expectedToken = `Bearer ${WORKER_AUTH_SECRET}`;

			if (!authHeader || authHeader !== expectedToken) {
				console.warn(
					"Unauthorized attempt: Invalid or missing X-Worker-Authorization header.",
				);
				return res.status(401).send({ error: "Unauthorized" });
			}
			// --- End Authentication ---

			try {
				await handleChatRequest(req, res, GEMINI_API_KEY); // Call the chat handler
			} catch (error) {
				console.error("Error in handleChatRequest:", error);
				if (!res.headersSent) {
					res.status(500).send({ error: "Internal Server Error." });
				}
			}
		} else if (!res.headersSent) {
			res.status(405).send({ error: "Method Not Allowed" });
		}
	});
};

// Register the function with the Functions Framework
functions.http("chatWithContent", chatWithContent); // Use the new function name
