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
		ref: vi.fn(), // Provide ref as a mock function
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
});
