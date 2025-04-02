// src/services/db/types.ts

/**
 * Represents a saved article, PDF, EPUB, or note.
 */
export interface Article {
	_id: string; // PouchDB document ID (e.g., 'article_uuid', 'pdf_uuid')
	_rev?: string; // PouchDB document revision
	_deleted?: boolean; // PouchDB deletion marker
	title: string; // Title of the item
	url: string; // Original URL or local file identifier (e.g., 'local://filename.epub')
	content: string; // Main content (HTML for articles, placeholder for binary files)
	excerpt: string; // Short summary or description
	author?: string; // Author name(s)
	publishedDate?: string; // Publication date (ISO string or other format)
	savedAt: number; // Timestamp (ms since epoch) when saved
	readAt?: number; // Timestamp (ms since epoch) when marked as read
	isRead: boolean; // Reading status
	favorite: boolean; // Favorite status
	siteName?: string; // Source website name or type (e.g., 'example.com', 'PDF Document')
	tags: string[]; // Array of tag IDs associated with the article
	estimatedReadTime?: number; // Estimated reading time in minutes
	readingProgress?: number; // Reading progress (e.g., percentage, page number, CFI)
	type: "article" | "pdf" | "note" | "epub"; // Type of content
	fileData?: string; // Base64 encoded data for binary files (PDF, EPUB)
	fileSize?: number; // Size of the original file in bytes
	fileName?: string; // Original filename for local files
	pageCount?: number; // Number of pages (primarily for PDF)
	userId?: string; // User ID associated with this article (e.g., from Clerk)
	status: "inbox" | "later" | "archived"; // Article status

	// Optional fields added based on usage elsewhere
	htmlContent?: string; // Raw HTML content, if available
	scrollPosition?: number; // Last reading scroll position (e.g., pixel value)
	coverImage?: string; // URL or base64 data for a cover image
	language?: string; // Detected language code (e.g., 'en', 'vi')
}

/**
 * Represents a text highlight within an article.
 */
export interface Highlight {
	_id: string; // PouchDB document ID (e.g., 'highlight_uuid')
	_rev?: string; // PouchDB document revision
	articleId: string; // ID of the Article this highlight belongs to
	text: string; // The highlighted text content
	note?: string; // User's note associated with the highlight
	color: string; // Color of the highlight (e.g., hex code '#FFFF00')
	createdAt: number; // Timestamp (ms since epoch) when created
	position: {
		// Position information (adapt based on content type)
		// For text/HTML: character offsets or range identifiers
		start: number | string; // Start position (e.g., character offset, CFI)
		end: number | string; // End position (e.g., character offset, CFI)
		// For PDF: page number and coordinates might be needed
		pageNumber?: number;
		// Add other relevant position fields as needed
	};
	tags: string[]; // Array of tag IDs associated with the highlight
	userId?: string; // Optional: User ID if highlights are user-specific
}

/**
 * Represents a user-defined tag.
 */
export interface Tag {
	_id: string; // PouchDB document ID (e.g., 'tag_uuid')
	_rev?: string; // PouchDB document revision
	name: string; // Name of the tag (should be unique per user)
	color: string; // Color associated with the tag (e.g., hex code '#3B82F6')
	createdAt: number; // Timestamp (ms since epoch) when created
	userId?: string; // Optional: User ID if tags are user-specific
}
