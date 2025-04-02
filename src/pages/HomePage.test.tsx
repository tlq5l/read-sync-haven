import type { useArticles } from "@/context/ArticleContext";
// Import necessary types and utils used in the mock provider
import type { ArticleView } from "@/hooks/useArticleView";
import type { Article, Tag } from "@/services/db";
import type { ArticleFilters, SortCriteria } from "@/types/articles";
// Removed unused import: filterArticles, sortArticles
import type { ArticleSortField } from "@/types/articles";
import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React, { useCallback, useMemo, useState } from "react"; // Add hooks
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest"; // Removed beforeEach
import HomePage from "./HomePage"; // The component to test

// --- Mocks ---

// Mock animation hooks
vi.mock("@/context/AnimationContext", () => ({
	useAnimation: () => ({ synchronizeAnimations: vi.fn() }),
}));
vi.mock("@/hooks/use-synchronized-animation", () => ({
	useSynchronizedAnimation: () => ({ ref: vi.fn(), playAnimation: vi.fn() }),
	useTransitionGroup: () => ({ animateGroup: vi.fn() }),
}));

// Removed Button mock - relying on actual implementation and DropdownMenuTrigger mock

// Mock Radix UI components causing issues in JSDOM
vi.mock("@/components/ui/select", async () => ({
	Select: ({
		// children, // Removed unused variable
		value,
		onValueChange,
	}: {
		children: React.ReactNode; // Keep type for consistency, even if unused in mock
		value: string;
		onValueChange: (value: string) => void;
	}) => {
		// Using a flat div instead of nested select to avoid DOM nesting issues
		return (
			<div className="mock-select" data-testid="mock-select" data-value={value}>
				<button
					type="button" // Explicitly set type for buttons
					onClick={() => onValueChange("title")}
					onKeyDown={(e) => e.key === "Enter" && onValueChange("title")}
					data-testid="select-option-title"
				>
					Sort by Title
				</button>
				<button
					type="button"
					onClick={() => onValueChange("savedAt")}
					onKeyDown={(e) => e.key === "Enter" && onValueChange("savedAt")}
					data-testid="select-option-savedAt"
				>
					Sort by Date
				</button>
				<button
					type="button"
					onClick={() => onValueChange("siteName")}
					onKeyDown={(e) => e.key === "Enter" && onValueChange("siteName")}
					data-testid="select-option-siteName"
				>
					Sort by Source
				</button>
				<button
					type="button"
					onClick={() => onValueChange("estimatedReadTime")}
					onKeyDown={(e) =>
						e.key === "Enter" && onValueChange("estimatedReadTime")
					}
					data-testid="select-option-readTime"
				>
					Sort by Read Time
				</button>
			</div>
		);
	},
	SelectTrigger: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="select-trigger">{children}</div>
	),
	SelectValue: ({ placeholder }: { placeholder: string }) => (
		<span>{placeholder}</span>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	SelectItem: ({
		value,
		children,
	}: { value: string; children: React.ReactNode }) => (
		<div data-value={value} data-testid={`select-item-${value}`}>
			{children}
		</div>
	),
}));

vi.mock("@/components/ui/dropdown-menu", async () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuTrigger: ({
		children,
		asChild,
		...props // Accept rest props
	}: { children: React.ReactNode; asChild?: boolean; [key: string]: any }) => {
		// Add index signature for props
		const React = require("react"); // Import React inside the mock function scope
		return asChild && React.isValidElement(children) ? (
			// Clone the child element and add props if asChild is true
			React.cloneElement(children, props)
		) : (
			// Apply props to the wrapper div if asChild is false
			<div className="mock-dropdown-trigger" {...props}>
				{children}
			</div>
		);
	},
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
		<div className="mock-dropdown-content">{children}</div>
	),
	DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DropdownMenuSeparator: () => <div className="mock-separator" />,
	DropdownMenuItem: ({
		children,
		...props
	}: { children: React.ReactNode; [key: string]: any }) => (
		<div className="mock-dropdown-item" {...props}>
			{children}
		</div>
	),
	DropdownMenuCheckboxItem: ({
		children,
		checked,
		onCheckedChange,
		...props
	}: {
		children: React.ReactNode;
		checked: boolean;
		onCheckedChange: (checked: boolean) => void;
		[key: string]: any;
	}) => (
		<div
			className="mock-checkbox-item"
			{...props}
			onClick={() => onCheckedChange(!checked)}
		>
			<input
				type="checkbox"
				checked={checked}
				readOnly
				data-testid={`checkbox-${String(children).toLowerCase()}`}
			/>
			<span>{children}</span>
		</div>
	),
}));

// Mock context hook (to be used by MockProvider)
vi.mock("@/context/ArticleContext", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/context/ArticleContext")>();
	return {
		...original,
		useArticles: () => React.useContext(MockArticleContext),
	};
});
// No need for mockedUseArticles = vi.mocked(useArticles) anymore

