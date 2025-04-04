// Removed unused import: import type { useArticles } from "@/context/ArticleContext";
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
		version: 1, // Added version
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
		version: 1, // Added version
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
		version: 1, // Added version
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
		version: 1, // Added version
	},
];
export const mockTags: Tag[] = [
	{ _id: "t1", name: "Frontend", color: "blue", createdAt: 0 },
	{ _id: "t2", name: "Language", color: "green", createdAt: 0 },
	{ _id: "t3", name: "Document", color: "red", createdAt: 0 },
];

// --- Mock Context Setup ---
// Revert to using Omit with the original type name
// Need to import useArticles again for ReturnType
import type { useArticles } from "@/context/ArticleContext";

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

// Create mock functions at module level to allow importing into tests
export const mockOptimisticRemoveArticle = vi.fn().mockResolvedValue(undefined);
export const mockRefreshArticles = vi.fn().mockResolvedValue(mockRawArticles);
export const mockRetryLoading = vi.fn();
// Add other action mocks here if needed for other tests

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
			);
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
			);
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
	);

	const value: MockArticleContextType = useMemo(
		() => ({
			articles: mockRawArticles,
			processedArticles,
			isLoading: false,
			isRefreshing: false,
			error: null,
			isDbInitialized: true,
			allTags: mockTags,
			currentView,
			setCurrentView,
			filters,
			setFilters,
			setSearchQuery,
			sortCriteria,
			setSortCriteria,
			setSortField,
			toggleSortDirection,
			setSelectedCategory,
			refreshArticles: mockRefreshArticles,
			retryLoading: mockRetryLoading,
			optimisticRemoveArticle: mockOptimisticRemoveArticle,
		}),
		[
			processedArticles,
			currentView,
			filters,
			setSearchQuery,
			sortCriteria,
			setSortField,
			setSelectedCategory,
			toggleSortDirection,
		],
	);

	return (
		<MockArticleContext.Provider value={value}>
			{children}
		</MockArticleContext.Provider>
	);
};

// Export test helper functions
export function testUpdateFilters(newFilters: Partial<ArticleFilters>) {
	if (!_mockSetFilters) {
		throw new Error("Cannot update filters - provider not mounted");
	}
	_mockSetFilters((prev) => ({ ...prev, ...newFilters }));
}

export function testSetSort(
	field: ArticleSortField,
	direction: "asc" | "desc",
) {
	if (!_mockSetSortCriteria) {
		throw new Error("Cannot update sort - provider not mounted");
	}
	_mockSetSortCriteria({ field, direction });
}

export function testToggleSortDirection() {
	if (!_mockSetSortCriteria) {
		throw new Error("Cannot toggle sort direction - provider not mounted");
	}
	_mockSetSortCriteria((prev) => ({
		...prev,
		direction: prev.direction === "asc" ? "desc" : "asc",
	}));
}
