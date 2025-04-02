import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
// Import JSDOM for Node.js environments
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

// No need for Node.js polyfills as we're using browser-native DOMParser

// Import types
import type { Article } from "./db";

// Create turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
	headingStyle: "atx",
	hr: "---",
	bulletListMarker: "-",
	codeBlockStyle: "fenced",
});

// Add additional Turndown rules
turndownService.addRule("removeExtraLineBreaks", {
	filter: ["p", "h1", "h2", "h3", "h4", "h5", "h6"],
	replacement: (content) => {
		return `\n\n${content}\n\n`;
	},
});

// URL validation
export function isValidUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch (e) {
		return false;
	}
}

// Normalize URL
export function normalizeUrl(url: string): string {
	try {
		return new URL(url).toString();
	} catch (e) {
		return url;
	}
}

// Fetch HTML content from URL
export async function fetchHtml(url: string): Promise<string> {
	try {
		// Try direct fetch first with correct CORS mode
		try {
			const directResponse = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.160 Safari/537.36",
					Accept:
						"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
				},
				mode: "cors", // Explicitly set CORS mode
				credentials: "omit", // No credentials needed for article fetch
				cache: "no-cache",
			});

			if (directResponse.ok) {
				return await directResponse.text();
			}
		} catch (directError) {
			console.log("Direct fetch failed, trying CORS proxies", directError);
		}

		// Updated CORS proxies for 2025 based on current research
		// Use a combination of reliable CORS proxies
		const corsProxies = [
			// Primary proxies - most reliable as of 2025
			`https://corsproxy.io/?${encodeURIComponent(url)}`,
			`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
			`https://cors.proxy.consumet.org/?url=${encodeURIComponent(url)}`,
			// Secondary options
			`https://corsproxy.dev/?url=${encodeURIComponent(url)}`,
			`https://proxy-middleware.zenrows.com/proxy?url=${encodeURIComponent(
				url,
			)}`,
			// Fallbacks
			`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
			`https://crossorigin.me/${encodeURIComponent(url)}`,
		];

		// Try each proxy individually with proper error handling and logging
		// This provides better visibility into which proxy failed and why
		for (const proxyUrl of corsProxies) {
			try {
				console.log(`Trying proxy: ${proxyUrl.split("?")[0]}`);
				const response = await fetch(proxyUrl, {
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.160 Safari/537.36",
						Accept:
							"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
					},
					cache: "no-cache",
				});

				if (response.ok) {
					const text = await response.text();
					if (text && text.length > 0) {
						console.log(
							`Successfully fetched content using ${proxyUrl.split("?")[0]}`,
						);
						return text;
					}
					console.warn(
						`Proxy returned empty response: ${proxyUrl.split("?")[0]}`,
					);
				} else {
					console.warn(
						`Proxy failed with status ${response.status}: ${
							proxyUrl.split("?")[0]
						}`,
					);
				}
			} catch (error) {
				console.warn(`Error using proxy ${proxyUrl.split("?")[0]}:`, error);
				// Continue to the next proxy
			}
		}

		// If we get here, all individual proxies failed
		// Try with Promise.any as a last resort, which will use the first successful proxy
		try {
			console.log("Trying all proxies concurrently with Promise.any");
			const proxyRequests = corsProxies.map(async (proxyUrl) => {
				const response = await fetch(proxyUrl, {
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.160 Safari/537.36",
						Accept:
							"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
					},
					cache: "no-cache",
				});

				if (!response.ok) {
					throw new Error(`HTTP error! Status: ${response.status}`);
				}

				const text = await response.text();
				if (!text || text.length === 0) {
					throw new Error("Empty response");
				}

				return text;
			});

			return await Promise.race(proxyRequests);
		} catch (aggregateError) {
			// All proxies failed in Promise.any
			throw new Error(
				"All CORS proxies failed. Unable to fetch article content.",
			);
		}
	} catch (error) {
		console.error("Error fetching HTML:", error);
		throw error instanceof Error ? error : new Error(String(error));
	}
}

// Define the structure returned by Readability.parse() based on usage and TS errors
interface ParsedReadabilityArticle {
	title: string | null | undefined;
	content: string | null | undefined; // HTML string
	textContent: string | null | undefined;
	length: number | null | undefined;
	excerpt: string | null | undefined;
	byline: string | null | undefined; // Author
	siteName: string | null | undefined;
	// Add other potential properties if needed, though not used directly here
}

// Parse article content using Readability
export async function parseArticle(
	url: string,
): Promise<Omit<Article, "_id" | "savedAt" | "isRead" | "favorite" | "tags">> {
	if (!isValidUrl(url)) {
		throw new Error("Invalid URL");
	}

	const normalizedUrl = normalizeUrl(url);
	const html = await fetchHtml(normalizedUrl);
	let article: ParsedReadabilityArticle | null;

	// Create a proper DOM document that's compatible with Readability
	try {
		// Check if we're in a browser environment
		if (typeof window !== "undefined" && window.DOMParser) {
			// Use browser's native DOMParser
			const parser = new DOMParser();
			const document = parser.parseFromString(html, "text/html");

			// Use Readability to parse the article
			const reader = new Readability(document);
			article = reader.parse();
		} else {
			// Node.js environment - use JSDOM
			const dom = new JSDOM(html, { url: normalizedUrl });
			const reader = new Readability(dom.window.document);
			article = reader.parse();
		}

		if (!article) {
			throw new Error("Could not parse article content");
		}
	} catch (error) {
		console.error("Error parsing article with Readability:", error);
		throw new Error(
			`Failed to parse article: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// Sanitize HTML content
	const sanitizedHtml = DOMPurify.sanitize(article.content || "", {
		ALLOWED_TAGS: [
			"a",
			"b",
			"blockquote",
			"br",
			"caption",
			"code",
			"div",
			"em",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"hr",
			"i",
			"img",
			"li",
			"nl",
			"ol",
			"p",
			"pre",
			"span",
			"strong",
			"table",
			"tbody",
			"td",
			"th",
			"thead",
			"tr",
			"ul",
		],
		ALLOWED_ATTR: ["href", "src", "alt", "title", "class"],
	});

	// Convert to Markdown
	// Markdown conversion removed as it's not used

	// Extract excerpt
	const excerpt =
		article.excerpt ||
		`${(article.textContent || "").substring(0, 280).trim()}...`;

	// Calculate estimated read time (average reading speed: 200 words per minute)
	const wordCount = (article.textContent || "").split(/\s+/).length;
	let finalEstimatedReadTime = Math.ceil(wordCount / 200);
	if (finalEstimatedReadTime === 0) {
		finalEstimatedReadTime = 1; // Ensure minimum 1 minute read time
	}

	const result = {
		title: article.title || "Untitled Article",
		url: normalizedUrl,
		content: sanitizedHtml, // Store sanitized HTML
		excerpt,
		author: article.byline || undefined,
		siteName: article.siteName || new URL(normalizedUrl).hostname,
		estimatedReadTime: finalEstimatedReadTime, // Use the adjusted value
		type: "article" as const, // Explicitly assert type
	};

	return result;
}

// Helper function to extract text content from HTML
export function extractTextFromHtml(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	return doc.body.textContent || "";
}

// Helper function to convert HTML to Markdown
export function htmlToMarkdown(html: string): string {
	const sanitizedHtml = DOMPurify.sanitize(html);
	return turndownService.turndown(sanitizedHtml);
}
