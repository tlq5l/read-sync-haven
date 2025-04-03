import type { Article, ArticleCategory } from "@/services/db"; // Import Article and ArticleCategory

// Sorting
export type ArticleSortField =
	| "savedAt"
	| "title"
	| "siteName"
	| "estimatedReadTime";
export type SortDirection = "asc" | "desc";

export interface SortCriteria {
	field: ArticleSortField;
	direction: SortDirection;
}

// Filtering
export interface ArticleFilters {
	siteNames: string[];
	types: Article["type"][];
	tags: string[]; // Array of tag IDs
	searchQuery: string;
	category?: ArticleCategory | null; // Optional category filter
}

// Context Value Extension (Illustrative - will be merged into ArticleContextType)
// We won't export this directly, but it shows the new fields
// interface ArticleContextExtensions {
//   sortCriteria: SortCriteria;
//   setSortCriteria: (criteria: SortCriteria) => void;
//   filters: ArticleFilters;
//   setFilters: (filters: ArticleFilters) => void; // Or individual setters
//   setSearchQuery: (query: string) => void;
//   addSiteFilter: (siteName: string) => void;
//   removeSiteFilter: (siteName: string) => void;
//   // ... other filter setters
//   allTags: Tag[]; // For populating filter UI
//   processedArticles: Article[]; // The final list to display
// }