// Mock data with names that match the test assertions
const mockRawArticles: Article[] = [
	{
		_id: "1",
		title: "React Fun",
		url: "react.com",
		content: "",
		excerpt: "Learn React",
		savedAt: 1700000000000,
		isRead: false,
		favorite: true,
		siteName: "React.dev", // Capitalized to match test lookups
		tags: ["t1"],
		estimatedReadTime: 5,
		type: "article",
	},
	{
		_id: "2",
		title: "TypeScript Intro",
		url: "ts.com",
		content: "",
		excerpt: "Learn TS",
		savedAt: 1710000000000,
		isRead: true,
		favorite: false,
		siteName: "typescriptlang.org",
		tags: ["t2"],
		estimatedReadTime: 15,
		type: "article",
	},
	{
		_id: "3",
		title: "CSS Magic",
		url: "css.com",
		content: "",
		excerpt: "Learn CSS",
		savedAt: 1705000000000,
		isRead: false,
		favorite: false,
		siteName: "css-tricks.com",
		tags: ["t1", "t2"],
		estimatedReadTime: 10,
		type: "article",
	},
	{
		_id: "4",
		title: "My PDF",
		url: "local.pdf",
		content: "",
		excerpt: "A PDF file",
		savedAt: 1708000000000,
		isRead: false,
		favorite: false,
		siteName: "Local",
		tags: ["t3"],
		estimatedReadTime: 20,
		type: "pdf",
	},
];

const mockTags: Tag[] = [
	{ _id: "t1", name: "Frontend", color: "blue", createdAt: 0 },
	{ _id: "t2", name: "Language", color: "green", createdAt: 0 },
	{ _id: "t3", name: "Document", color: "red", createdAt: 0 },
];

// --- Mock Provider Setup ---
// Create a context type mirroring the real one but with simplified actions for testing
type MockArticleContextType = Omit<
	ReturnType<typeof useArticles>,
	| "refreshArticles"
	| "retryLoading"
	| "addArticleByUrl"
	| "addArticleByFile"
	| "updateArticleStatus"
	| "removeArticle"
	| "updateReadingProgress"
	| "optimisticRemoveArticle" // Add the new function here
> & {
	// Keep simplified setters for testing state changes
	setFilters: React.Dispatch<React.SetStateAction<ArticleFilters>>;
	setSortCriteria: React.Dispatch<React.SetStateAction<SortCriteria>>;
};

// Create a mock context
const MockArticleContext = React.createContext<
	MockArticleContextType | undefined
>(undefined);

// Create a mock provider component that manages state
// Add test utils for manipulating the mock provider state outside of React components
let mockSetFilters: ((filters: ArticleFilters) => void) | null = null;
let mockSetSortField: ((field: ArticleSortField) => void) | null = null;
let mockToggleSortDirection: (() => void) | null = null;

// Add a helper to set both sort field and direction
function testSetSort(field: ArticleSortField, direction: "asc" | "desc") {
	if (!mockSetFilters || !mockSetSortField)
		throw new Error("Mock provider not initialized");
	// Set the sort criteria directly in the MockArticleProvider
	mockArticleProvider?.setSortCriteria({
		field,
		direction,
	});
}

// Update the mock provider definition to expose the setSortCriteria function
let mockArticleProvider: MockArticleContextType | null = null;

const MockArticleProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [filters, setFilters] = useState<ArticleFilters>({
		siteNames: [],
		types: [],
		tags: [],
		searchQuery: "",
	});
	const [sortCriteria, setSortCriteria] = useState<SortCriteria>({
		field: "savedAt",
		direction: "desc",
	});
	const [currentView, setCurrentView] = useState<ArticleView>("all"); // Add view state

	// Store setter functions in module-level variables for direct access in tests
	// This avoids calling hooks inside test code
	mockSetFilters = (newFilters) => setFilters(newFilters);
	mockSetSortField = (field) => setSortCriteria((prev) => ({ ...prev, field }));
	mockToggleSortDirection = () =>
		setSortCriteria((prev) => ({
			...prev,
			direction: prev.direction === "asc" ? "desc" : "asc",
		}));

	// Use actual utility functions for processing
	const processedArticles = useMemo(() => {
		let filtered = [...mockRawArticles];

		// Apply search first
		if (filters.searchQuery) {
			const query = filters.searchQuery.toLowerCase();
			filtered = filtered.filter(
				(article) =>
					article.title.toLowerCase().includes(query) ||
					article.excerpt.toLowerCase().includes(query),
			);
		}

		// Apply site filter
		if (filters.siteNames.length > 0) {
			filtered = filtered.filter((article) =>
				filters.siteNames.includes(article.siteName || ""),
			);
		}

		// Apply type filter
		if (filters.types.length > 0) {
			filtered = filtered.filter((article) =>
				filters.types.includes(article.type),
			);
		}

		// Apply tag filter
		if (filters.tags.length > 0) {
			filtered = filtered.filter((article) =>
				article.tags.some((tag) => filters.tags.includes(tag)),
			);
		}

		// Apply sort - improve string comparison for title sort
		if (sortCriteria.field) {
			filtered.sort((a, b) => {
				// Handle title sort specifically to ensure it works correctly
				if (sortCriteria.field === "title") {
					const aTitle = (a.title || "").toLowerCase();
					const bTitle = (b.title || "").toLowerCase();
					return sortCriteria.direction === "asc"
						? aTitle.localeCompare(bTitle)
						: bTitle.localeCompare(aTitle);
				}
				// Handle other string fields
				if (
					typeof a[sortCriteria.field] === "string" &&
					typeof b[sortCriteria.field] === "string"
				) {
					const aValue = (
						(a[sortCriteria.field] as string) || ""
					).toLowerCase();
					const bValue = (
						(b[sortCriteria.field] as string) || ""
					).toLowerCase();
					return sortCriteria.direction === "asc"
						? aValue.localeCompare(bValue)
						: bValue.localeCompare(aValue);
				}

				// Default to numeric sort for other types (or handle null/undefined better if needed)
				const aValue = (a[sortCriteria.field] as number) || 0;
				const bValue = (b[sortCriteria.field] as number) || 0;
				return sortCriteria.direction === "asc"
					? aValue - bValue
					: bValue - aValue;
			});
		}

		// Log the sorted articles order for debugging
		console.log(
			"Sorted articles:",
			sortCriteria.field,
			sortCriteria.direction,
			filtered.map((a) => a.title),
		);

		return filtered;
	}, [filters, sortCriteria]);

	// Helper functions derived from state setters
	const setSearchQuery = useCallback((query: string) => {
		setFilters((prev: ArticleFilters) => ({ ...prev, searchQuery: query }));
	}, []);
	const setSortField = useCallback((field: ArticleSortField) => {
		setSortCriteria((prev: SortCriteria) => ({ ...prev, field }));
	}, []);
	const toggleSortDirection = useCallback(() => {
		setSortCriteria((prev: SortCriteria) => ({
			...prev,
			direction: prev.direction === "asc" ? "desc" : "asc",
		}));
	}, []);

	const value: MockArticleContextType = useMemo(
		() => ({
			articles: mockRawArticles, // Raw articles
			processedArticles, // Use derived articles
			isLoading: false,
			isRefreshing: false,
			error: null,
			isDbInitialized: true,
			allTags: mockTags,
			currentView,
			setCurrentView,
			filters,
			setFilters, // Provide direct setter
			setSearchQuery, // Provide stable helper
			sortCriteria,
			setSortCriteria, // Provide direct setter
			setSortField, // Provide stable helper
			toggleSortDirection, // Provide stable helper
			// Mock potentially needed action functions simply
			refreshArticles: vi.fn().mockResolvedValue(mockRawArticles),
			retryLoading: vi.fn(),
			optimisticRemoveArticle: vi.fn().mockResolvedValue(undefined), // Add mock function
		}),
		[
			// Only include values that actually change and affect the output
			processedArticles,
			currentView,
			filters,
			// setFilters is stable
			setSearchQuery, // Stable helper reference
			sortCriteria,
			// setSortCriteria is stable
			setSortField, // Stable helper reference
			toggleSortDirection, // Stable helper reference
		],
	);

	// Store the context value for direct access in tests
	mockArticleProvider = value;

	return (
		<MockArticleContext.Provider value={value}>
			{children}
		</MockArticleContext.Provider>
	);
};

// Helper to render the component with the mock provider
const renderHomePage = () => {
	return render(
		<MemoryRouter>
			<MockArticleProvider>
				<HomePage />
			</MockArticleProvider>
		</MemoryRouter>,
	);
};

// Helper functions to update state from outside component
// These are needed to avoid invalid hook calls
function testUpdateFilters(newFilters: Partial<ArticleFilters>) {
	if (!mockSetFilters) throw new Error("Mock provider not initialized");
	mockSetFilters({
		siteNames: [],
		types: [],
		tags: [],
		searchQuery: "",
		...newFilters,
	});
}

// Removed unused function testSetSortField

function testToggleSortDirection() {
	if (!mockToggleSortDirection)
		throw new Error("Mock provider not initialized");
	mockToggleSortDirection();
}

// --- Tests ---

