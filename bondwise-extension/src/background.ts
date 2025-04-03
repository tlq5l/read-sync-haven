import { v4 as uuidv4 } from "uuid"; // For generating unique IDs

// Define the structure for saved items to match Worker's expectations
interface SavedItem {
	_id: string; // Changed from id to _id to match Worker
	url: string;
	title: string;
	content?: string; // Main content for articles
	savedAt: number; // Changed from scrapedAt:string to savedAt:number to match Worker
	type: "article" | "youtube" | "other"; // Add more types later
	userId: string; // Added userId field
	isRead?: boolean;
	favorite?: boolean;
}

// API response interface
interface ApiResponse {
	status: string;
	message: string;
	item?: SavedItem;
	savedAt?: string;
	[key: string]: any; // For any other properties
}

// Function to get or prompt for user ID
async function getUserId(): Promise<string | null> {
	// Try to get stored user ID
	const result = await chrome.storage.local.get(["userId"]);

	if (result.userId) {
		return result.userId;
	}

	// If no stored userId, prompt the user with a notification
	chrome.notifications.create(
		{
			type: "basic",
			iconUrl: "icons/icon128.png",
			title: "BondWise Setup Required",
			message: "Please set your email address to start saving content",
			buttons: [{ title: "Setup Now" }],
		},
		(notificationId) => {
			// Listen for button click
			chrome.notifications.onButtonClicked.addListener((id) => {
				if (id === notificationId) {
					chrome.runtime.openOptionsPage();
				}
			});
		},
	);

	return null;
}

// Function to get or generate authentication token
async function getAuthToken(): Promise<string | null> {
	// First check if we have a valid stored token
	const storedToken = await chrome.storage.local.get([
		"authToken",
		"authTokenExpiry",
	]);

	// Check if token exists and is not expired (24-hour validity)
	if (
		storedToken.authToken &&
		storedToken.authTokenExpiry &&
		Date.now() < storedToken.authTokenExpiry
	) {
		return storedToken.authToken;
	}

	// If no token or expired, get the userId (email)
	const userIdResult = await chrome.storage.local.get(["userId"]);
	if (!userIdResult.userId) {
		console.error("No user ID found. Please set up your email first.");
		return null;
	}

	// Generate a simple token based on user email + timestamp + shared secret
	// Format: base64(email:timestamp:signature)
	// where signature is base64(email:timestamp:SECRET_KEY)
	const timestamp = Date.now();
	const email = userIdResult.userId;
	const SECRET_KEY = "bondwise-secure-key-2025"; // This would be better stored securely

	// Create signature using email and timestamp
	const signatureInput = `${email}:${timestamp}:${SECRET_KEY}`;
	const signature = btoa(signatureInput);

	// Create the final token
	const token = btoa(`${email}:${timestamp}:${signature}`);

	// Store token with 24-hour expiry
	const expiryTime = timestamp + 24 * 60 * 60 * 1000;
	await chrome.storage.local.set({
		authToken: token,
		authTokenExpiry: expiryTime,
	});

	console.log("Generated new authentication token with 24-hour validity");
	return token;
}

