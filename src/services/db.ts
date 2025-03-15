// Import PouchDB and plugins
import PouchDB from "pouchdb-browser";
import PouchDBFind from "pouchdb-find";
import { v4 as uuidv4 } from "uuid";

// Register PouchDB plugins
PouchDB.plugin(PouchDBFind);

// Database instances with error handling
let articlesDb: PouchDB.Database<Article>;
let highlightsDb: PouchDB.Database<Highlight>;
let tagsDb: PouchDB.Database<Tag>;

try {
	articlesDb = new PouchDB<Article>("bondwise_articles", {
		auto_compaction: true,
	});
	highlightsDb = new PouchDB<Highlight>("bondwise_highlights", {
		auto_compaction: true,
	});
	tagsDb = new PouchDB<Tag>("bondwise_tags", { auto_compaction: true });
} catch (err) {
	console.error("Failed to initialize PouchDB instances:", err);
	// Create fallback instances in case of error
	articlesDb = new PouchDB<Article>("bondwise_articles", { adapter: "memory" });
	highlightsDb = new PouchDB<Highlight>("bondwise_highlights", {
		adapter: "memory",
	});
	tagsDb = new PouchDB<Tag>("bondwise_tags", { adapter: "memory" });
}

// Database types
export interface Article {
	_id: string;
	_rev?: string;
	title: string;
	url: string;
	content: string;
	excerpt: string;
	author?: string;
	publishedDate?: string;
	savedAt: number;
	readAt?: number;
	isRead: boolean;
	favorite: boolean;
	siteName?: string;
	tags: string[];
	estimatedReadTime?: number;
	readingProgress?: number;
	type: "article" | "pdf" | "note"; // We can extend this later
}

export interface Highlight {
	_id: string;
	_rev?: string;
	articleId: string;
	text: string;
	note?: string;
	color: string;
	createdAt: number;
	position: {
		start: number;
		end: number;
	};
	tags: string[];
}

export interface Tag {
	_id: string;
	_rev?: string;
	name: string;
	color: string;
	createdAt: number;
}

// Create indexes
async function initializeIndexes() {
	try {
		// Index for articles
		await articlesDb.createIndex({
			index: { fields: ["savedAt", "isRead", "favorite", "tags"] },
		});

		// Index for highlights
		await highlightsDb.createIndex({
			index: { fields: ["articleId", "createdAt"] },
		});

		// Index for tags
		await tagsDb.createIndex({
			index: { fields: ["name"] },
		});

		console.log("Database indexes created successfully");
	} catch (error) {
		console.error("Error creating database indexes:", error);
		throw error; // Propagate the error to be caught by initializeDatabase
	}
}

// Initialize database
export async function initializeDatabase() {
	try {
		console.log("Starting database initialization...");

		// First ensure PouchDB is properly configured
		if (!PouchDB) {
			console.error("PouchDB is not available");
			return false;
		}

		let initSuccess = true;

		// Test database connections
		try {
			console.log("Testing database connections...");
			const articlesInfo = await articlesDb.info();
			const highlightsInfo = await highlightsDb.info();
			const tagsInfo = await tagsDb.info();

			console.log("Database connection successful", {
				articles: articlesInfo.doc_count,
				highlights: highlightsInfo.doc_count,
				tags: tagsInfo.doc_count,
			});
		} catch (dbError) {
			console.error("Error connecting to database:", dbError);
			initSuccess = false;

			// Try to recreate the databases with different options
			try {
				console.log(
					"Attempting to recreate databases with memory adapter as fallback...",
				);
				articlesDb = new PouchDB<Article>("bondwise_articles", {
					adapter: "memory",
				});
				highlightsDb = new PouchDB<Highlight>("bondwise_highlights", {
					adapter: "memory",
				});
				tagsDb = new PouchDB<Tag>("bondwise_tags", { adapter: "memory" });

				// Test if memory databases are working
				console.log("Testing memory database connections...");
				await articlesDb.info();
				await highlightsDb.info();
				await tagsDb.info();
				console.log("Memory database connections successful");
			} catch (recreateError) {
				console.error("Failed to recreate databases:", recreateError);
				return false;
			}
		}

		// Now create indexes
		try {
			console.log("Creating database indexes...");
			await initializeIndexes();
			console.log("Database indexes created successfully");
		} catch (indexError) {
			console.error("Error creating indexes, but continuing:", indexError);
			initSuccess = false;
		}

		console.log("Database initialization completed with status:", initSuccess);
		return initSuccess;
	} catch (error) {
		console.error("Failed to initialize database:", error);
		// Don't throw the error here, just report it
		return false;
	}
}

