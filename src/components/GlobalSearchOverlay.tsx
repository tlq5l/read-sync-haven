import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useArticles } from "@/context/ArticleContext";
import type { Article } from "@/services/db/types"; // Updated path
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react"; // Removed unused React import
import { Link } from "react-router-dom";
import { Button } from "./ui/button";

interface GlobalSearchOverlayProps {
	isOpen: boolean;
	onClose: () => void;
}

/**
 * Determines whether the query matches the text using simple fuzzy matching.
 *
 * Returns `true` if the query is a substring of the text (case-insensitive), or if all characters of the query appear in order within the text for queries longer than two characters. Returns `false` if the query is empty or contains only whitespace.
 *
 * @param text - The text to search within.
 * @param query - The search query to match.
 * @returns Whether the query matches the text according to fuzzy matching rules.
 */
function fuzzyMatch(text: string, query: string): boolean {
	if (!query.trim()) return false;
	const lowerText = text.toLowerCase();
	const lowerQuery = query.toLowerCase();
	if (lowerText.includes(lowerQuery)) return true;
	if (lowerQuery.length <= 2) return lowerText.includes(lowerQuery);
	let queryIndex = 0;
	for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
		if (lowerText[i] === lowerQuery[queryIndex]) {
			queryIndex++;
		}
	}
	return queryIndex === lowerQuery.length;
}

/**
 * Displays a full-screen modal overlay for searching articles with fuzzy matching.
 *
 * Shows a search input and dynamically filters articles by title, excerpt, content, author, or site name as the user types. Results are limited to 10 and displayed in a scrollable list. The overlay closes when clicking outside, pressing Escape, or selecting a result.
 *
 * @param isOpen - Whether the overlay is visible.
 * @param onClose - Callback to close the overlay.
 */
export default function GlobalSearchOverlay({
	isOpen,
	onClose,
}: GlobalSearchOverlayProps) {
	const [searchTerm, setSearchTerm] = useState("");
	const { articles } = useArticles();
	const [filteredArticles, setFilteredArticles] = useState<Article[]>([]);
	const inputRef = useRef<HTMLInputElement>(null);
	const overlayRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (isOpen) {
			// Focus input when opened
			inputRef.current?.focus();
			// Add listener to close on outside click
			document.addEventListener("mousedown", handleClickOutside);
			// Add listener for Escape key
			document.addEventListener("keydown", handleEscapeKey);
		} else {
			setSearchTerm(""); // Clear search on close
			setFilteredArticles([]);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscapeKey);
		}

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscapeKey);
		};
	}, [isOpen]);

	useEffect(() => {
		if (!searchTerm.trim()) {
			setFilteredArticles([]);
			return;
		}

		const term = searchTerm.toLowerCase();
		// Combine filtering logic (simplified for overlay)
		const results = articles
			.filter(
				(article) =>
					article.title.toLowerCase().includes(term) ||
					article.excerpt?.toLowerCase().includes(term) ||
					(article.content && fuzzyMatch(article.content, term)) ||
					(article.author && fuzzyMatch(article.author, term)) ||
					(article.siteName && fuzzyMatch(article.siteName, term)),
			)
			.slice(0, 10); // Limit results for overlay

		setFilteredArticles(results);
	}, [searchTerm, articles]);

	const handleEscapeKey = (event: KeyboardEvent) => {
		if (event.key === "Escape") {
			onClose();
		}
	};

	const handleClickOutside = (event: MouseEvent) => {
		if (
			overlayRef.current &&
			!overlayRef.current.contains(event.target as Node)
		) {
			onClose();
		}
	};

	if (!isOpen) {
		return null;
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center pt-20">
			<Card ref={overlayRef} className="w-full max-w-2xl shadow-2xl">
				<CardContent className="p-4">
					<div className="relative mb-4">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
						<Input
							ref={inputRef}
							id="global-search-overlay-input"
							placeholder="Search articles..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10 pr-10 h-12 text-lg" // Larger input
						/>
						<Button
							variant="ghost"
							size="icon"
							className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8"
							onClick={onClose}
						>
							<X className="h-5 w-5" />
						</Button>
					</div>
					{searchTerm.trim() && (
						<div className="max-h-96 overflow-y-auto">
							{filteredArticles.length > 0 ? (
								<ul>
									{filteredArticles.map((article) => (
										<li key={article._id}>
											<Link
												to={`/read/${article._id}`}
												onClick={onClose} // Close overlay on navigation
												className="block p-3 hover:bg-accent rounded-md transition-colors"
											>
												<div className="font-medium line-clamp-1">
													{article.title || "Untitled"}
												</div>
												<div className="text-sm text-muted-foreground line-clamp-1">
													{article.excerpt || "No excerpt"}
												</div>
											</Link>
										</li>
									))}
								</ul>
							) : (
								<div className="text-center text-muted-foreground p-4">
									No results found for "{searchTerm}"
								</div>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
