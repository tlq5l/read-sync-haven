import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

// Polyfill for fs and child_process for JSDOM
// These will be replaced by the node polyfills plugin
globalThis.fs = globalThis.fs || {};
globalThis.child_process = globalThis.child_process || {};

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
	replacement: (content, node) => {
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
		// Try direct fetch first with no-cors mode as fallback
		try {
			const directResponse = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
				},
				cache: "no-cache",
			});
			
			if (directResponse.ok) {
				return await directResponse.text();
			}
		} catch (directError) {
			console.log("Direct fetch failed, trying CORS proxies", directError);
		}
		
		// Try multiple CORS proxies as fallback
		const corsProxies = [
			`https://corsproxy.io/?${encodeURIComponent(url)}`,
			`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
			`https://cors-anywhere.herokuapp.com/${url}`,
		];

		let html = "";
		let lastError;

		// Try each proxy until one works
		for (const proxyUrl of corsProxies) {
			try {
				const response = await fetch(proxyUrl, {
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
					},
					mode: "cors",
					cache: "no-cache",
				});

				if (response.ok) {
					html = await response.text();
					return html;
				}
			} catch (error) {
				console.warn(`Proxy failed: ${proxyUrl}`, error);
				lastError = error;
			}
		}

		// If we've tried all proxies and none worked, throw the last error
		throw lastError || new Error("Failed to fetch page: All proxies failed");
	} catch (error) {
		console.error("Error fetching HTML:", error);
		throw error;
	}
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

	// Create a DOM from HTML
	const dom = new JSDOM(html, { url: normalizedUrl });
	const document = dom.window.document;

	// Use Readability to parse the article
	const reader = new Readability(document);
	const article = reader.parse();

	if (!article) {
		throw new Error("Could not parse article content");
	}

	// Sanitize HTML content
	const sanitizedHtml = DOMPurify.sanitize(article.content, {
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
	const markdown = turndownService.turndown(sanitizedHtml);

	// Extract excerpt
	const excerpt =
		article.excerpt || article.textContent.substring(0, 280).trim() + "...";

	// Calculate estimated read time (average reading speed: 200 words per minute)
	const wordCount = article.textContent.split(/\s+/).length;
	const estimatedReadTime = Math.ceil(wordCount / 200);

	return {
		title: article.title,
		url: normalizedUrl,
		content: sanitizedHtml, // Store sanitized HTML
		excerpt,
		author: article.byline || undefined,
		siteName: article.siteName || new URL(normalizedUrl).hostname,
		estimatedReadTime,
		type: "article",
	};
}

// Helper function to extract text content from HTML
export function extractTextFromHtml(html: string): string {
	const dom = new JSDOM(html);
	return dom.window.document.body.textContent || "";
}

// Helper function to convert HTML to Markdown
export function htmlToMarkdown(html: string): string {
	const sanitizedHtml = DOMPurify.sanitize(html);
	return turndownService.turndown(sanitizedHtml);
}