// Articles CRUD operations
export async function saveArticle(
	article: Omit<Article, "_id" | "savedAt" | "isRead" | "favorite" | "tags"> & {
		_id?: string;
		tags?: string[];
	},
): Promise<Article> {
	const newArticle: Article = {
		_id: article._id || `article_${uuidv4()}`,
		title: article.title,
		url: article.url,
		content: article.content,
		excerpt: article.excerpt,
		author: article.author,
		publishedDate: article.publishedDate,
		siteName: article.siteName,
		estimatedReadTime: article.estimatedReadTime,
		savedAt: Date.now(),
		isRead: false,
		favorite: false,
		tags: article.tags || [],
		type: article.type || "article",
	};

	try {
		const response = await articlesDb.put(newArticle);
		if (response.ok) {
			return { ...newArticle, _rev: response.rev };
		}
		throw new Error("Failed to save article");
	} catch (error) {
		console.error("Error saving article:", error);
		throw error;
	}
}

export async function getArticle(id: string): Promise<Article | null> {
	try {
		return await articlesDb.get(id);
	} catch (error) {
		console.error(`Error getting article ${id}:`, error);
		return null;
	}
}

export async function updateArticle(
	article: Partial<Article> & { _id: string; _rev: string },
): Promise<Article> {
	try {
		const existingArticle = await articlesDb.get(article._id);
		const updatedArticle = { ...existingArticle, ...article };
		const response = await articlesDb.put(updatedArticle);
		if (response.ok) {
			return { ...updatedArticle, _rev: response.rev };
		}
		throw new Error("Failed to update article");
	} catch (error) {
		console.error("Error updating article:", error);
		throw error;
	}
}

export async function deleteArticle(id: string, rev: string): Promise<boolean> {
	try {
		const response = await articlesDb.remove(id, rev);
		return response.ok;
	} catch (error) {
		console.error(`Error deleting article ${id}:`, error);
		throw error;
	}
}

export async function getAllArticles(options?: {
	limit?: number;
	skip?: number;
	isRead?: boolean;
	favorite?: boolean;
	tag?: string;
	sortBy?: "savedAt" | "title" | "readAt";
	sortDirection?: "asc" | "desc";
}): Promise<Article[]> {
	try {
		const selector: Record<string, unknown> = {};

		// Add filters
		if (options?.isRead !== undefined) selector.isRead = options.isRead;
		if (options?.favorite !== undefined) selector.favorite = options.favorite;
		if (options?.tag) selector.tags = { $elemMatch: { $eq: options.tag } };

		// Default sort
		let sort: Array<{ [propName: string]: "asc" | "desc" }> = [{ savedAt: "desc" }];

		// Custom sort
		if (options?.sortBy) {
			sort = [{ [options.sortBy]: options.sortDirection || "desc" }];
		}

		const result = await articlesDb.find({
			selector,
			sort,
			limit: options?.limit || 50,
			skip: options?.skip || 0,
		});

		return result?.docs || [];
	} catch (error) {
		console.error("Error getting articles:", error);
		return [];
	}
}