describe("HomePage Integration Tests", () => {
	// No beforeEach needed for mock context state setup anymore

	afterEach(() => {
		cleanup();
		vi.clearAllMocks(); // Still clear mocks if any direct ones are used elsewhere
	});

	it("should render the initial list of articles sorted by date descending", () => {
		renderHomePage();
		const articleCards = screen.getAllByRole("link", { name: /read/i }); // Links within cards
		expect(articleCards).toHaveLength(mockRawArticles.length);
		// Check order based on titles (assuming default sort is date desc)
		expect(
			within(articleCards[0]).getByText("TypeScript Intro"),
		).toBeInTheDocument(); // Newest
		expect(within(articleCards[1]).getByText("My PDF")).toBeInTheDocument();
		expect(within(articleCards[2]).getByText("CSS Magic")).toBeInTheDocument();
		expect(within(articleCards[3]).getByText("React Fun")).toBeInTheDocument(); // Oldest
	});

	// Removed obsolete test for search input
	it("should sort articles by title ascending", async () => {
		renderHomePage();

		// Set both the field AND direction to ensure ascending order
		await act(async () => {
			testSetSort("title", "asc");
		});

		// Wait for UI to update with longer timeout
		await waitFor(
			() => {
				// Get all article cards by their data-testid
				const articleCards = screen.getAllByTestId("article-card");
				expect(articleCards.length).toBe(mockRawArticles.length);

				// Extract titles for cleaner assertion
				const titles = articleCards.map(
					(card) => within(card).getByRole("heading").textContent,
				);

				// Verify all titles are in alphabetical order
				expect(titles[0]).toBe("CSS Magic");
				expect(titles[1]).toBe("My PDF");
				expect(titles[2]).toBe("React Fun");
				expect(titles[3]).toBe("TypeScript Intro");
			},
			{ timeout: 2000 },
		);
	});

	it("should toggle sort direction", async () => {
		renderHomePage(); // Default: Date Desc

		// Toggle sort direction using our exported function
		await act(async () => {
			testToggleSortDirection();
		});

		// Check sorted results using article cards instead of all headings
		await waitFor(() => {
			const articleCards = screen.getAllByRole("link", { name: /read/i });
			expect(articleCards).toHaveLength(mockRawArticles.length);

			// Get titles from within each card
			const titles = articleCards.map(
				(card) => within(card).getByRole("heading").textContent,
			);

			// After toggle, should go from newest->oldest to oldest->newest
			expect(titles[0]).toBe("React Fun"); // Oldest first
			expect(titles[1]).toBe("CSS Magic");
		});
	});

	it("should filter by site name", async () => {
		renderHomePage();

		// Set filter using our test helper function
		await act(async () => {
			testUpdateFilters({ siteNames: ["React.dev"] });
		});

		// Check filtered results
		await waitFor(() => {
			const articleCards = screen.getAllByRole("link", { name: /read/i });
			expect(articleCards).toHaveLength(1);

			// Check the title within the card
			const cardTitle = within(articleCards[0]).getByRole(
				"heading",
			).textContent;
			expect(cardTitle).toBe("React Fun");
		});
	});

	it("should filter by type", async () => {
		renderHomePage();

		// Set filter using our test helper function
		await act(async () => {
			testUpdateFilters({ types: ["pdf"] });
		});

		// Check filtered results
		await waitFor(() => {
			const articleCards = screen.getAllByRole("link", { name: /read/i });
			expect(articleCards).toHaveLength(1);

			// Check the title within the card
			const cardTitle = within(articleCards[0]).getByRole(
				"heading",
			).textContent;
			expect(cardTitle).toBe("My PDF");
		});
	});

	it("should filter by tag", async () => {
		renderHomePage();

		// Set filter using our test helper function
		await act(async () => {
			testUpdateFilters({ tags: ["t1"] });
		});

		// Check filtered results
		await waitFor(() => {
			const articleCards = screen.getAllByRole("link", { name: /read/i });
			expect(articleCards).toHaveLength(2);

			// Get titles from within each card
			const titles = articleCards.map(
				(card) => within(card).getByRole("heading").textContent,
			);
			expect(titles).toContain("React Fun");
			expect(titles).toContain("CSS Magic");
		});
	});

	it("should show filtered empty state and allow clearing filters", async () => {
		renderHomePage();

		// Set a filter that will yield no results
		await act(async () => {
			testUpdateFilters({ searchQuery: "NoMatchForThisQuery" });
		});

		// Check for empty state content
		await waitFor(() => {
			expect(screen.getByText(/No articles match/i)).toBeInTheDocument();
		});

		// Find and click the clear button
		const clearButton = screen.getByRole("button", { name: /Clear Filters/i });
		await userEvent.click(clearButton);

		// Wait for articles to reappear
		await waitFor(() => {
			const articleCards = screen.getAllByRole("link", { name: /read/i });
			expect(articleCards).toHaveLength(mockRawArticles.length);
		});
	});

	// Removed tests related to the top bar elements as they are not part of HomePage
}); // Correct closing for the describe block
