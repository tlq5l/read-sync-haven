import { useArticles } from "@/context/ArticleContext";
import { type Article, getArticle } from "@/services/db";
import { useEffect, useState } from "react";

/**
 * Custom hook to fetch and manage article data.
 * @param id The ID of the article to fetch.
 * @returns An object containing the article data, loading state, and error state.
 */
export function useArticleData(id: string | undefined) {
	const [article, setArticle] = useState<Article | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const { updateArticleStatus } = useArticles(); // Get context function

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
				const articleData = await getArticle(id);
				console.log("Article data:", articleData);

				if (!articleData) {
					setError("Article not found");
				} else {
					setArticle(articleData);
					// Mark as read if not already
					if (!articleData.isRead) {
						// Use the context function directly
						updateArticleStatus(id, true);
					}
				}
			} catch (err) {
				console.error("Error fetching article:", err);
				setError(err instanceof Error ? err.message : "Failed to load article");
			} finally {
				setLoading(false);
			}
		};

		fetchArticle();
	}, [id, updateArticleStatus]); // Add updateArticleStatus dependency

	return { article, loading, error, setArticle }; // Return setArticle for local updates like favorite toggle
}
