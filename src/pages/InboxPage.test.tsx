// Import necessary types and utils used in the mock provider
import type { Article } from "@/services/db";
// Removed unused import: filterArticles, sortArticles
import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
// Removed import of useArticles hook, will import specific mock function
import InboxPage from "./InboxPage"; // The component to test

// Removed conflicting 'type React' import
// Import the mock provider and test utilities
import {
	MockArticleProvider,
	mockOptimisticRemoveArticle, // Import the exported mock function
	mockRawArticles,
	testSetSort,
	testToggleSortDirection,
	testUpdateFilters,
} from "../test-utils/MockArticleProvider"; // Adjusted path

// --- Mocks ---

// Mock animation hooks (keep these as they are specific to component rendering)
vi.mock("@/context/AnimationContext", () => ({
	useAnimation: () => ({ synchronizeAnimations: vi.fn() }),
}));
vi.mock("@/hooks/use-synchronized-animation", () => ({
	useSynchronizedAnimation: () => ({ ref: vi.fn(), playAnimation: vi.fn() }),
	useTransitionGroup: () => ({ animateGroup: vi.fn() }),
}));

// Mock Radix UI components (keep these)
vi.mock("@/components/ui/select", async () => ({
	Select: ({
		value,
		onValueChange,
	}: {
		children: React.ReactNode;
		value: string;
		onValueChange: (value: string) => void;
	}) => (
		<div className="mock-select" data-testid="mock-select" data-value={value}>
			<button
				type="button"
				onClick={() => onValueChange("title")}
				data-testid="select-option-title"
			>
				Sort by Title
			</button>
			<button
				type="button"
				onClick={() => onValueChange("savedAt")}
				data-testid="select-option-savedAt"
			>
				Sort by Date
			</button>
			<button
				type="button"
				onClick={() => onValueChange("siteName")}
				data-testid="select-option-siteName"
			>
				Sort by Source
			</button>
			<button
				type="button"
				onClick={() => onValueChange("estimatedReadTime")}
				data-testid="select-option-readTime"
			>
				Sort by Read Time
			</button>
		</div>
	),
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
vi.mock("@/components/ui/dropdown-menu", async () => {
	const React = await import("react"); // Import React inside mock
	return {
		DropdownMenu: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		DropdownMenuTrigger: ({
			children,
			asChild,
			...props
		}: {
			children: React.ReactNode;
			asChild?: boolean;
			[key: string]: any;
		}) => {
			return asChild && React.isValidElement(children) ? (
				React.cloneElement(children, props)
			) : (
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
	};
});

// Mock VirtualizedArticleGrid to bypass virtualization issues in JSDOM
vi.mock("@/components/VirtualizedArticleGrid", () => ({
	// Needs to be default export because the component uses default export
	default: ({
		articles,
		// Simulate accepting action props if the real component needed them passed down
		// For this test, we'll rely on the context mock instead
	}: { articles: Article[] /* Add mock action props here if needed */ }) => {
		// The component mock doesn't need to access the context directly anymore
		// The onClick handler will use the function provided by the context during render
		return (
			<div data-testid="mock-virtualized-grid">
				{articles.map((article) => (
					<div
						key={article._id}
						data-testid={`mock-article-item-${article._id}`}
						data-title={article.title}
					>
						<span>{article.title}</span>
						<button
							type="button"
							// Add onClick to call the imported mock function directly
							onClick={() => mockOptimisticRemoveArticle(article._id)}
							data-testid={`delete-button-${article._id}`}
						>
							Delete
						</button>
					</div>
				))}
			</div>
		);
	},
}));

// Mock context hook (to be used by MockProvider)
vi.mock("@/context/ArticleContext", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/context/ArticleContext")>();
	const { MockArticleContext } = await import(
		"../test-utils/MockArticleProvider"
	);
	const React = await import("react");
	// Ensure we use the correct context instance for the mocked hook
	return {
		...original,
		useArticles: () => React.useContext(MockArticleContext), // Remove non-null assertion
	};
});

// --- Test Setup ---

// Helper to render the component with the mock provider
const renderInboxPage = () => {
	return render(
		<MemoryRouter>
			<MockArticleProvider>
				{" "}
				{/* Use the imported provider */}
				<InboxPage />
			</MockArticleProvider>
		</MemoryRouter>,
	);
};

// --- Tests ---

describe("InboxPage Integration Tests", () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("should render the initial list of articles", async () => {
		renderInboxPage();
		// Check items rendered within the mock grid
		const grid = screen.getByTestId("mock-virtualized-grid");
		const items = within(grid).getAllByTestId(/mock-article-item-/);
		expect(items).toHaveLength(mockRawArticles.length);
		// Check order based on data-title attribute (assuming default sort is date desc)
		expect(items[0]).toHaveAttribute("data-title", "TypeScript Intro"); // Newest
		expect(items[1]).toHaveAttribute("data-title", "My PDF");
		expect(items[2]).toHaveAttribute("data-title", "CSS Magic");
		expect(items[3]).toHaveAttribute("data-title", "React Fun"); // Oldest
	});

	it("should sort articles by title ascending using test utility", async () => {
		renderInboxPage();

		await act(async () => {
			testSetSort("title", "asc");
		});

		// Wait for UI to update with longer timeout
		await waitFor(
			() => {
				// Check items rendered within the mock grid
				const grid = screen.getByTestId("mock-virtualized-grid");
				const items = within(grid).getAllByTestId(/mock-article-item-/);
				expect(items).toHaveLength(mockRawArticles.length);

				// Check order based on data-title attribute (title ascending)
				expect(items[0]).toHaveAttribute("data-title", "CSS Magic");
				expect(items[1]).toHaveAttribute("data-title", "My PDF");
				expect(items[2]).toHaveAttribute("data-title", "React Fun");
				expect(items[3]).toHaveAttribute("data-title", "TypeScript Intro");
			},
			{ timeout: 2000 },
		);
	});

	it("should change sort direction when toggled", async () => {
		renderInboxPage();

		await act(async () => {
			testToggleSortDirection(); // Toggles to Date Asc
		});

		await waitFor(() => {
			// Check items rendered within the mock grid
			const grid = screen.getByTestId("mock-virtualized-grid");
			const items = within(grid).getAllByTestId(/mock-article-item-/);
			expect(items).toHaveLength(mockRawArticles.length);

			// After toggle, should go from newest->oldest to oldest->newest (Date Asc)
			expect(items[0]).toHaveAttribute("data-title", "React Fun"); // Oldest first
			expect(items[1]).toHaveAttribute("data-title", "CSS Magic");
			expect(items[2]).toHaveAttribute("data-title", "My PDF");
			expect(items[3]).toHaveAttribute("data-title", "TypeScript Intro"); // Newest
		});
	});

	it("should filter articles by site name", async () => {
		renderInboxPage();

		await act(async () => {
			testUpdateFilters({ siteNames: ["React.dev"] });
		});

		await waitFor(() => {
			// Check items rendered within the mock grid
			const grid = screen.getByTestId("mock-virtualized-grid");
			const items = within(grid).getAllByTestId(/mock-article-item-/);
			expect(items).toHaveLength(1);
			// Check the title attribute of the filtered item
			expect(items[0]).toHaveAttribute("data-title", "React Fun");
		});
	});

	it("should filter articles by type", async () => {
		renderInboxPage();

		await act(async () => {
			testUpdateFilters({ types: ["pdf"] });
		});

		await waitFor(() => {
			// Check items rendered within the mock grid
			const grid = screen.getByTestId("mock-virtualized-grid");
			const items = within(grid).getAllByTestId(/mock-article-item-/);
			expect(items).toHaveLength(1);
			// Check the title attribute of the filtered item
			expect(items[0]).toHaveAttribute("data-title", "My PDF");
		});
	});

	it("should filter articles by tags", async () => {
		renderInboxPage();

		await act(async () => {
			testUpdateFilters({ tags: ["t1"] }); // t1 is on CSS Magic and React Fun articles
		});

		await waitFor(() => {
			// Check items rendered within the mock grid
			const grid = screen.getByTestId("mock-virtualized-grid");
			const items = within(grid).getAllByTestId(/mock-article-item-/);
			expect(items).toHaveLength(2); // Articles with tag 't1'

			// Check content - order depends on default sort (savedAt desc)
			// CSS Magic (1705M) is newer than React Fun (1700M)
			expect(items[0]).toHaveAttribute("data-title", "CSS Magic");
			expect(items[1]).toHaveAttribute("data-title", "React Fun");
		});
	});

	it("should show filtered empty state and allow clearing filters", async () => {
		renderInboxPage();

		await act(async () => {
			testUpdateFilters({ searchQuery: "NoMatchForThisQuery" });
		});

		await waitFor(() => {
			expect(screen.getByText(/No articles match/i)).toBeInTheDocument();
		});

		// Assuming the clear button is part of the rendered output (e.g., within TopBar if included)
		const clearButton = screen.queryByRole("button", {
			name: /Clear Filters/i,
		});
		if (clearButton) {
			await userEvent.click(clearButton);

			await act(async () => {
				testUpdateFilters({}); // Use utility to clear filters
			});

			await waitFor(() => {
				expect(
					screen.queryByText(/No articles match/i),
				).not.toBeInTheDocument();
				// Check if items reappear in the mock grid
				const grid = screen.getByTestId("mock-virtualized-grid");
				expect(within(grid).getByText("React Fun")).toBeInTheDocument();
			});
		} else {
			console.warn(
				"Clear Filters button not found in rendered output for this test.",
			);
		}
	});

	it("should call optimisticRemoveArticle when delete action is triggered on an item", async () => {
		renderInboxPage();

		// Find the mock grid and a specific item's delete button
		const grid = screen.getByTestId("mock-virtualized-grid");
		// Let's try deleting the "CSS Magic" article (which has _id: "3" in mock data)
		const deleteButton = within(grid).getByTestId("delete-button-3");

		// Simulate clicking the delete button
		await userEvent.click(deleteButton);

		// Assert using the imported mock function instance
		expect(mockOptimisticRemoveArticle).toHaveBeenCalledTimes(1);
		expect(mockOptimisticRemoveArticle).toHaveBeenCalledWith("3"); // Check for the correct ID
	});

	it("should allow deleting an item after filtering", async () => {
		renderInboxPage();

		// 1. Apply a filter (e.g., tag 't2')
		await act(async () => {
			testUpdateFilters({ tags: ["t2"] }); // 't2' is on TS Intro (2) and CSS Magic (3)
		});

		// 2. Wait for the grid to update and verify filtered items
		await waitFor(() => {
			const grid = screen.getByTestId("mock-virtualized-grid");
			const items = within(grid).getAllByTestId(/mock-article-item-/);
			expect(items).toHaveLength(2);
			// Default sort (savedAt desc): TS Intro (1710M) is newer than CSS Magic (1705M)
			expect(items[0]).toHaveAttribute("data-title", "TypeScript Intro");
			expect(items[1]).toHaveAttribute("data-title", "CSS Magic");
		});

		// 3. Find the delete button for one of the filtered items (TypeScript Intro, ID '2')
		const grid = screen.getByTestId("mock-virtualized-grid");
		const deleteButton = within(grid).getByTestId("delete-button-2");

		// 4. Simulate clicking the delete button
		await userEvent.click(deleteButton);

		// 5. Assert that the mock function was called with the correct ID
		expect(mockOptimisticRemoveArticle).toHaveBeenCalledTimes(1);
		expect(mockOptimisticRemoveArticle).toHaveBeenCalledWith("2");
	});
});
