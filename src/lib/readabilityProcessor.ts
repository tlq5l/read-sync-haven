import { Readability } from "@mozilla/readability";

/**
 * Extracts the main article content from an HTML string using the Mozilla Readability library.
 *
 * Attempts to parse and clean the provided HTML to return only the readable article content. If parsing fails or no article content is found, returns the original HTML string. Returns `null` only if the HTML cannot be parsed into a valid document.
 *
 * @param htmlContent - The raw HTML content to process.
 * @param documentUrl - Optional base URL for resolving relative links; defaults to a dummy URL.
 * @returns The cleaned article HTML if extraction succeeds, the original HTML if extraction fails, or `null` if the HTML cannot be parsed.
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
