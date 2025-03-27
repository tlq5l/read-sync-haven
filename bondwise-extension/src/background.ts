import { v4 as uuidv4 } from "uuid"; // For generating unique IDs

// Define the structure for saved items
interface SavedItem {
	id: string;
	url: string;
	title: string;
	content?: string; // Main content for articles
	scrapedAt: string;
	type: "article" | "youtube" | "other"; // Add more types later
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
							const newItem: SavedItem = {
								id: uuidv4(),
								url: scrapeResponse.data.url,
								title: scrapeResponse.data.title,
								content: scrapeResponse.data.content,
								scrapedAt: new Date().toISOString(),
								type: scrapeResponse.data.type || "other",
							};

							const workerUrl =
								"https://bondwise-sync-api.vikione.workers.dev/items";

							// --- Try saving to Cloudflare Worker first ---
							let apiSuccess = false;
							try {
								console.log(
									`Attempting to POST item to Worker: ${workerUrl}`,
									newItem,
								);
								const response = await fetch(workerUrl, {
									method: "POST",
									headers: {
										"Content-Type": "application/json",
									},
									body: JSON.stringify(newItem),
								});

								if (!response.ok) {
									const errorText = await response.text();
									throw new Error(
										`API Error (${response.status}): ${errorText}`,
									);
								}

								const responseData = await response.json();
								console.log(
									"Successfully saved item via Worker API:",
									responseData,
								);
								apiSuccess = true;
							} catch (apiError) {
								console.error("Error saving item via Worker API:", apiError);
								// Don't send response yet, try local save first
							}

							// --- Save locally (cache/fallback) regardless of API success for now ---
							// (In a more robust system, you might only save locally if API fails, or sync later)
							try {
								console.log(
									"Attempting to save item to chrome.storage.local:",
									newItem,
								);
								await chrome.storage.local.set({ [newItem.id]: newItem });
								console.log(
									"chrome.storage.local.set completed for ID:",
									newItem.id,
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
								sendResponse({ status: "success" });
							} else {
								// If API failed but local save might have succeeded (or also failed)
								sendResponse({
									status: "error",
									message: "Failed to save to API. Saved locally (maybe).", // Inform user API failed
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
	// Perform any setup tasks here if needed
});
