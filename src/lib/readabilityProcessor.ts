import { Readability } from "@mozilla/readability";

/**
 * Processes an HTML string using Readability to extract the main article content.
 * @param htmlContent The raw HTML content string.
 * @param documentUrl A dummy URL for Readability's base URI resolution (can be arbitrary).
 * @returns The cleaned HTML content of the article, or null if parsing fails.
 */
export function processHtmlWithReadability(
	htmlContent: string,
	documentUrl = "http://localhost/dummy-doc", // Readability requires a base URL
): string | null {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(htmlContent, "text/html");

		// Check if parsing was successful and body exists
		if (!doc?.body) {
			console.error("Failed to parse HTML string into a valid document.");
			return null;
		}

		// Provide the document URI
		const baseElement = doc.createElement("base");
		baseElement.setAttribute("href", documentUrl);
		doc.head.appendChild(baseElement);

		const reader = new Readability(doc);
		const article = reader.parse();

		if (article?.content) {
			// article.content contains the cleaned HTML
			console.log(
				"Readability processing successful. Title:",
				article.title || "N/A",
			);
			return article.content;
		}
		// --- Readability Failure Logging ---
		console.warn(
			"Readability.parse() did not return valid content for URL:",
			documentUrl,
		);
		if (article) {
			console.log("Readability result (but no content property):", {
				title: article.title,
				byline: article.byline,
				length: article.length,
				excerpt: `${article.excerpt?.substring(0, 100) ?? ""}...`, // Log start of excerpt
			});
		} else {
			console.log("Readability.parse() returned null.");
		}
		// --- End Logging ---

		console.warn(
			"Readability could not parse the article content. Falling back to original HTML.",
		);
		// Fallback: return the original full HTML content that was passed in.
		// It will still be sanitized by DOMPurify in the display component.
		return htmlContent;
	} catch (error) {
		console.error("Error during DOM parsing or Readability execution:", error);
		// Fallback even if the try block fails before the main parse attempt
		console.warn("Falling back to original HTML due to processing error.");
		return htmlContent;
	}
}
