import { useCallback, useState } from "react";

export type ArticleView = "all" | "unread" | "favorites";

/**
 * Hook to manage the current article view state.
 */
export function useArticleView(initialView: ArticleView = "all") {
	const [currentView, setCurrentViewInternal] =
		useState<ArticleView>(initialView);

	const setCurrentView = useCallback((view: ArticleView) => {
		setCurrentViewInternal(view);
	}, []);

	return { currentView, setCurrentView };
}