// Listen for messages from other parts of the extension (e.g., popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "savePage" && message.tabId) {
		const tabId = message.tabId;
		console.log(`Received savePage action for tabId: ${tabId}`);

		// Inject the content script into the specified tab
		chrome.scripting
			.executeScript({
				target: { tabId: tabId },
				files: ["content.js"], // Correct path relative to extension root (dist/)
			})
			.then(() => {
				console.log("Injected content script.");
				// After injecting, send a message *to the content script* to start scraping
				chrome.tabs.sendMessage(
					tabId,
					{ action: "scrapeContent" },
					async (scrapeResponse) => {
						if (chrome.runtime.lastError) {
							console.error(
								"Error communicating with content script:",
								chrome.runtime.lastError.message,
							);
							sendResponse({
								status: "error",
								message: `Content script error: ${chrome.runtime.lastError.message}`,
							});
							return;
						}

						if (scrapeResponse?.status === "success" && scrapeResponse.data) {
							console.log(
								"Received data from content script:",
								scrapeResponse.data,
							);

							// Get user ID
							const userId = await getUserId();

							if (!userId) {
								sendResponse({
									status: "error",
									message:
										"User ID not set. Please set up your email in the extension options.",
								});
								return;
							}

							const newItem: SavedItem = {
								_id: uuidv4(), // Changed from id to _id
								url: scrapeResponse.data.url,
								title: scrapeResponse.data.title,
								content: scrapeResponse.data.content,
								savedAt: Date.now(), // Changed from scrapedAt (ISO string) to savedAt (timestamp)
								type: scrapeResponse.data.type || "other",
								userId: userId, // Include user ID
								isRead: false, // Added required fields
								favorite: false,
							};
							const workerUrl =
								"https://bondwise-sync-api.vikione.workers.dev/items";

							// --- Try saving to Cloudflare Worker first ---
							let apiSuccess = false;
							// Add detailed logging before the fetch attempt
							console.log("Prepared newItem for API:", JSON.stringify(newItem));
							try {
								console.log(
									`Attempting to POST item to Worker: ${workerUrl}`,
									newItem,
								);
								// Get authentication token
								const token = await getAuthToken();
								if (!token) {
									throw new Error("Failed to generate authentication token");
								}

								console.log("Using authentication token for API request");
								const response = await fetch(workerUrl, {
									method: "POST",
									headers: {
										"Content-Type": "application/json",
										Authorization: `Bearer ${token}`, // Add token to request
									},
									body: JSON.stringify(newItem),
								});

								// Capture full response text for diagnostics
								const responseText = await response.text();
								console.log(
									`Worker API response (${response.status}): ${responseText}`,
								);

								if (!response.ok) {
									throw new Error(
										`API Error (${response.status}): ${responseText}`,
									);
								}

								// Try to parse the response as JSON
								let responseData: ApiResponse | null = null;
								try {
									responseData = JSON.parse(responseText) as ApiResponse;
									console.log(
										"Successfully saved item via Worker API:",
										responseData,
									);
								} catch (parseError) {
									console.warn(
										"Could not parse API response as JSON:",
										responseText,
									);
									console.log(
										"Item saved successfully but response wasn't valid JSON",
									);
								}

								apiSuccess = true;
							} catch (apiError) {
								// Add more detailed logging in the catch block
								console.error("Caught API Error during fetch:", apiError);
								if (apiError instanceof Error) {
									console.error("API Error Name:", apiError.name);
									console.error("API Error Message:", apiError.message);
									console.error("API Error Stack:", apiError.stack);
								}
								// Don't send response yet, try local save first
							}

							// --- Save locally (cache/fallback) regardless of API success for now ---
							// (In a more robust system, you might only save locally if API fails, or sync later)
							try {
								console.log(
									"Attempting to save item to chrome.storage.local:",
									newItem,
								);
								await chrome.storage.local.set({ [newItem._id]: newItem });
								console.log(
									"chrome.storage.local.set completed for ID:",
									newItem._id,
								);
							} catch (localError) {
								console.error("Error saving to local storage:", localError);
								// If API also failed, report local error, otherwise API success takes precedence
								if (!apiSuccess) {
									sendResponse({
										status: "error",
										message: `Local storage error: ${localError instanceof Error ? localError.message : "Unknown error"}`,
									});
									return; // Exit early if both failed
								}
							}

							// --- Send final response ---
							if (apiSuccess) {
								sendResponse({
									status: "success",
									message: "Saved item to cloud storage",
								});
							} else {
								// If API failed but local save might have succeeded (or also failed)
								sendResponse({
									status: "partial",
									message:
										"Failed to save to cloud API. Saved locally as fallback.",
								});
							}

							// --- Save locally (cache/fallback) regardless of API success for now ---
							// (In a more robust system, you might only save locally if API fails, or sync later)
							try {
								console.log(
									"Attempting to save item to chrome.storage.local:",
									newItem,
								);
								await chrome.storage.local.set({ [newItem._id]: newItem });
								console.log(
									"chrome.storage.local.set completed for ID:",
									newItem._id,
								);
							} catch (localError) {
								console.error("Error saving to local storage:", localError);
								// If API also failed, report local error, otherwise API success takes precedence
								if (!apiSuccess) {
									sendResponse({
										status: "error",
										message: `Local storage error: ${localError instanceof Error ? localError.message : "Unknown error"}`,
									});
									return; // Exit early if both failed
								}
							}

							// --- Send final response ---
							if (apiSuccess) {
								sendResponse({
									status: "success",
									message: "Saved item to cloud storage",
								});
							} else {
								// If API failed but local save might have succeeded (or also failed)
								sendResponse({
									status: "partial",
									message:
										"Failed to save to cloud API. Saved locally as fallback.",
								});
							}
						} else {
							console.error(
								"Invalid or error response from content script:",
								scrapeResponse,
							);
							sendResponse({
								status: "error",
								message:
									scrapeResponse?.message ||
									"Invalid response from content script.",
							});
						}
					},
				);
			})
			.catch((error) => {
				console.error("Failed to inject content script:", error);
				sendResponse({
					status: "error",
					message: `Injection failed: ${error.message}`,
				});
			});

		// Return true to indicate that the response will be sent asynchronously
		return true;
	}

	// Handle message to log storage contents
	if (message.action === "logStorage") {
		chrome.storage.local.get(null, (items) => {
			// Get all items
			if (chrome.runtime.lastError) {
				console.error(
					"Error retrieving storage:",
					chrome.runtime.lastError.message,
				);
				sendResponse({
					status: "error",
					message: "Failed to retrieve storage",
				});
			} else {
				console.log("Current chrome.storage.local contents:", items);
				sendResponse({ status: "success" });
			}
		});
		// Return true for async response
		return true;
	}

	// Return false or undefined if not handling the message asynchronously
});

console.log("Background service worker started.");

// Optional: Add listeners for extension installation/update
chrome.runtime.onInstalled.addListener(() => {
	console.log("Bondwise Saver extension installed or updated.");
	// Prompt user to set up their email on install
	chrome.runtime.openOptionsPage();
});
