import type { Article } from "@/services/db";
import { useVirtualizer } from "@tanstack/react-virtual";
import React, { useRef } from "react";
import ArticleCard from "./ArticleCard";

interface VirtualizedArticleListProps {
	articles: Article[];
	// Estimate for the height of each card + margin/padding.
	// Adjust this value based on the actual rendered height for better accuracy.
	estimateHeight?: number;
}

export default function VirtualizedArticleList({
	articles,
	estimateHeight = 300, // Default estimate, adjust as needed
}: VirtualizedArticleListProps) {
	const parentRef = useRef<HTMLDivElement>(null);

	// Memoize the estimate size function
	const estimateSize = React.useCallback(
		() => estimateHeight,
		[estimateHeight],
	);

	const rowVirtualizer = useVirtualizer({
		count: articles.length,
		getScrollElement: () => parentRef.current,
		estimateSize: estimateSize,
		// Render a few extra items above/below the viewport for smoother scrolling
		overscan: 5,
	});

	const virtualItems = rowVirtualizer.getVirtualItems();
	const totalSize = rowVirtualizer.getTotalSize();

	return (
		// This parent element MUST have a defined height and allow scrolling.
		// The parent component using this list is responsible for setting the height.
		// Example class: 'h-[calc(100vh-some-header-height)] overflow-y-auto'
		<div
			ref={parentRef}
			className="w-full" // Height and overflow should be handled by parent
			style={{ contain: "strict" }} // Performance hint for the browser
		>
			{/* This inner div establishes the total scrollable height */}
			<div
				style={{
					height: `${totalSize}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{/* Absolutely position the virtual items */}
				{virtualItems.map((virtualRow) => {
					const article = articles[virtualRow.index];
					// Basic check in case array/count mismatch
					if (!article) return null;

					return (
						<div
							key={article._id} // Use stable key
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								height: `${virtualRow.size}px`,
								transform: `translateY(${virtualRow.start}px)`,
							}}
						>
							{/* Pass the virtual index for potential staggered animation,
							    though the effect might change with virtualization. */}
							<ArticleCard article={article} index={virtualRow.index} />
						</div>
					);
				})}
			</div>
		</div>
	);
}
