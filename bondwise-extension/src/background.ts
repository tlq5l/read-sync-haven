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

						// Save the data using chrome.storage.local
						try {
							console.log("Attempting to save item to chrome.storage.local:", newItem);
							await chrome.storage.local.set({ [newItem.id]: newItem });
							console.log("chrome.storage.local.set completed for ID:", newItem.id);
							// Verify save (optional but good for debugging)
							chrome.storage.local.get(newItem.id, (result) => {
								if (chrome.runtime.lastError) {
									console.error("Error verifying save:", chrome.runtime.lastError);
								} else {
									console.log("Verification - Retrieved item:", result);
								}
							});
							sendResponse({ status: "success" });
						} catch (error) {
								console.error("Error saving to storage:", error);
								sendResponse({
									status: "error",
									message: `Storage error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
		chrome.storage.local.get(null, (items) => { // Get all items
			if (chrome.runtime.lastError) {
				console.error("Error retrieving storage:", chrome.runtime.lastError.message);
				sendResponse({ status: "error", message: "Failed to retrieve storage" });
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
