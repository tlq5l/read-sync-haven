import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArticles } from "@/context/ArticleContext";
import { isValidUrl } from "@/services/parser";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface UrlInputProps {
	onSuccess?: () => void;
}

export default function UrlInput({ onSuccess }: UrlInputProps) {
	const [url, setUrl] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { addArticleByUrl } = useArticles();
	const navigate = useNavigate();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Reset error state
		setError(null);

		// Validate URL
		if (!url.trim()) {
			setError("Please enter a URL");
			return;
		}

		if (!isValidUrl(url)) {
			setError("Please enter a valid URL");
			return;
		}

		setIsSubmitting(true);

		try {
			const article = await addArticleByUrl(url);

			if (article) {
				setUrl("");
				if (onSuccess) {
					onSuccess();
				} else {
					// Navigate to the article reader page
					navigate(`/read/${article._id}`);
				}
			}
		} catch (err) {
			console.error("Error saving article:", err);
			setError(err instanceof Error ? err.message : "Failed to save article");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-2">
				<label htmlFor="url-input" className="text-sm font-medium">
					Enter a URL to save
				</label>
				<div className="flex items-center gap-2">
					<Input
						id="url-input"
						type="url"
						placeholder="https://example.com/article"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						disabled={isSubmitting}
						className="flex-1"
					/>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Saving
							</>
						) : (
							"Save"
						)}
					</Button>
				</div>
				{error && <p className="text-sm text-destructive">{error}</p>}
			</div>
		</form>
	);
}
