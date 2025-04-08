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
	type GenerateContentResult, // Import type for better logging
} from "@google/generative-ai";
import cors from "cors";

// Initialize Secret Manager client
const secretClient = new SecretManagerServiceClient();
const projectNumber = "98706481155"; // Your Google Cloud Project Number

// Helper function to access secrets
async function accessSecretVersion(secretName: string): Promise<string | null> {
	console.log(`Attempting to access secret: ${secretName}`); // LOG: Secret access start
	try {
		const [version] = await secretClient.accessSecretVersion({
			name: `projects/${projectNumber}/secrets/${secretName}/versions/latest`,
		});
		const payload = version.payload?.data?.toString();
		if (!payload) {
			console.error(`Secret payload is empty for ${secretName}`);
			return null;
		}
		console.log(`Successfully accessed secret: ${secretName}`); // LOG: Secret access success
		return payload;
	} catch (error) {
		console.error(`Error accessing secret ${secretName}:`, error); // Keep existing log
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
	origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
		if (!origin) {
			console.log("CORS: Allowing request with no origin.");
			return callback(null, true);
		}
		if (allowedOrigins.indexOf(origin) === -1) {
			const msg =
				`CORS policy rejection: Origin "${origin}" not allowed.`;
			console.error(msg); // LOG: CORS rejection
			return callback(new Error(msg), false);
		}
		console.log(`CORS: Allowing origin: ${origin}`); // LOG: CORS success
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
	// Validation already logged at entry point
	if (req.method !== "POST") {
		console.error(`Invalid method: ${req.method}`); // LOG: Invalid method
		return res.status(405).send({ error: "Method Not Allowed" });
    }
	// API key presence checked at entry

	const { content, message } = req.body; // Req body already logged at entry
	if (!content || typeof content !== "string") {
		console.error("Bad Request: Missing or invalid 'content'. Received:", content); // LOG: Invalid content
		return res
			.status(400)
			.send({ error: 'Bad Request: Missing or invalid "content".' });
    }
	if (!message || typeof message !== "string") {
        console.error("Bad Request: Missing or invalid 'message'. Received:", message); // LOG: Invalid message
		return res
			.status(400)
			.send({ error: 'Bad Request: Missing or invalid "message".' });
    }

	// Call Gemini
	try {
		const genAI = new GoogleGenerativeAI(geminiApiKey);
		const model = genAI.getGenerativeModel(
			{ model: "gemini-2.5-pro-exp-03-25" }, // Using flash for potentially faster responses
		);
		const generationConfig = { temperature: 0.7, maxOutputTokens: 2048 }; // Adjust as needed
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

		// Construct the prompt for chat with context
		const prompt = `Based on the following text content, answer the user's question.
--- TEXT CONTENT START ---
${content}
--- TEXT CONTENT END ---

User Question: ${message}

Answer:`;
        console.log('AI Request Payload (Prompt):', prompt); // LOG: AI Request Payload

        let result: GenerateContentResult;
        try {
            result = await model.generateContent({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig,
                safetySettings,
            });
            console.log('Raw AI Response:', JSON.stringify(result, null, 2)); // LOG: Raw AI Response
        } catch (aiError) {
            console.error("Error during model.generateContent call:", aiError); // LOG: Specific AI call error
            return res.status(500).send({ error: "AI service call failed." });
        }


		// Handle response/errors
		if (!result.response?.candidates?.length) {
			if (result.response?.promptFeedback?.blockReason) {
				const blockReason = result.response.promptFeedback.blockReason;
				console.error(
					`Prompt blocked by AI safety settings: ${blockReason}`, // Enhanced log
					result.response.promptFeedback // Log details
				);
				return res.status(400).send({
					error: `Content blocked due to safety settings: ${blockReason}`,
				});
			}
			console.error("Gemini API returned no candidates. Full response:", JSON.stringify(result.response, null, 2)); // Enhanced log
			return res
				.status(500)
				.send({ error: "AI service failed to generate chat response (no candidates)." });
		}
		const firstCandidate = result.response.candidates[0];
		if (firstCandidate.finishReason && firstCandidate.finishReason !== "STOP") {
            const finishReason = firstCandidate.finishReason;
			console.error(
				`Gemini generation stopped unexpectedly. Reason: ${finishReason}`, // Enhanced log
				"Safety Ratings:", firstCandidate.safetyRatings // Log safety ratings
			);
			return res.status(400).send({
				error: `Content generation stopped unexpectedly: ${finishReason}`,
			});
		}
		const aiResponse = firstCandidate.content?.parts[0]?.text;
		if (!aiResponse) {
			console.error("Gemini API returned empty text in the response candidate. Candidate details:", JSON.stringify(firstCandidate, null, 2)); // Enhanced log
			return res
				.status(500)
				.send({ error: "AI service returned empty response content." });
		}

		// Prepare final response
        const finalResponse = {
            choices: [
                {
                    message: {
                        role: "assistant",
                        content: aiResponse,
                    },
                },
            ],
        };

        console.log('Formatted Response to Client:', JSON.stringify(finalResponse, null, 2)); // LOG: Formatted Response

		// Return the AI's response in OpenAI-compatible format
		res.status(200).send(finalResponse);

	} catch (error) {
		// General catch block for handleChatRequest
		console.error("Unhandled Error in handleChatRequest:", error); // Enhanced log
		if (!res.headersSent) { // Check if headers already sent
		    res
			    .status(500)
			    .send({ error: "Internal Server Error during chat generation." });
        }
	}
};

// Main exported function, handles CORS preflight and then the request
export const chatWithContent: HttpFunction = async (
	req: Request,
	res: Response,
) => {
	console.log('GCF chatWithContent Entry Triggered. Method:', req.method); // LOG: Function Entry

	corsHandler(req, res, async (err?: any) => {
		if (err) {
			console.error("CORS check failed:", err.message); // Log CORS error message specifically
			if (!res.headersSent) {
				res.status(500).send({ error: "CORS configuration error." });
			}
			return;
		}
        console.log("CORS check passed."); // LOG: CORS Pass

        // Handle OPTIONS preflight after CORS middleware
		if (req.method === "OPTIONS") {
            console.log("Handling OPTIONS request (preflight)."); // LOG: OPTIONS Request
			// CORS headers are already set by corsHandler
			res.status(204).send(); // No Content
			return;
		}

		// Fetch secrets from Secret Manager *after* CORS and OPTIONS checks
		let GEMINI_API_KEY: string | null = null;
		let WORKER_AUTH_SECRET: string | null = null;
		try {
			GEMINI_API_KEY = await accessSecretVersion("gcf-gemini-api-key");
			WORKER_AUTH_SECRET = await accessSecretVersion(
				"gcf-worker-auth-secret",
			);
		} catch (secretError) {
			console.error("Critical error fetching secrets:", secretError); // LOG: Critical Secret Error
			if (!res.headersSent) {
				return res.status(500).send({ error: "Internal Server Error: Failed to load configuration." });
			}
			return; // Stop execution if secrets can't be fetched
		}


		if (!GEMINI_API_KEY || !WORKER_AUTH_SECRET) {
			console.error("Failed to fetch required secrets from Secret Manager. Check GCF permissions and secret names/versions."); // Enhanced log
			return res
				.status(500)
				.send({ error: "Internal Server Error: Configuration failed (secrets missing)." }); // More specific error
		}
        console.log("Successfully fetched required secrets."); // LOG: Secrets fetched


		if (req.method === "POST") {
            // Log request body only for POST requests after secrets are fetched
            console.log('GCF Chat Entry - Request Body:', JSON.stringify(req.body || {}, null, 2)); // LOG: GCF Chat Entry Body

			// --- Shared Secret Authentication ---
			const authHeader = req.headers["x-worker-authorization"];
			const expectedToken = `Bearer ${WORKER_AUTH_SECRET}`;
            console.log('Auth Check: Received Header:', authHeader ? 'Present' : 'Missing'); // LOG: Auth Header Presence
            // Avoid logging the actual token unless debugging auth specifically
            // console.log('Auth Check: Expected Token:', expectedToken);

			if (!authHeader || authHeader !== expectedToken) {
				console.warn(
					"Unauthorized attempt: Invalid or missing X-Worker-Authorization header.",
                    'Received:', authHeader // Log received value for debugging
				); // Enhanced log
				return res.status(401).send({ error: "Unauthorized" });
			}
            console.log("Authentication successful."); // LOG: Auth Success
			// --- End Authentication ---

			try {
                console.log("Calling handleChatRequest..."); // LOG: Calling handler
				await handleChatRequest(req, res, GEMINI_API_KEY); // Call the chat handler
                console.log("handleChatRequest finished."); // LOG: Handler finished
			} catch (error) {
				console.error("Error caught after calling handleChatRequest in main function:", error); // Enhanced log
				if (!res.headersSent) {
					res.status(500).send({ error: "Internal Server Error after handling request." });
				}
			}
		} else {
            // Method not POST or OPTIONS (already handled)
            console.warn(`Method Not Allowed: Received ${req.method}`); // LOG: Method Not Allowed (Warn)
            if (!res.headersSent) {
			    res.status(405).send({ error: "Method Not Allowed" });
            }
        }
	});
};

// Register the function with the Functions Framework
functions.http("chatWithContent", chatWithContent); // Use the new function name
console.log("GCF chatWithContent function registered."); // LOG: Function Registration
