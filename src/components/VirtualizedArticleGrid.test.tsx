import type { Article } from "@/services/db";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import VirtualizedArticleGrid from "./VirtualizedArticleGrid";

// Mock the ArticleCard component to simplify testing
vi.mock("@/components/ArticleCard", () => ({
	// Use React.forwardRef for memoized components if they might need a ref
	default: React.forwardRef(
		(
			{ article }: { article: Article },
			ref: React.ForwardedRef<HTMLDivElement>,
		) => (
			<div data-testid={`article-card-${article._id}`} ref={ref}>
				{article.title}
			</div>
		),
	),
}));

// Mock react-virtuoso components to avoid actual virtualization logic in unit tests
// We are testing our component's integration, not the library itself.
vi.mock("react-virtuoso", () => ({
	VirtuosoGrid: ({
		data,
		itemContent,
		listClassName,
	}: {
		data: Article[];
		itemContent: (index: number, item: Article) => React.ReactNode;
		listClassName?: string;
	}) => (
		<div data-testid="virtuoso-grid" className={listClassName}>
			{data.map((item, index) => (
				<div key={item._id} data-testid="virtuoso-item-container">
					{itemContent(index, item)}
				</div>
			))}
		</div>
	),
}));

const mockArticles: Article[] = [
	{
		_id: "1",
		userId: "user1",
		url: "http://example.com/1",
		title: "Article 1",
		content: "Content 1",
		excerpt: "Excerpt 1",
		status: "inbox",
		savedAt: Date.now(),
		isRead: false,
		favorite: false,
		tags: [],
		type: "article",
		// Removed createdAt, updatedAt
	},
	{
		_id: "2",
		userId: "user1",
		url: "http://example.com/2",
		title: "Article 2",
		content: "Content 2",
		excerpt: "Excerpt 2",
		status: "inbox",
		savedAt: Date.now() - 10000,
		isRead: true,
		favorite: true,
		tags: ["tag1"],
		type: "article",
		// Removed createdAt, updatedAt
	},
];

describe("VirtualizedArticleGrid", () => {
	it("renders null when no articles are provided", () => {
		const { container } = render(<VirtualizedArticleGrid articles={[]} />);
		expect(container.firstChild).toBeNull();
	});

	it("renders the VirtuosoGrid component with articles", () => {
		render(<VirtualizedArticleGrid articles={mockArticles} />);
		expect(screen.getByTestId("virtuoso-grid")).toBeInTheDocument();
	});

	it("renders the correct number of article items via VirtuosoGrid mock", () => {
		render(<VirtualizedArticleGrid articles={mockArticles} />);
		const items = screen.getAllByTestId(/article-card-/);
		expect(items).toHaveLength(mockArticles.length);
	});

	it("renders mocked ArticleCard components with correct titles", () => {
		render(<VirtualizedArticleGrid articles={mockArticles} />);
		expect(screen.getByText("Article 1")).toBeInTheDocument();
		expect(screen.getByText("Article 2")).toBeInTheDocument();
		expect(screen.getByTestId("article-card-1")).toBeInTheDocument();
		expect(screen.getByTestId("article-card-2")).toBeInTheDocument();
	});

	it("applies the listClassName to the VirtuosoGrid container", () => {
		render(<VirtualizedArticleGrid articles={mockArticles} />);
		const grid = screen.getByTestId("virtuoso-grid");
		// Check for one of the grid classes applied
		expect(grid).toHaveClass("grid");
		expect(grid).toHaveClass("md:grid-cols-2");
		expect(grid).toHaveClass("lg:grid-cols-3");
	});

	it("renders correctly with a single article", () => {
		const singleArticle = [mockArticles[0]]; // Take just the first article
		render(<VirtualizedArticleGrid articles={singleArticle} />);

		expect(screen.getByTestId("virtuoso-grid")).toBeInTheDocument();
		const items = screen.getAllByTestId(/article-card-/);
		expect(items).toHaveLength(1);
		expect(screen.getByText("Article 1")).toBeInTheDocument();
		expect(screen.getByTestId("article-card-1")).toBeInTheDocument();
	});

	it("renders articles with missing optional fields without errors", () => {
		// Create an article missing some *optional* fields
		const articleWithMissingOptionalFields: Article = {
			_id: "missing-optional",
			userId: "user1",
			url: "http://example.com/missing-opt",
			title: "Missing Optional Fields",
			content: "Some content",
			excerpt: "Required excerpt", // Excerpt is required
			status: "inbox",
			savedAt: Date.now(),
			isRead: false,
			favorite: false,
			tags: [],
			type: "article",
			// siteName is optional and missing
			// estimatedReadTime is optional and missing
			// author is optional and missing
			// publishedDate is optional and missing
		};
		render(
			<VirtualizedArticleGrid articles={[articleWithMissingOptionalFields]} />,
		);

		expect(screen.getByTestId("virtuoso-grid")).toBeInTheDocument();
		const items = screen.getAllByTestId(/article-card-/);
		expect(items).toHaveLength(1);
		expect(screen.getByText("Missing Optional Fields")).toBeInTheDocument();
		expect(
			screen.getByTestId("article-card-missing-optional"),
		).toBeInTheDocument();
		// This test mainly ensures no errors are thrown during render due to missing *optional* fields
	});
});
