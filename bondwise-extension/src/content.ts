import { Readability } from "@mozilla/readability";

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === "scrapeContent") {
		console.log("Content script received scrapeContent action.");

		try {
			const pageUrl = window.location.href;
			let pageTitle = document.title || "No Title Found";
			let articleContent = ""; // Initialize content
			let contentType: "article" | "youtube" | "other" = "other";

			if (pageUrl.includes("youtube.com/watch")) {
				contentType = "youtube";
				// For YouTube, we might just want the title and URL for now
			} else {
				// Attempt to parse as an article using Readability
				// Clone the document to avoid modifying the live page
				const documentClone = document.cloneNode(true) as Document;
				const reader = new Readability(documentClone);
				const article = reader.parse();

				// Use optional chaining directly in the condition as suggested by Biome
				if (article?.content) {
					contentType = "article";
					// Assign content first, as it's guaranteed by the 'if'
					articleContent = article.content;
					// Explicitly check article.title after confirming article exists
					if (article.title) {
						pageTitle = article.title;
					}
					console.log("Parsed article using Readability.");
				} else {
					// Fallback if Readability fails or doesn't find content
					console.log(
						"Readability parsing failed or found no content. Falling back to basic info.",
					);
					// Keep contentType as 'other' or potentially refine fallback logic
				}
			}

			console.log(
				`Scraped: Title='${pageTitle}', URL='${pageUrl}', Type='${contentType}'`,
			);

			// Send the scraped data back to the background script
			sendResponse({
				status: "success",
				data: {
					title: pageTitle,
					url: pageUrl,
					content: articleContent, // Send the extracted HTML content
					type: contentType,
				},
			});
		} catch (error) {
			console.error("Error scraping content:", error);
			sendResponse({
				status: "error",
				message: `Scraping failed: ${error instanceof Error ? error.message : "Unknown error"}`,
			});
		}

		// Return true to indicate that the response is sent asynchronously (although in this simple case it might not be strictly needed, it's good practice)
		return true;
	}
});

console.log("Bondwise content script loaded."); // Helps confirm injection