// Highlights CRUD operations
export async function saveHighlight(
	highlight: Omit<Highlight, "_id" | "createdAt" | "tags"> & {
		tags?: string[];
	},
): Promise<Highlight> {
	const newHighlight: Highlight = {
		_id: `highlight_${uuidv4()}`,
		articleId: highlight.articleId,
		text: highlight.text,
		note: highlight.note,
		color: highlight.color,
		position: highlight.position,
		createdAt: Date.now(),
		tags: highlight.tags || [],
	};

	try {
		const response = await highlightsDb.put(newHighlight);
		if (response.ok) {
			return { ...newHighlight, _rev: response.rev };
		}
		throw new Error("Failed to save highlight");
	} catch (error) {
		console.error("Error saving highlight:", error);
		throw error;
	}
}

export async function getHighlightsByArticle(
	articleId: string,
): Promise<Highlight[]> {
	try {
		const result = await highlightsDb.find({
			selector: { articleId },
			sort: [{ createdAt: "asc" }],
		});
		return result.docs;
	} catch (error) {
		console.error(`Error getting highlights for article ${articleId}:`, error);
		return [];
	}
}

export async function updateHighlight(
	highlight: Partial<Highlight> & { _id: string; _rev: string },
): Promise<Highlight> {
	try {
		const existingHighlight = await highlightsDb.get(highlight._id);
		const updatedHighlight = { ...existingHighlight, ...highlight };
		const response = await highlightsDb.put(updatedHighlight);
		if (response.ok) {
			return { ...updatedHighlight, _rev: response.rev };
		}
		throw new Error("Failed to update highlight");
	} catch (error) {
		console.error("Error updating highlight:", error);
		throw error;
	}
}

export async function deleteHighlight(
	id: string,
	rev: string,
): Promise<boolean> {
	try {
		const response = await highlightsDb.remove(id, rev);
		return response.ok;
	} catch (error) {
		console.error(`Error deleting highlight ${id}:`, error);
		throw error;
	}
}

// Tags CRUD operations
export async function saveTag(name: string, color = "#3B82F6"): Promise<Tag> {
	// Check if tag already exists
	const existingTags = await tagsDb.find({
		selector: { name: { $eq: name } },
	});

	if (existingTags.docs.length > 0) {
		return existingTags.docs[0];
	}

	const newTag: Tag = {
		_id: `tag_${uuidv4()}`,
		name,
		color,
		createdAt: Date.now(),
	};

	try {
		const response = await tagsDb.put(newTag);
		if (response.ok) {
			return { ...newTag, _rev: response.rev };
		}
		throw new Error("Failed to save tag");
	} catch (error) {
		console.error("Error saving tag:", error);
		throw error;
	}
}

export async function getAllTags(): Promise<Tag[]> {
	try {
		const result = await tagsDb.find({
			selector: {},
			sort: [{ name: "asc" }],
		});
		return result.docs;
	} catch (error) {
		console.error("Error getting tags:", error);
		return [];
	}
}

export async function deleteTag(id: string, rev: string): Promise<boolean> {
	try {
		const response = await tagsDb.remove(id, rev);
		return response.ok;
	} catch (error) {
		console.error(`Error deleting tag ${id}:`, error);
		throw error;
	}
}

// Sync functionality (to be implemented later)
export function setupSync(remoteUrl: string) {
	// This function will set up sync with a remote CouchDB server
	console.log("Sync functionality to be implemented");
}

// Offline detection
export function isOffline(): boolean {
	return !navigator.onLine;
}

// Event listener for offline/online status changes
export function registerOfflineListeners(
	onStatusChange: (isOffline: boolean) => void,
) {
	const updateStatus = () => onStatusChange(!navigator.onLine);

	window.addEventListener("online", updateStatus);
	window.addEventListener("offline", updateStatus);

	// Initial status
	updateStatus();

	// Return cleanup function
	return () => {
		window.removeEventListener("online", updateStatus);
		window.removeEventListener("offline", updateStatus);
	};
}

// Export databases (for advanced usage)
export const databases = {
	articles: articlesDb,
	highlights: highlightsDb,
	tags: tagsDb,
};
