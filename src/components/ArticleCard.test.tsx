/// <reference types="@testing-library/jest-dom" />

import type { Article } from "@/services/db";
import { render, screen, within } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ArticleCard from "./ArticleCard";

// Mock the context hook
vi.mock("@/context/ArticleContext", () => ({
	useArticles: () => ({
		updateArticleStatus: vi.fn(),
		removeArticle: vi.fn(),
	}),
}));

// Mock the toast hook
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({
		toast: vi.fn(),
	}),
}));

// Mock the animation hook
vi.mock("@/hooks/use-synchronized-animation", () => ({
	useSynchronizedAnimation: () => ({
		ref: vi.fn(), // Provide a mock function for the callback ref
		// playAnimation: vi.fn() // Optionally mock other returned properties if needed
	}),
}));

describe("ArticleCard", () => {
	// Helper function to render the component with an article
	const renderCard = (article: Article) => {
		render(
			<BrowserRouter>
				<ArticleCard article={article} />
			</BrowserRouter>,
		);
	};

	it("should display web article source correctly", () => {
		const webArticle: Article = {
			_id: "article-1",
			title: "Test Article",
			url: "https://example.com/article",
			content: "<p>Test content</p>",
			excerpt: "Test excerpt",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			siteName: "Example Website",
			estimatedReadTime: 5,
			version: 1,
		};

		renderCard(webArticle);

		// Check for source text directly within the card
		const card = screen.getByTestId("article-card");
		expect(
			within(card).getByText("Example Website", { exact: false }), // Use within and allow partial match if needed
		).toBeInTheDocument();
		expect(screen.getByText("5 min read")).toBeInTheDocument();
	});

	it("should display PDF source correctly", () => {
		const pdfArticle: Article = {
			_id: "pdf-1",
			title: "Test PDF",
			url: "local-pdf://test.pdf",
			content: "pdf-content",
			excerpt: "PDF Document",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "pdf",
			siteName: "PDF Document",
			estimatedReadTime: 10,
			version: 1,
		};

		renderCard(pdfArticle);

		// Check for source text directly within the card
		const card = screen.getByTestId("article-card");
		// Find the specific info div containing source/time
		const infoDiv = card.querySelector(
			".flex.items-center.justify-between.text-xs.text-muted-foreground",
		);
		expect(infoDiv).toBeInTheDocument(); // Ensure the container div is found
		if (!infoDiv) throw new Error("Info div not found for PDF test");
		// Find the first span directly within the infoDiv
		const sourceSpan = infoDiv.querySelector<HTMLSpanElement>(
			":scope > span:first-child",
		);
		expect(sourceSpan).toBeInTheDocument(); // Check if the span exists
		expect(sourceSpan).toHaveTextContent("PDF Document"); // Check its content
		expect(screen.getByText("10 min read")).toBeInTheDocument();
	});

	it("should display EPUB source correctly", () => {
		const epubArticle: Article = {
			_id: "epub-1",
			title: "Test EPUB",
			url: "local-epub://test.epub",
			content: "epub content placeholder",
			excerpt: "EPUB Book",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "epub",
			siteName: "EPUB Book",
			estimatedReadTime: 120,
			version: 1,
		};

		renderCard(epubArticle);

		// Check for source text directly within the card
		const card = screen.getByTestId("article-card");
		// Find the specific info div containing source/time
		const infoDiv = card.querySelector(
			".flex.items-center.justify-between.text-xs.text-muted-foreground",
		);
		expect(infoDiv).toBeInTheDocument(); // Ensure the container div is found
		if (!infoDiv) throw new Error("Info div not found for EPUB test");
		// Find the first span directly within the infoDiv
		const sourceSpan = infoDiv.querySelector<HTMLSpanElement>(
			":scope > span:first-child",
		);
		expect(sourceSpan).toBeInTheDocument(); // Check if the span exists
		expect(sourceSpan).toHaveTextContent("EPUB Book"); // Check its content
		expect(screen.getByText("120 min read")).toBeInTheDocument();
	});

	it("should display fallback values for missing source and time", () => {
		const articleWithMissingFields: Article = {
			_id: "article-2",
			title: "Test Article",
			url: "https://example.com/article",
			content: "<p>Test content</p>",
			excerpt: "Test excerpt",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			version: 1,
		};

		renderCard(articleWithMissingFields);

		// Check for fallback text directly within the card
		const card = screen.getByTestId("article-card");
		expect(within(card).getByText("Unknown source")).toBeInTheDocument();
		expect(within(card).getByText("? min read")).toBeInTheDocument();
	});

	it("should display fallbacks for PDF without siteName", () => {
		const pdfWithoutSiteName: Article = {
			_id: "pdf-2",
			title: "PDF without siteName",
			url: "local-pdf://test.pdf",
			content: "pdf-content",
			excerpt: "PDF Document",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "pdf",
			// siteName intentionally missing
			estimatedReadTime: 15,
			version: 1,
		};

		renderCard(pdfWithoutSiteName);

		// Should show "PDF Document" even though siteName is missing
		// Check for fallback text directly within the card
		const card = screen.getByTestId("article-card");
		// Find the specific info div containing source/time
		const infoDiv = card.querySelector(
			".flex.items-center.justify-between.text-xs.text-muted-foreground",
		);
		expect(infoDiv).toBeInTheDocument(); // Ensure the container div is found
		if (!infoDiv) throw new Error("Info div not found for PDF fallback test");
		// Find the first span directly within the infoDiv
		const sourceSpan = infoDiv.querySelector<HTMLSpanElement>(
			":scope > span:first-child",
		);
		expect(sourceSpan).toBeInTheDocument(); // Check if the span exists
		expect(sourceSpan).toHaveTextContent("PDF Document"); // Check its content
		// Also check the read time (this query seems fine)
		expect(screen.getByText("15 min read")).toBeInTheDocument();
	});

	it("should display fallbacks for EPUB without siteName", () => {
		const epubWithoutSiteName: Article = {
			_id: "epub-2",
			title: "EPUB without siteName",
			url: "local-epub://test.epub",
			content: "epub content placeholder",
			excerpt: "EPUB Book",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "epub",
			// siteName intentionally missing
			estimatedReadTime: 90,
			version: 1,
		};

		renderCard(epubWithoutSiteName);

		// Should show "EPUB Book" even though siteName is missing
		// Check for fallback text directly within the card
		const card = screen.getByTestId("article-card");
		// Find the specific info div containing source/time
		const infoDiv = card.querySelector(
			".flex.items-center.justify-between.text-xs.text-muted-foreground",
		);
		expect(infoDiv).toBeInTheDocument(); // Ensure the container div is found
		if (!infoDiv) throw new Error("Info div not found for EPUB fallback test");
		// Find the first span directly within the infoDiv
		const sourceSpan = infoDiv.querySelector<HTMLSpanElement>(
			":scope > span:first-child",
		);
		expect(sourceSpan).toBeInTheDocument(); // Check if the span exists
		expect(sourceSpan).toHaveTextContent("EPUB Book"); // Check its content
		// Also check the read time (this query seems fine)
		expect(screen.getByText("90 min read")).toBeInTheDocument();
	});

	// Test for structure and styling related to fixed height and content alignment
	it("should have fixed height and flex column classes", () => {
		const webArticle: Article = {
			_id: "article-style-test",
			title: "Style Test",
			url: "https://example.com/style",
			content: "<p>Content</p>",
			excerpt: "Excerpt",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			siteName: "Style Site",
			version: 1,
		};
		renderCard(webArticle);
		const cardElement = screen
			.getByTestId("article-card")
			.closest(".flex.flex-col.h-\\[200px\\]"); // Check the parent Card element
		expect(cardElement).toBeInTheDocument();
		expect(cardElement).toHaveClass("flex");
		expect(cardElement).toHaveClass("flex-col");
		expect(cardElement).toHaveClass("h-[200px]");
		expect(cardElement).toHaveClass("overflow-hidden");
	});

	it("should have correct internal flex structure for content alignment", () => {
		const webArticle: Article = {
			_id: "article-structure-test",
			title: "Structure Test",
			url: "https://example.com/structure",
			content: "<p>Content</p>",
			excerpt: "Excerpt",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			siteName: "Structure Site",
			version: 1,
		};
		renderCard(webArticle);

		// Check CardContent flex properties
		const cardContent = screen
			.getByTestId("article-card")
			.querySelector(".p-0"); // This corresponds to CardContent
		expect(cardContent).toHaveClass("flex-grow");
		expect(cardContent).toHaveClass("flex");
		expect(cardContent).toHaveClass("flex-col");

		// Check inner p-4 div flex properties
		const innerDiv = cardContent?.querySelector(".p-4");
		expect(innerDiv).toHaveClass("flex");
		expect(innerDiv).toHaveClass("flex-col");
		expect(innerDiv).toHaveClass("flex-grow");

		// Check the wrapper around title/excerpt has flex-grow
		const titleExcerptWrapper = innerDiv?.querySelector(".flex-grow.mb-3");
		expect(titleExcerptWrapper).toBeInTheDocument();

		// Check the metadata section has mt-auto
		const metadataDiv = innerDiv?.querySelector(".mt-auto");
		expect(metadataDiv).toBeInTheDocument();
		expect(metadataDiv).toHaveClass("mt-auto");
	});

	it("should apply line-clamp-2 to title and excerpt", () => {
		const webArticle: Article = {
			_id: "article-clamp-test",
			title:
				"Very Long Title That Should Definitely Be Clamped After Two Lines",
			url: "https://example.com/clamp",
			content: "<p>Content</p>",
			excerpt:
				"This is a very long excerpt that absolutely needs to be clamped because it goes on and on and on, far beyond what should be displayed in a small card preview area.",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			siteName: "Clamp Site",
			version: 1,
		};
		renderCard(webArticle);

		const card = screen.getByTestId("article-card");
		const titleElement = within(card).getByRole("heading", { level: 3 });
		const excerptElement = within(card).getByText(
			/This is a very long excerpt/,
			{ exact: false },
		); // Find the paragraph

		expect(titleElement).toHaveClass("line-clamp-2");
		expect(excerptElement).toHaveClass("line-clamp-2");
	});

	it("should maintain flex structure with short content", () => {
		const shortContentArticle: Article = {
			_id: "article-short-content",
			title: "Short",
			url: "https://example.com/short",
			content: "<p>Tiny</p>",
			excerpt: "Brief.",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			siteName: "Short Site",
			version: 1,
		};
		renderCard(shortContentArticle);

		const card = screen.getByTestId("article-card");
		const cardContent = card.querySelector(".p-0");
		const innerDiv = cardContent?.querySelector(".p-4");
		const titleExcerptWrapper = innerDiv?.querySelector(".flex-grow.mb-3");
		const metadataDiv = innerDiv?.querySelector(".mt-auto");

		expect(titleExcerptWrapper).toBeInTheDocument();
		expect(metadataDiv).toBeInTheDocument();
		expect(metadataDiv).toHaveClass("mt-auto");
	});

	it("should display 'Unread' status text when isRead is false", () => {
		const unreadArticle: Article = {
			_id: "unread-article",
			title: "Unread Test",
			url: "https://example.com/unread",
			content: "<p>Content</p>",
			excerpt: "Excerpt",
			savedAt: Date.now(),
			status: "inbox",
			isRead: false, // Explicitly false
			favorite: false,
			tags: [],
			type: "article",
			version: 1,
		};
		renderCard(unreadArticle);
		expect(screen.getByTestId("unread-status")).toBeInTheDocument();
		expect(screen.getByTestId("unread-status")).toHaveTextContent("Unread");
		expect(screen.queryByTestId("read-status")).not.toBeInTheDocument();
	});

	it("should display 'Read' status text when isRead is true", () => {
		const readArticle: Article = {
			_id: "read-article",
			title: "Read Test",
			url: "https://example.com/read",
			content: "<p>Content</p>",
			excerpt: "Excerpt",
			savedAt: Date.now(),
			status: "inbox",
			isRead: true, // Explicitly true
			favorite: false,
			tags: [],
			type: "article",
			version: 1,
		};
		renderCard(readArticle);
		expect(screen.getByTestId("read-status")).toBeInTheDocument();
		expect(screen.getByTestId("read-status")).toHaveTextContent("Read");
		expect(screen.queryByTestId("unread-status")).not.toBeInTheDocument();
	});

	it("should display 'Untitled' when title is null or empty", () => {
		const nullTitleArticle: Article = {
			_id: "null-title",
			title: "", // Empty title
			url: "https://example.com/null-title",
			content: "<p>Content</p>",
			excerpt: "Excerpt",
			// Remove duplicate version property
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			version: 1, // This version property was already correctly added here
			// version: 1, // Keep only one version property
			// Removed duplicate version from here
		};
		renderCard(nullTitleArticle);
		const card = screen.getByTestId("article-card");
		const titleElement = within(card).getByRole("heading", { level: 3 });
		expect(titleElement).toHaveTextContent("Untitled");
	});

	it("should display 'No excerpt available' when excerpt is null or empty", () => {
		const nullExcerptArticle: Article = {
			_id: "null-excerpt",
			title: "Title Exists",
			url: "https://example.com/null-excerpt",
			content: "<p>Content</p>",
			excerpt: "", // Empty excerpt
			savedAt: Date.now(),
			status: "inbox",
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			version: 1, // Added missing version
		};
		renderCard(nullExcerptArticle);
		const card = screen.getByTestId("article-card");
		const excerptElement = within(card).getByText("No excerpt available");
		expect(excerptElement).toBeInTheDocument();
	});
});
