import ArticleCard from "@/components/ArticleCard";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { useArticles } from "@/context/ArticleContext";

import { ArrowLeft, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

export default function SearchPage() {
	const [searchTerm, setSearchTerm] = useState("");
	const { articles } = useArticles();

	// Simple search functionality for the MVP
	const filteredArticles = articles.filter((article) => {
		if (!searchTerm.trim()) return false;

		const term = searchTerm.toLowerCase();
		return (
			article.title.toLowerCase().includes(term) ||
			article.excerpt.toLowerCase().includes(term) ||
			article.author?.toLowerCase().includes(term) ||
			article.siteName?.toLowerCase().includes(term)
		);
	});

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
				<div className="relative">
					<Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Search articles..."
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className="pl-10"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-4">
				{searchTerm.trim() === "" ? (
					<div className="flex items-center justify-center h-64">
						<p className="text-muted-foreground">
							Enter search terms to find articles
						</p>
					</div>
				) : filteredArticles.length === 0 ? (
					<div className="flex items-center justify-center h-64">
						<p className="text-muted-foreground">
							No articles found for "{searchTerm}"
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{filteredArticles.map((article) => (
							<ArticleCard key={article._id} article={article} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
