import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted for mocks that need to be available before imports
const mockParse = vi.hoisted(() => vi.fn());

// Mock JSDOM
vi.mock("jsdom", () => {
	return {
		JSDOM: vi.fn().mockImplementation(() => ({
			window: {
				document: {},
			},
		})),
	};
});

// Mock Readability
vi.mock("@mozilla/readability", () => {
	// Create a constructor function
	const ReadabilityMock = vi.fn();
	// Add the parse method to the prototype
	ReadabilityMock.prototype.parse = mockParse;

	return {
		Readability: ReadabilityMock,
	};
});

// Now import the module
import { parseArticle } from "./parser"; // Import the real function

const mockFetch = vi.fn();

describe("parseArticle", () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
		mockParse.mockReset();
		mockFetch.mockReset();

		// Setup global objects for browser environment testing
		global.window = { DOMParser: vi.fn() } as any;
		global.DOMParser = vi.fn().mockImplementation(() => ({
			parseFromString: vi.fn().mockReturnValue({}),
		}));

		// Set default mock response
		mockFetch.mockResolvedValue(
			new Response("<html><body>Default Mock HTML</body></html>"),
		);
		// Stub the global fetch
		vi.stubGlobal("fetch", mockFetch);
	});

	afterEach(() => {
		// Restore original implementations after each test
		vi.restoreAllMocks();

		// Clean up global mocks
		global.window = undefined as any;
		global.DOMParser = undefined as any;
	});

	// --- Test cases ---

	it("should correctly parse article, calculate read time, and fallback siteName", async () => {
		// FAILED PREVIOUSLY
		// Setup
		const testUrl = "https://example.com/article1";
		mockFetch.mockResolvedValue(
			new Response("<html><body>Mock HTML</body></html>"),
		);

		// Mock Readability.parse result
		mockParse.mockReturnValue({
			title: "Test Article 1",
			content: "<p>word </p>".repeat(500), // Simulate ~500 words for read time calc
			textContent: "word ".repeat(500),
			length: 500 * 5, // Approximate length
			excerpt: "Test excerpt...",
			byline: "Test Author",
			siteName: null, // Simulate Readability not finding siteName
		});

		// Act
		const result = await parseArticle(testUrl);

		// Assert
		// Check that fetch was called with the normalized URL and expected headers/options
		expect(mockFetch).toHaveBeenCalledWith(testUrl, expect.any(Object));
		expect(mockParse).toHaveBeenCalled(); // Check if parse was called
		expect(result.title).toBe("Test Article 1");
		expect(result.url).toBe("https://example.com/article1");
		expect(result.siteName).toBe("example.com"); // Expect fallback to hostname
		expect(result.estimatedReadTime).toBe(3); // 500 words / 200 wpm = 2.5 -> ceil(2.5) = 3
		expect(result.content).toContain("<p>"); // Check sanitized content
		expect(result.type).toBe("article");
		expect(result.author).toBe("Test Author");
		expect(result.excerpt).toBe("Test excerpt...");
	});

	it("should use siteName from Readability if available", async () => {
		// FAILED PREVIOUSLY
		// Setup
		const testUrl = "https://anothersite.org/page";
		mockFetch.mockResolvedValue(
			new Response("<html><body>Mock HTML</body></html>"),
		);

		mockParse.mockReturnValue({
			title: "Article Title",
			content: "<p>Some content.</p>",
			textContent: "Some content.",
			length: 13,
			excerpt: "Some content.",
			byline: null,
			siteName: "Another Site Name", // Readability provides siteName
		});

		// Act
		const result = await parseArticle(testUrl);

		// Assert
		expect(mockFetch).toHaveBeenCalledWith(testUrl, expect.any(Object));
		expect(result.siteName).toBe("Another Site Name"); // Use Readability's value
		expect(result.estimatedReadTime).toBe(1); // Low word count
	});

	it("should handle minimal content and calculate minimum read time", async () => {
		// FAILED PREVIOUSLY
		// Setup
		const testUrl = "https://minimal.com";
		mockFetch.mockResolvedValue(
			new Response("<html><body>Mock HTML</body></html>"),
		);

		mockParse.mockReturnValue({
			title: "Minimal",
			content: "<p>One word.</p>",
			textContent: "One word.",
			length: 9,
			excerpt: "One word.",
			byline: null,
			siteName: null,
		});

		// Act
		const result = await parseArticle(testUrl);

		// Assert
		expect(mockFetch).toHaveBeenCalledWith(`${testUrl}/`, expect.any(Object)); // Check normalized URL
		expect(result.title).toBe("Minimal");
		expect(result.siteName).toBe("minimal.com"); // Fallback
		expect(result.estimatedReadTime).toBe(1); // Minimum read time
	});

	it("should throw error for invalid URL", async () => {
		// PASSED PREVIOUSLY
		await expect(parseArticle("invalid-url")).rejects.toThrow("Invalid URL");
		expect(mockFetch).not.toHaveBeenCalled();
		expect(mockParse).not.toHaveBeenCalled();
	});

	it("should throw error if fetch fails (simulating network error)", async () => {
		// FAILED PREVIOUSLY (Incorrect error)
		// Setup
		const testUrl = "https://failfetch.com";
		const fetchError = new Error("Network Error");
		// Simulate fetch throwing an error (e.g., network issue)
		// Make ALL fetch calls fail for this test
		mockFetch.mockRejectedValue(fetchError);

		// Act & Assert
		// Expect the error thrown by fetchHtml when fetch fails
		// Expect the error thrown by parseArticle when fetchHtml ultimately fails
		// Expect the exact error thrown by fetchHtml when it fails
		await expect(parseArticle(testUrl)).rejects.toThrow(
			"All CORS proxies failed. Unable to fetch article content.",
		);
		expect(mockFetch).toHaveBeenCalledWith(`${testUrl}/`, expect.any(Object)); // Check normalized URL for the first call
		expect(mockParse).not.toHaveBeenCalled(); // Parse should not be called if fetch fails
	});

	it("should throw error if Readability fails to parse (returns null)", async () => {
		// FAILED PREVIOUSLY (Incorrect error)
		// Setup
		const testUrl = "https://emptyhtml.com";
		mockFetch.mockResolvedValue(
			new Response("<html><body>Empty content</body></html>"),
		);

		mockParse.mockReturnValue(null); // Simulate Readability returning null

		// Act & Assert
		await expect(parseArticle(testUrl)).rejects.toThrow(
			/Could not parse article content/,
		);
		expect(mockFetch).toHaveBeenCalledWith(`${testUrl}/`, expect.any(Object)); // Check normalized URL
		expect(mockParse).toHaveBeenCalled(); // Parse was called but returned null
	});
});
