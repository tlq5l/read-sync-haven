import type { useArticles } from "@/context/ArticleContext";
import type { ArticleView } from "@/hooks/useArticleView";
import type { Article, ArticleCategory, Tag } from "@/services/db"; // Import ArticleCategory from db
import type {
	ArticleFilters,
	ArticleSortField,
	SortCriteria,
} from "@/types/articles";
import { act } from "@testing-library/react"; // Import act (keep only one)
import React, { useCallback, useMemo, useState } from "react";
import { vi } from "vitest"; // Import vi

// --- Mock Data (Copied for self-containment, consider centralizing if used elsewhere) ---
export const mockRawArticles: Article[] = [
	{
		_id: "1",
		title: "React Fun",
		url: "react.com",
		content: "",
		excerpt: "Learn React",
		savedAt: 1700000000000,
		status: "inbox",
		isRead: false,
		favorite: true,
		siteName: "React.dev",
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
		status: "inbox",
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
		status: "inbox",
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
		status: "inbox",
		isRead: false,
		favorite: false,
		siteName: "Local",
		tags: ["t3"],
		estimatedReadTime: 20,
		type: "pdf",
	},
];
export const mockTags: Tag[] = [
	{ _id: "t1", name: "Frontend", color: "blue", createdAt: 0 },
	{ _id: "t2", name: "Language", color: "green", createdAt: 0 },
	{ _id: "t3", name: "Document", color: "red", createdAt: 0 },
];

// --- Mock Context Setup ---
export type MockArticleContextType = Omit<
	ReturnType<typeof useArticles>,
	| "refreshArticles"
	| "retryLoading"
	| "addArticleByUrl"
	| "addArticleByFile"
	| "updateArticleStatus"
	| "removeArticle"
	| "updateReadingProgress"
	| "optimisticRemoveArticle"
> & {
	setFilters: React.Dispatch<React.SetStateAction<ArticleFilters>>;
	setSortCriteria: React.Dispatch<React.SetStateAction<SortCriteria>>;
};

export const MockArticleContext = React.createContext<
	MockArticleContextType | undefined
>(undefined);

// Module-level variables to hold setters for test access
let _mockSetFilters: React.Dispatch<
	React.SetStateAction<ArticleFilters>
> | null = null;
let _mockSetSortCriteria: React.Dispatch<
	React.SetStateAction<SortCriteria>
> | null = null;

export const MockArticleProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [filters, setFilters] = useState<ArticleFilters>({
		siteNames: [],
		types: [],
		tags: [],
		searchQuery: "",
		category: null,
	});
	const [sortCriteria, setSortCriteria] = useState<SortCriteria>({
		field: "savedAt",
		direction: "desc",
	});
	const [currentView, setCurrentView] = useState<ArticleView>("all");

	_mockSetFilters = setFilters;
	_mockSetSortCriteria = setSortCriteria;

	const processedArticles = useMemo(() => {
		let filtered = [...mockRawArticles];
		if (filters.searchQuery) {
			const query = filters.searchQuery.toLowerCase();
			filtered = filtered.filter(
				(a) =>
					a.title.toLowerCase().includes(query) ||
					a.excerpt?.toLowerCase().includes(query),
			); // Optional chaining for excerpt
		}
		if (filters.siteNames.length > 0)
			filtered = filtered.filter((a) =>
				filters.siteNames.includes(a.siteName || ""),
			);
		if (filters.types.length > 0)
			filtered = filtered.filter((a) => filters.types.includes(a.type));
		if (filters.tags.length > 0)
			filtered = filtered.filter((a) =>
				a.tags?.some((tag) => filters.tags.includes(tag)),
			); // Optional chaining for tags
		if (filters.category)
			filtered = filtered.filter((a) => a.category === filters.category);

		if (sortCriteria.field) {
			filtered.sort((a, b) => {
				const aValue = a[sortCriteria.field];
				const bValue = b[sortCriteria.field];
				const aIsNull = aValue == null;
				const bIsNull = bValue == null;
				if (aIsNull && bIsNull) return 0;
				if (aIsNull) return 1;
				if (bIsNull) return -1;

				let comparison = 0;
				if (typeof aValue === "string" && typeof bValue === "string") {
					comparison = aValue.localeCompare(bValue);
				} else if (typeof aValue === "number" && typeof bValue === "number") {
					comparison = aValue - bValue;
				}
				return sortCriteria.direction === "desc" ? comparison * -1 : comparison;
			});
		}
		return filtered;
	}, [filters, sortCriteria]);

	const setSearchQuery = useCallback(
		(query: string) => setFilters((prev) => ({ ...prev, searchQuery: query })),
		[],
	);
	const setSortField = useCallback(
		(field: ArticleSortField) =>
			setSortCriteria((prev) => ({ ...prev, field })),
		[],
	);
	const toggleSortDirection = useCallback(
		() =>
			setSortCriteria((prev) => ({
				...prev,
				direction: prev.direction === "asc" ? "desc" : "asc",
			})),
		[],
	);
	const setSelectedCategory = useCallback(
		(category: ArticleCategory | null) =>
			setFilters((prev) => ({ ...prev, category })),
		[],
	); // Correct type for category

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
			setSelectedCategory, // Added mock setter
			// Mock potentially needed action functions simply
			refreshArticles: vi.fn().mockResolvedValue(mockRawArticles),
			retryLoading: vi.fn(),
			optimisticRemoveArticle: vi.fn().mockResolvedValue(undefined),
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
			setSelectedCategory, // Add stable mock function reference
			toggleSortDirection, // Stable helper reference
		],
	);

	return (
		<MockArticleContext.Provider value={value}>
			{children}
		</MockArticleContext.Provider>
	);
};

// Test utility functions
export function testUpdateFilters(newFilters: Partial<ArticleFilters>) {
	if (!_mockSetFilters) {
		console.error(
			"Mock provider not initialized for filters. Ensure MockArticleProvider is rendered.",
		);
		return; // Or throw error
	}
	const setFilters = _mockSetFilters; // Assign after check
	act(() => {
		setFilters((prev) => ({ ...prev, ...newFilters }));
	});
}

export function testSetSort(
	field: ArticleSortField,
	direction: "asc" | "desc",
) {
	if (!_mockSetSortCriteria) {
		console.error(
			"Mock provider not initialized for sort criteria. Ensure MockArticleProvider is rendered.",
		);
		return; // Or throw error
	}
	const setSortCriteria = _mockSetSortCriteria; // Assign after check
	act(() => {
		setSortCriteria({ field, direction });
	});
}

export function testToggleSortDirection() {
	if (!_mockSetSortCriteria) {
		console.error(
			"Mock provider not initialized for sort criteria. Ensure MockArticleProvider is rendered.",
		);
		return; // Or throw error
	}
	const setSortCriteria = _mockSetSortCriteria; // Assign after check
	act(() => {
		setSortCriteria((prev) => ({
			...prev,
			direction: prev.direction === "asc" ? "desc" : "asc",
		}));
	});
}
