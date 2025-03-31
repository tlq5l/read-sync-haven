import type {
	HttpFunction,
	Request,
	Response,
} from "@google-cloud/functions-framework";
import functions from "@google-cloud/functions-framework";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager"; // Import Secret Manager client
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

// Environment variables are now fetched inside the handler using Secret Manager
const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL; // Keep this one if set via deployment env var is okay
if (!AI_GATEWAY_URL)
	console.warn(
		"WARN: AI_GATEWAY_URL environment variable is not set. Calls will go directly to Google.",
	); // Add check

// Define allowed origins
const allowedOrigins = [
	"http://localhost:8080", // Local development
	"https://read-sync-haven.pages.dev", // Cloudflare Pages deployment
];

// Configure CORS middleware
const corsOptions: cors.CorsOptions = {
	origin: (origin, callback) => {
		// Allow requests with no origin (like mobile apps or curl requests)
		if (!origin) return callback(null, true);
		if (allowedOrigins.indexOf(origin) === -1) {
			const msg =
				"The CORS policy for this site does not allow access from the specified Origin.";
			return callback(new Error(msg), false);
		}
		return callback(null, true);
	},
	methods: ["POST", "OPTIONS"], // Allow POST for the function and OPTIONS for preflight
	allowedHeaders: ["Content-Type", "Authorization"], // Allow necessary headers
	credentials: true, // If you need to handle cookies or authorization headers
};

const corsHandler = cors(corsOptions);

// Update function signature to accept API key
const handleSummarizeRequest = async (
	req: Request,
	res: Response,
	geminiApiKey: string,
) => {
	// Validation - Authentication is now handled by Google Cloud IAM based on the token
	if (req.method !== "POST")
		return res.status(405).send({ error: "Method Not Allowed" });
	// Use the passed argument
	if (!geminiApiKey)
		// Check the passed argument
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
		const genAI = new GoogleGenerativeAI(geminiApiKey); // Use the passed argument
		// Remove Cloudflare AI Gateway baseUrl
		const model = genAI.getGenerativeModel(
			{ model: "gemini-2.5-pro-exp-03-25" },
			// No modelOptions with baseUrl needed anymore
		);
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
export const summarizeText: HttpFunction = async (
	req: Request,
	res: Response,
) => {
	// Make async
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

		// Fetch secrets from Secret Manager
		const GEMINI_API_KEY = await accessSecretVersion("gcf-gemini-api-key");
		const WORKER_AUTH_SECRET = await accessSecretVersion(
			"gcf-worker-auth-secret",
		);

		if (!GEMINI_API_KEY || !WORKER_AUTH_SECRET) {
			console.error("Failed to fetch required secrets from Secret Manager.");
			// Avoid sending detailed errors to the client in production
			return res
				.status(500)
				.send({ error: "Internal Server Error: Configuration failed." });
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
			// --- Add Shared Secret Authentication ---
			if (!WORKER_AUTH_SECRET) {
				// Check if secret is configured (should have been caught at startup, but good practice)
				console.error("WORKER_AUTH_SECRET is not configured.");
				return res
					.status(500)
					.send({ error: "Internal Server Error: Auth misconfiguration." });
			}

			const authHeader = req.headers["x-worker-authorization"]; // Case-insensitive lookup
			const expectedToken = `Bearer ${WORKER_AUTH_SECRET}`;

			if (!authHeader || authHeader !== expectedToken) {
				console.warn(
					"Unauthorized attempt: Invalid or missing X-Worker-Authorization header.",
				);
				return res.status(401).send({ error: "Unauthorized" });
			}
			// --- End Authentication ---
			// Authentication passed, proceed with the handler
			try {
				// Pass the fetched API key
				await handleSummarizeRequest(req, res, GEMINI_API_KEY);
			} catch (error) {
				console.error("Error in handleSummarizeRequest:", error);
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
