const saveButton = document.getElementById("saveButton") as HTMLButtonElement;
const statusMessage = document.getElementById(
	"statusMessage",
) as HTMLParagraphElement;
const debugLogStorageButton = document.getElementById(
	"debugLogStorage",
) as HTMLButtonElement; // Get debug button

// Function to update status message and button state
function updateStatus(message: string, disableButton = false, isError = false, isPartial = false) {
	if (statusMessage) {
		statusMessage.textContent = message;
		statusMessage.style.color = isError ? "red" : isPartial ? "orange" : "#555";
	}
	if (saveButton) {
		saveButton.disabled = disableButton;
	}
}

// Add click listener to the save button
if (saveButton) {
	saveButton.addEventListener("click", async () => {
		updateStatus("Saving...", true); // Update status and disable button

		try {
			// Get the current active tab
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});

			if (tab?.id) {
				// Send message to background script to initiate saving
				chrome.runtime.sendMessage(
					{ action: "savePage", tabId: tab.id },
					(response) => {
						if (chrome.runtime.lastError) {
							// Handle errors like background script not responding
							console.error(
								"Error sending message:",
								chrome.runtime.lastError.message,
							);
							updateStatus(
								`Error: ${chrome.runtime.lastError.message}`,
								false,
								true,
							);
						} else if (response?.status === "success") {
							updateStatus(response.message || "Page saved successfully!", false);
							// Optionally close the popup after a short delay
							// setTimeout(() => window.close(), 1500);
						} else if (response?.status === "partial") {
							// Handle partial success (saved locally but not to cloud)
							updateStatus(
								response.message || "Saved locally only (cloud failed)",
								false,
								false,
								true
							);
						} else if (response?.status === "error") {
							console.error("Error saving page:", response.message);
							updateStatus(
								`Error: ${response.message || "Unknown error"}`,
								false,
								true,
							);
						} else {
							// Handle unexpected response
							console.warn("Unexpected response:", response);
							updateStatus("Unexpected response received.", false, true);
						}
					},
				);
			} else {
				updateStatus("Could not get active tab.", false, true);
			}
		} catch (error) {
			console.error("Error during save process:", error);
			updateStatus(
				`Error: ${error instanceof Error ? error.message : "Unknown error"}`,
				false,
				true,
			);
		}
	});
} else {
	updateStatus("Initialization error: Button not found.", false, true);
}

// Add click listener for the debug button
if (debugLogStorageButton) {
	debugLogStorageButton.addEventListener("click", () => {
		updateStatus("Requesting storage log...", false);
		chrome.runtime.sendMessage({ action: "logStorage" }, (response) => {
			if (chrome.runtime.lastError) {
				console.error(
					"Error sending logStorage message:",
					chrome.runtime.lastError.message,
				);
				updateStatus(`Error: ${chrome.runtime.lastError.message}`, false, true);
			} else if (response?.status === "success") {
				updateStatus("Storage log requested. Check background console.", false);
			} else {
				updateStatus("Failed to request storage log.", false, true);
			}
		});
	});
}

// Optional: Listen for messages pushed from background (e.g., progress updates)
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === "updatePopupStatus") {
//     updateStatus(message.text, message.disableButton, message.isError);
//   }
// });
