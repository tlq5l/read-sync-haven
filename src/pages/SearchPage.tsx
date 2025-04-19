import ArticleCard from "@/components/ArticleCard";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { useArticles } from "@/context/ArticleContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

// Simple fuzzy matching helper function
function fuzzyMatch(text: string, query: string): boolean {
	// If there's no query, don't match anything
	if (!query.trim()) return false;

	// Convert both to lowercase for case-insensitive matching
	const lowerText = text.toLowerCase();
	const lowerQuery = query.toLowerCase();

	// Exact match is an automatic success
	if (lowerText.includes(lowerQuery)) return true;

	// For very short queries (1-2 chars), require exact match
	if (lowerQuery.length <= 2) return lowerText.includes(lowerQuery);

	// For longer queries, implement simple fuzzy matching
	let queryIndex = 0;
	for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
		if (lowerText[i] === lowerQuery[queryIndex]) {
			queryIndex++;
		}
	}

	// Match is successful if we found all query characters in sequence
	return queryIndex === lowerQuery.length;
}

/**
 * Displays a searchable interface for articles with fuzzy matching and progressive filtering.
 *
 * Provides real-time search results as the user types, prioritizing exact matches in article titles, excerpts, authors, and site names, then expanding to content and fuzzy matches if needed. Includes user feedback for loading, empty input, and no results.
 */
export default function SearchPage() {
	const [searchTerm, setSearchTerm] = useState("");
	const { articles } = useArticles();
	const { toast } = useToast();
	const [isSearching, setIsSearching] = useState(false);

	// Enhanced search functionality with content searching and fuzzy matching
	const filteredArticles = useMemo(() => {
		if (!searchTerm.trim()) return [];

		setIsSearching(true);

		try {
			// Start with simple matches for speed
			const term = searchTerm.toLowerCase();
			const exactMatches = articles.filter(
				(article) =>
					article.title.toLowerCase().includes(term) ||
					article.excerpt.toLowerCase().includes(term) ||
					(article.author?.toLowerCase().includes(term) ?? false) ||
					(article.siteName?.toLowerCase().includes(term) ?? false),
			);

			// Then try content matches if we don't have many results
			let contentMatches: typeof articles = [];
			if (exactMatches.length < 5) {
				contentMatches = articles.filter(
					(article) =>
						!exactMatches.includes(article) && // Avoid duplicates
						article.content?.toLowerCase().includes(term),
				);
			}

			// Finally, try fuzzy matches if we still don't have many results
			let fuzzyMatches: typeof articles = [];
			if (exactMatches.length + contentMatches.length < 3 && term.length > 2) {
				fuzzyMatches = articles.filter(
					(article) =>
						!exactMatches.includes(article) &&
						!contentMatches.includes(article) && // Avoid duplicates
						(fuzzyMatch(article.title, term) ||
							fuzzyMatch(article.excerpt, term) ||
							(article.author && fuzzyMatch(article.author, term)) ||
							(article.siteName && fuzzyMatch(article.siteName, term)) ||
							(article.content && fuzzyMatch(article.content, term))),
				);
			}

			// Combine all matches
			return [...exactMatches, ...contentMatches, ...fuzzyMatches];
		} finally {
			setIsSearching(false);
		}
	}, [articles, searchTerm]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();

		if (searchTerm.trim().length > 0) {
			toast({
				title: "Searching",
				description: `Searching for "${searchTerm}"...`,
			});
		}
	};

	return (
		<div className="h-full flex flex-col">
			<div className="border-b p-4 flex items-center gap-2">
				<Button variant="ghost" size="icon" asChild>
					<Link to="/">
						<ArrowLeft className="h-5 w-5" />
					</Link>
				</Button>
				<h1 className="text-2xl font-bold">Search</h1>
			</div>

			<div className="p-4">
				<form onSubmit={handleSearch}>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							// Removed ID as focus is handled by the global overlay now
							placeholder="Search articles..."
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							className="pl-10"
						/>
					</div>
				</form>
			</div>

			<div className="flex-1 overflow-y-auto p-4">
				{isSearching ? (
					<div className="flex items-center justify-center h-64">
						<p className="text-muted-foreground">Searching...</p>
					</div>
				) : searchTerm.trim() === "" ? (
					<div className="flex items-center justify-center h-64">
						<p className="text-muted-foreground">
							Enter search terms to find articles
						</p>
					</div>
				) : filteredArticles.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-64">
						<p className="text-muted-foreground mb-2">
							No articles found for "{searchTerm}"
						</p>
						<p className="text-sm text-muted-foreground">
							Try a different search term or check your spelling
						</p>
					</div>
				) : (
					<div>
						<p className="text-sm text-muted-foreground mb-4">
							Found {filteredArticles.length}{" "}
							{filteredArticles.length === 1 ? "result" : "results"} for "
							{searchTerm}"
						</p>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							{filteredArticles.map((article) => (
								<ArticleCard key={article._id} article={article} />
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
