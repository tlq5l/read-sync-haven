import ArticleCard from "@/components/ArticleCard";
import type { Article } from "@/services/db"; // Assuming Article type path
import React from "react";
import { VirtuosoGrid } from "react-virtuoso";

// Memoize ArticleCard for performance within the virtualized list
const MemoizedArticleCard = React.memo(ArticleCard);

interface VirtualizedArticleGridProps {
	articles: Article[];
	// Add any other props needed by ArticleCard, e.g., event handlers
	// Example: onArchive: (id: string) => void;
}

// Define ESTIMATED_ITEM_HEIGHT, adjust as needed based on average ArticleCard size
// const ESTIMATED_ITEM_HEIGHT = 350; // Removed - Start with 350px, tune later

export const VirtualizedArticleGrid: React.FC<VirtualizedArticleGridProps> = ({
	articles /* other props... */,
}) => {
	if (!articles || articles.length === 0) {
		// Handle empty state if needed, though the parent page might handle this
		return null; // Or render an empty message
	}

	return (
		<VirtuosoGrid
			style={{ height: "100%" }} // Ensure the grid takes up available vertical space
			data={articles}
			components={
				{
					// Optional: Customize list/item components if needed for styling/roles
					// List: React.forwardRef(({ style, children, ...props }, ref) => (
					//   <div
					//     ref={ref}
					//     {...props}
					//     style={{ ...style}} // Keep default styles
					//     className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4" // Apply grid styles here if preferred
					//     role="list"
					//   >
					//     {children}
					//   </div>
					// )),
					// Item: ({ children, ...props }) => (
					//   <div {...props} role="listitem" className="w-full"> {/* Ensure item takes full cell width */}
					//     {children}
					//   </div>
					// ),
				}
			}
			listClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" // Apply grid styles directly
			itemContent={(index, article) => (
				<MemoizedArticleCard
					key={article._id} // Key is crucial for React updates
					article={article}
					index={index} // Pass index if ArticleCard needs it
					// Pass down other necessary props, ensuring they are stable if possible
					// Example: onArchive={props.onArchive}
				/>
			)}
			// Use defaultItemHeight for smoother initial render with variable heights
			// This value might need tuning based on observation
			// Virtuoso will measure actual heights dynamically.
			// defaultItemHeight={ESTIMATED_ITEM_HEIGHT} // Disabled for now, enable if needed after testing
		/>
	);
};

export default VirtualizedArticleGrid;
