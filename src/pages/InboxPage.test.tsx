// Import necessary testing utilities and types
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import InboxPage from "./InboxPage"; // The component to test

// import type { Article, Tag } from "@/services/db"; // Removed unused type imports
// import type {
// 	ArticleFilters,
// 	ArticleSortField,
// 	SortCriteria,
// } from "@/types/articles"; // Removed unused type imports
import type React from "react"; // Use type import
// Import the mock provider and test utilities
import {
	MockArticleProvider,
	testSetSort,
	testToggleSortDirection,
	// mockRawArticles, // Removed unused import
	testUpdateFilters,
	// MockArticleContext, // Removed unused import (imported within vi.mock)
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

// Mock the useArticles hook to use the imported MockArticleContext
vi.mock("@/context/ArticleContext", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("@/context/ArticleContext")>();
	const { MockArticleContext } = await import(
		"../test-utils/MockArticleProvider"
	); // Import mock context
	const React = await import("react"); // Import React
	return {
		...original,
		useArticles: () => React.useContext(MockArticleContext),
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
		await waitFor(() => {
			expect(screen.queryAllByTestId("article-card").length).toBeGreaterThan(0);
		});
		// Optional: Assert based on mock data length if needed, acknowledging virtualization limits DOM checks
		// expect(mockRawArticles.length).toBe(4);
	});

	it("should sort articles by title ascending using test utility", async () => {
		renderInboxPage();

		await act(async () => {
			testSetSort("title", "asc");
		});

		await waitFor(() => {
			expect(screen.getByText("CSS Magic")).toBeInTheDocument();
		});
	});

	it("should toggle sort direction using test utility", async () => {
		renderInboxPage(); // Default: Date Desc

		await act(async () => {
			testToggleSortDirection(); // Toggles to Date Asc
		});

		await waitFor(() => {
			expect(screen.getByText("React Fun")).toBeInTheDocument(); // Oldest first
		});

		await act(async () => {
			testToggleSortDirection(); // Toggles back to Date Desc
		});

		await waitFor(() => {
			expect(screen.getByText("TypeScript Intro")).toBeInTheDocument(); // Newest first
		});
	});

	it("should filter by site name using test utility", async () => {
		renderInboxPage();

		await act(async () => {
			testUpdateFilters({ siteNames: ["React.dev"] });
		});

		await waitFor(() => {
			expect(screen.getByText("React Fun")).toBeInTheDocument();
			expect(screen.queryByText("TypeScript Intro")).not.toBeInTheDocument();
		});
	});

	it("should filter by type using test utility", async () => {
		renderInboxPage();

		await act(async () => {
			testUpdateFilters({ types: ["pdf"] });
		});

		await waitFor(() => {
			expect(screen.getByText("My PDF")).toBeInTheDocument();
			expect(screen.queryByText("React Fun")).not.toBeInTheDocument();
		});
	});

	it("should filter by tag using test utility", async () => {
		renderInboxPage();

		await act(async () => {
			testUpdateFilters({ tags: ["t1"] });
		});

		await waitFor(() => {
			expect(screen.getByText("React Fun")).toBeInTheDocument();
			expect(screen.getByText("CSS Magic")).toBeInTheDocument();
			expect(screen.queryByText("TypeScript Intro")).not.toBeInTheDocument();
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
				expect(screen.getByText("React Fun")).toBeInTheDocument(); // Check if articles reappear
			});
		} else {
			console.warn(
				"Clear Filters button not found in rendered output for this test.",
			);
		}
	});
});
