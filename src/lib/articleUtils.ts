import type { Article } from "@/services/db/types"; // Updated path
import type { ArticleFilters, SortCriteria } from "@/types/articles";

/**
 * Returns a new array of articles that match all specified filter criteria.
 *
 * Filters include search query (matching title, excerpt, or site name), site names, types, tags (at least one must match), and category.
 *
 * @param articles - The articles to filter.
 * @param filters - Criteria specifying which articles to include.
 * @returns Articles that satisfy all provided filters.
 */
export function filterArticles(
	articles: Article[],
	filters: ArticleFilters,
): Article[] {
	const { siteNames, types, tags, searchQuery, category } = filters; // Add category
	const query = searchQuery.toLowerCase().trim();

	return articles.filter((article) => {
		// Filter by search query (title, excerpt, siteName)
		if (query) {
			const titleMatch = article.title?.toLowerCase().includes(query);
			const excerptMatch = article.excerpt?.toLowerCase().includes(query);
			const siteNameMatch = article.siteName?.toLowerCase().includes(query);
			if (!titleMatch && !excerptMatch && !siteNameMatch) {
				return false;
			}
		}

		// Filter by site names
		if (siteNames.length > 0 && !siteNames.includes(article.siteName || "")) {
			return false;
		}

		// Filter by types
		if (types.length > 0 && !types.includes(article.type)) {
			return false;
		}

		// Filter by tags (article must have at least one of the selected tags)
		if (
			tags.length > 0 &&
			!tags.some((tagId) => article.tags?.includes(tagId))
		) {
			return false;
		}
		// Filter by category
		if (category && article.category !== category) {
			return false;
		}

		return true; // Article passes all filters
	});
}

/**
 * Sorts an array of articles based on the provided criteria.
 * @param articles - The array of articles to sort.
 * @param sortCriteria - The sorting criteria (field and direction).
 * @returns A new array containing the sorted articles.
 */
export function sortArticles(
	articles: Article[],
	sortCriteria: SortCriteria,
): Article[] {
	const { field, direction } = sortCriteria;

	// Create a shallow copy to avoid modifying the original array
	const sortedArticles = [...articles];

	sortedArticles.sort((a, b) => {
		const valA = a[field];
		const valB = b[field];
		const aIsNull = valA == null;
		const bIsNull = valB == null;

		// Handle nulls first: they always go to the end regardless of direction.
		if (aIsNull && bIsNull) {
			return 0; // Both null, treat as equal
		}
		if (aIsNull) {
			return 1; // a is null, always comes after b
		}
		if (bIsNull) {
			return -1; // b is null, always comes after a
		}

		// --- Neither value is null, proceed with comparison ---
		let comparison = 0;
		if (typeof valA === "string" && typeof valB === "string") {
			comparison = valA.localeCompare(valB);
		} else if (typeof valA === "number" && typeof valB === "number") {
			comparison = valA - valB;
		}
		// Add more type comparisons if needed (e.g., dates as numbers)

		// Apply direction multiplier ONLY to non-null comparisons
		return direction === "desc" ? comparison * -1 : comparison;
	});

	return sortedArticles;
}

/**
 * Extracts unique site names from a list of articles.
 * @param articles - The array of articles.
 * @returns An array of unique site names.
 */
export function getUniqueSiteNames(articles: Article[]): string[] {
	const siteNames = new Set<string>();
	for (const article of articles) {
		if (article.siteName) {
			siteNames.add(article.siteName);
		}
	}
	// Explicitly sort alphabetically, handling potential case differences
	return Array.from(siteNames).sort((a, b) => a.localeCompare(b));
}

/**
 * Extracts unique article types from a list of articles.
 * @param articles - The array of articles.
 * @returns An array of unique article types.
 */
export function getUniqueArticleTypes(articles: Article[]): Article["type"][] {
	const types = new Set<Article["type"]>();
	for (const article of articles) {
		types.add(article.type);
	}
	// Define a canonical order for types if desired
	const typeOrder: Article["type"][] = ["article", "pdf", "epub", "note"];
	return Array.from(types).sort(
		(a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b),
	);
}
