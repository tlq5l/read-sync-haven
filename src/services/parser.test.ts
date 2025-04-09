import {
	type MockedFunction,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

// --- Mocking Dependencies ---

// Mock JSDOM
vi.mock("jsdom", () => ({
	JSDOM: vi.fn().mockImplementation(() => ({
		window: { document: {} },
	})),
}));

// Mock Readability's prototype for reliable instance mocking
const mockReadabilityParse = vi.hoisted(() => vi.fn());
vi.mock("@mozilla/readability", () => {
	const ReadabilityMock = vi.fn(); // Mock the constructor
	ReadabilityMock.prototype.parse = mockReadabilityParse; // Mock the parse method on the prototype
	return { Readability: ReadabilityMock };
});

// --- Imports ---
// Import the module to be tested
import {
	FetchError,
	ParseError,
	ReadabilityError,
	fetchHtml, // Import fetchHtml, though we spy on global fetch
	parseArticle,
} from "./parser";

// --- Global Mocks & Test Suite ---
const mockFetch = vi.fn(); // Define the mock function for global fetch

describe("parseArticle", () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
		mockReadabilityParse.mockReset();
		mockFetch.mockReset(); // Reset the global fetch mock's calls and implementations

		// Setup global objects for browser environment testing
		global.window = { DOMParser: vi.fn() } as any;
		global.DOMParser = vi.fn().mockImplementation(() => ({
			parseFromString: vi.fn().mockReturnValue({ documentElement: {} }), // Return a basic document structure
		}));

		// Spy on global fetch and set its base implementation to our mock function
		// Specific mock behavior (resolve/reject) will be defined within each test below
		vi.spyOn(global, "fetch").mockImplementation(mockFetch);
	});

	afterEach(() => {
		vi.restoreAllMocks(); // Restore all mocks, including the global fetch spy

		// Clean up global mocks
		global.window = undefined as any;
		global.DOMParser = undefined as any;
	});

	// --- Test cases ---

	it("should correctly parse article, calculate read time, and fallback siteName", async () => {
		// Setup Fetch: Resolve successfully
		mockFetch.mockResolvedValue(
			new Response("<html><body>Mock HTML Content</body></html>"),
		);
		// Setup Readability
		const testUrl = "https://example.com/article1";
		mockReadabilityParse.mockReturnValue({
			title: "Test Article 1",
			content: "<p>word </p>".repeat(500),
			textContent: "word ".repeat(500),
			length: 500 * 5,
			excerpt: "Test excerpt...",
			byline: "Test Author",
			siteName: null,
		});

		// Act
		const result = await parseArticle(testUrl);

		// Assert
		expect(mockFetch).toHaveBeenCalledWith(
			testUrl,
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(mockReadabilityParse).toHaveBeenCalled();
		expect(result.title).toBe("Test Article 1");
		expect(result.url).toBe("https://example.com/article1");
		expect(result.siteName).toBe("example.com");
		expect(result.estimatedReadTime).toBe(3);
		expect(result.content).toContain("<p>");
		expect(result.type).toBe("article");
		expect(result.author).toBe("Test Author");
		expect(result.excerpt).toBe("Test excerpt...");
	});

	it("should use siteName from Readability if available", async () => {
		// Setup Fetch: Resolve successfully
		mockFetch.mockResolvedValue(
			new Response("<html><body>Another Page</body></html>"),
		);
		// Setup Readability
		const testUrl = "https://anothersite.org/page";
		mockReadabilityParse.mockReturnValue({
			title: "Article Title",
			content: "<p>Some content.</p>",
			textContent: "Some content.",
			length: 13,
			excerpt: "Some content.",
			byline: null,
			siteName: "Another Site Name",
		});

		// Act
		const result = await parseArticle(testUrl);

		// Assert
		expect(mockFetch).toHaveBeenCalledWith(
			testUrl,
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(result.siteName).toBe("Another Site Name");
		expect(result.estimatedReadTime).toBe(1);
	});

	it("should handle minimal content and calculate minimum read time", async () => {
		// Setup Fetch: Resolve successfully
		mockFetch.mockResolvedValue(
			new Response("<html><body>Minimal Page</body></html>"),
		);
		// Setup Readability
		const testUrl = "https://minimal.com";
		mockReadabilityParse.mockReturnValue({
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
		expect(mockFetch).toHaveBeenCalledWith(
			`${testUrl}/`, // Normalization adds trailing slash
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
		expect(result.title).toBe("Minimal");
		expect(result.siteName).toBe("minimal.com");
		expect(result.estimatedReadTime).toBe(1);
	});

	it("should throw error for invalid URL", async () => {
		// No fetch setup needed as it shouldn't be called
		// Act & Assert
		await expect(parseArticle("invalid-url")).rejects.toThrow(ParseError);
		await expect(parseArticle("invalid-url")).rejects.toThrow(
			"Invalid URL provided.",
		);
		expect(mockFetch).not.toHaveBeenCalled();
		expect(mockReadabilityParse).not.toHaveBeenCalled();
	});

	it("should throw FetchError if fetch fails (simulating network error)", async () => {
		// Setup Fetch: Reject with network error
		const testUrl = "https://failfetch.com";
		const fetchError = new Error("Network Error");
		mockFetch.mockRejectedValue(fetchError);

		// Act & Assert
		await expect(parseArticle(testUrl)).rejects.toThrow(FetchError);
		await expect(parseArticle(testUrl)).rejects.toThrow(
			"All direct and proxy fetch attempts failed or timed out.",
		);
		expect(mockFetch).toHaveBeenCalled(); // Fetch was attempted
		expect(mockReadabilityParse).not.toHaveBeenCalled();
	});

	it("should throw ReadabilityError if Readability fails to parse (returns null)", async () => {
		// Setup Fetch: Resolve successfully
		const testUrl = "https://emptyhtml.com";
		mockFetch.mockResolvedValue({
			ok: true,
			text: async () => "<html><body>Empty content</body></html>",
		});
		// Setup Readability: Return null
		mockReadabilityParse.mockReturnValue(null);

		// Act & Assert
		await expect(parseArticle(testUrl)).rejects.toThrow(ReadabilityError);
		await expect(parseArticle(testUrl)).rejects.toThrow(
			"Readability could not parse the article content (returned null). The page structure might be incompatible.",
		);
		expect(mockFetch).toHaveBeenCalled(); // Fetch succeeded
		expect(mockReadabilityParse).toHaveBeenCalled(); // Parse was called
	});

	// Increase timeout for this specific long-running test
	it(
		"should throw FetchError if fetch times out",
		{ timeout: 40000 },
		async () => {
			// Setup Fetch: Reject with AbortError
			const testUrl = "https://timeout.com";
			const abortError = new Error("The operation was aborted.");
			abortError.name = "AbortError";
			mockFetch.mockRejectedValue(abortError);

			// Act & Assert
			await expect(parseArticle(testUrl)).rejects.toThrow(FetchError);
			await expect(parseArticle(testUrl)).rejects.toThrow(
				"Fetching article timed out via proxy.",
			);
			expect(mockFetch).toHaveBeenCalled(); // Fetch was attempted
			expect(mockReadabilityParse).not.toHaveBeenCalled();
		},
	);

	it("should throw ReadabilityError if Readability parse() throws in browser env", async () => {
		// Setup Fetch: Resolve successfully
		const testUrl = "https://readability-throws.com";
		mockFetch.mockResolvedValue({
			ok: true,
			text: async () => "<html><body>Good HTML</body></html>",
		});
		// Setup Readability: Throw error
		const parseError = new Error("Internal Readability Error");
		mockReadabilityParse.mockImplementation(() => {
			throw parseError;
		});

		// Act & Assert
		await expect(parseArticle(testUrl)).rejects.toThrow(ReadabilityError);
		await expect(parseArticle(testUrl)).rejects.toThrow(
			`Readability processing failed: ${parseError.message}`,
		);
		expect(mockFetch).toHaveBeenCalled(); // Fetch succeeded
		expect(mockReadabilityParse).toHaveBeenCalled(); // Parse was called and threw
	});
});
