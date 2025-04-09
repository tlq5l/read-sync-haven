import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
// JSDOM is imported dynamically below for Node.js environments only
// import { JSDOM } from "jsdom";

// No need for Node.js polyfills as we're using browser-native DOMParser

// Import types
import type { Article } from "./db/types"; // Changed path

// Define Custom Error Types
export class FetchError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FetchError";
	}
}

export class ParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ParseError";
	}
}

export class ReadabilityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ReadabilityError";
	}
}

// Fetch timeout configuration (e.g., 30 seconds)
const FETCH_TIMEOUT_MS = 30000;
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
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
				mode: "cors",
				credentials: "omit",
				cache: "no-cache",
				signal: controller.signal, // Add abort signal
			});

			if (directResponse.ok) {
				clearTimeout(timeoutId); // Clear timeout on successful fetch
				return await directResponse.text();
			}
			// Throw specific error for non-ok direct response
			throw new FetchError(
				`Direct fetch failed with status ${directResponse.status}`,
			);
		} catch (directError) {
			// Handle timeout specifically
			if (directError instanceof Error && directError.name === "AbortError") {
				console.log("Direct fetch timed out, trying CORS proxies");
			} else {
				console.log("Direct fetch failed, trying CORS proxies:", directError);
			}
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
				// Use a new controller for each proxy attempt? Or reuse outer one? Reusing seems simpler.
				// If reusing outer, we need to clear/reset the timer properly.
				// Let's stick to one outer timeout for the whole operation. If proxies are slow, the whole thing fails.
				const response = await fetch(proxyUrl, {
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.160 Safari/537.36",
						Accept:
							"text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
					},
					cache: "no-cache",
					signal: controller.signal, // Use the same signal
				});

				if (response.ok) {
					const text = await response.text();
					if (text && text.length > 0) {
						console.log(
							`Successfully fetched content using ${proxyUrl.split("?")[0]}`,
						);
						clearTimeout(timeoutId); // Clear timeout on successful fetch
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
				// Handle timeout specifically for proxies
				if (error instanceof Error && error.name === "AbortError") {
					console.warn(`Timeout using proxy ${proxyUrl.split("?")[0]}`);
					// If the main timeout is triggered, abort all subsequent attempts
					throw new FetchError("Fetching article timed out via proxy.");
				}
				// Removed redundant else block after throw
				console.warn(`Error using proxy ${proxyUrl.split("?")[0]}:`, error);
				// Continue to the next proxy if it wasn't a timeout
			}
		}

		// If we get here, all individual proxies failed
		// If we get here, all individual proxy attempts failed (or timed out)
		throw new FetchError(
			"All direct and proxy fetch attempts failed or timed out.",
		);
	} catch (error) {
		console.error("Unhandled error during fetchHtml:", error);
		// Ensure specific FetchError is thrown
		if (error instanceof FetchError) {
			throw error;
		}
		// Wrap other unexpected errors
		throw new FetchError(
			`An unexpected error occurred during fetching: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		clearTimeout(timeoutId); // Always clear the timeout
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
		throw new ParseError("Invalid URL provided.");
	}

	const normalizedUrl = normalizeUrl(url);
	let html: string;
	try {
		html = await fetchHtml(normalizedUrl);
	} catch (fetchError) {
		console.error(
			`[parser.ts] Failed to fetch HTML for ${normalizedUrl}:`,
			fetchError,
		);
		// Re-throw specific FetchError or wrap others
		if (fetchError instanceof FetchError) {
			throw fetchError; // Propagate the specific error
		}
		throw new FetchError(
			`Failed to fetch HTML: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
		);
	}

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
		} else if (import.meta.env.SSR) {
			// Node.js environment (SSR build) - dynamically import and use JSDOM
			try {
				const { JSDOM } = await import("jsdom");
				const dom = new JSDOM(html, { url: normalizedUrl });
				const reader = new Readability(dom.window.document);
				article = reader.parse();
			} catch (e) {
				console.error("Failed to load or use JSDOM in SSR:", e);
				throw new ParseError("Parser setup failed in SSR environment (JSDOM).");
			}
		} else {
			// Should not happen in a pure client-side build if window was undefined
			throw new ParseError(
				"Parsing environment unclear: window is undefined but not in SSR build.",
			);
		}

		// Check if Readability succeeded but returned null or no content
		if (!article) {
			console.warn(
				`[parser.ts] Readability returned null for URL: ${normalizedUrl}. Page structure might be incompatible.`,
			);
			throw new ReadabilityError(
				"Readability could not parse the article content (returned null). The page structure might be incompatible.",
			);
		}
		if (!article.content) {
			// Readability succeeded but found no content - treat as incompatibility
			console.warn(
				`[parser.ts] Readability found no content for URL: ${normalizedUrl}.`,
			);
			throw new ReadabilityError(
				"Readability parsed the page but found no main content.",
			);
		}
	} catch (error) {
		// Catch errors from Readability execution itself OR the specific errors thrown above
		console.error(
			`[parser.ts] Error during Readability parsing for ${normalizedUrl}:`,
			error,
		);
		// Throw a specific error for UI handling
		// Throw specific ReadabilityError or wrap others
		if (error instanceof ReadabilityError || error instanceof ParseError) {
			throw error; // Propagate specific errors
		}
		throw new ReadabilityError(
			`Readability processing failed: ${error instanceof Error ? error.message : String(error)}`,
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
		status: "inbox" as const, // Add default status with const assertion
		version: 1, // Add initial version
	};

	return result;
}

// Helper function to extract text content from HTML
export function extractTextFromHtml(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");
	return doc.body.textContent || "";
}
