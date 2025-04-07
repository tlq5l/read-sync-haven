import { type DexieArticle, db } from "@/services/db/dexie"; // Import dexie db and type
import type { Article } from "@/services/db/types"; // Updated path for Article type
import { useEffect, useState } from "react";

// Define mapping function locally
const mapDexieToArticleLocal = (
	dexieArticle: DexieArticle | undefined,
): Article | null => {
	if (!dexieArticle) return null;
	const { id, ...rest } = dexieArticle;
	return {
		_id: id,
		version: 1, // Add a default version or retrieve if stored
		...rest,
	};
};

/**
 * Custom hook to fetch and manage article data.
 * @param id The ID of the article to fetch.
 * @returns An object containing the article data, loading state, and error state.
 */
export function useArticleData(id: string | undefined) {
	const [article, setArticle] = useState<Article | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	// const { updateArticleStatus } = useArticles(); // Removed as unused after fixing loop

	useEffect(() => {
		const fetchArticle = async () => {
			if (!id) {
				setLoading(false);
				setError("No article ID provided.");
				return;
			}

			setLoading(true);
			setError(null);
			setArticle(null); // Reset article state on new ID

			try {
				console.log("Fetching article with ID:", id);
				const articleData = mapDexieToArticleLocal(await db.articles.get(id));
				console.log("Article data:", articleData);

				if (!articleData) {
					setError("Article not found");
				} else {
					setArticle(articleData);
					// Mark as read logic should be handled elsewhere (e.g., on component mount/unmount or user action)
					// Removing this call to prevent potential loops
					// if (!articleData.isRead) {
					// 	// updateArticleStatus(id, true); // Removed problematic call
					// }
				}
			} catch (err) {
				console.error("Error fetching article:", err);
				setError(err instanceof Error ? err.message : "Failed to load article");
			} finally {
				setLoading(false);
			}
		};

		fetchArticle();
	}, [id]); // Remove unused updateArticleStatus dependency

	return { article, loading, error, setArticle }; // Return setArticle for local updates like favorite toggle
}
