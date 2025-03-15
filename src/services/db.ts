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
	// Configure database options with better reliability settings
	const dbOptions = {
		auto_compaction: true,
		revs_limit: 100,
		ajax: {
			timeout: 30000, // 30 second timeout
			retry: true,
			retryTimeout: 1000,
		},
	};

	articlesDb = new PouchDB<Article>("bondwise_articles", dbOptions);
	highlightsDb = new PouchDB<Highlight>("bondwise_highlights", dbOptions);
	tagsDb = new PouchDB<Tag>("bondwise_tags", dbOptions);

	// Test connections immediately to surface any issues
	void articlesDb.info().catch((err) => {
		console.error("Articles DB connection test failed:", err);
		throw err;
	});
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
	type: "article" | "pdf" | "note" | "epub"; // Added epub type
	fileData?: string; // Base64 encoded file data for binary files like EPUB
	fileSize?: number; // Size of the file in bytes
	fileName?: string; // Original filename
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
		fileData: article.fileData,
		fileSize: article.fileSize,
		fileName: article.fileName,
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

import { extractEpubMetadata, getEstimatedReadingTime } from "./epub";

// Function to save an EPUB file
export async function saveEpubFile(file: File): Promise<Article> {
	try {
		console.log(
			`Processing EPUB file: ${file.name}, size: ${(file.size / 1024).toFixed(1)}KB`,
		);

		// Read the file as ArrayBuffer with progress tracking
		const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as ArrayBuffer);
			reader.onerror = (e) => {
				console.error("FileReader error:", e);
				reject(new Error("Failed to read EPUB file"));
			};
			reader.readAsArrayBuffer(file);
		});

		console.log(
			`FileReader successfully read file as ArrayBuffer: ${arrayBuffer.byteLength} bytes`,
		);

		// Convert to Base64 using a more reliable method
		let base64Encoded = "";
		try {
			// Use a more efficient chunking method
			const bytes = new Uint8Array(arrayBuffer);
			const chunks: string[] = [];
			const chunkSize = 0x8000; // 32KB chunks

			// Process in smaller chunks to avoid string overflow
			for (let i = 0; i < bytes.length; i += chunkSize) {
				const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
				chunks.push(String.fromCharCode.apply(null, Array.from(chunk)));
			}

			// Join all chunks and convert to base64
			const binaryString = chunks.join("");
			base64Encoded = btoa(binaryString);

			console.log(`Base64 encoding successful: length ${base64Encoded.length}`);
		} catch (encodeError) {
			console.error("Error in base64 encoding:", encodeError);
			throw new Error("Failed to encode EPUB data");
		}

		// Validate the converted data
		if (!base64Encoded || base64Encoded.length < 100) {
			throw new Error("Failed to properly encode EPUB file data");
		}

		// Extract metadata from the EPUB file
		console.log("Extracting EPUB metadata...");
		const metadata = await extractEpubMetadata(arrayBuffer);
		console.log("EPUB metadata extracted:", metadata.title);

		// Use extracted metadata or fallback to filename
		const title = metadata.title || file.name.replace(/\.epub$/i, "");
		const author = metadata.author || "Unknown";
		const excerpt = metadata.description || `EPUB book: ${title}`;

		const article: Omit<
			Article,
			"_id" | "savedAt" | "isRead" | "favorite" | "tags"
		> = {
			title: title,
			url: `local://${file.name}`, // Use a special URL scheme for local files
			content:
				"<div class='epub-placeholder'>EPUB content will be displayed in a reader.</div>",
			excerpt: excerpt,
			author: author,
			publishedDate: metadata.publishedDate,
			type: "epub",
			fileData: base64Encoded,
			fileSize: file.size,
			fileName: file.name,
			estimatedReadTime: getEstimatedReadingTime(file.size),
			siteName: metadata.publisher || "EPUB Book",
		};

		// Log the fileData length for debugging
		console.log(
			`EPUB file encoded successfully: ${base64Encoded.length} bytes encoded`,
		);

		return await saveArticle(article);
	} catch (error) {
		console.error("Error saving EPUB file:", error);
		throw new Error(
			`Failed to save EPUB file. ${error instanceof Error ? error.message : String(error)}`,
		);
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
		// Ensure database is ready
		await articlesDb.info();

		const selector: Record<string, unknown> = {};

		// Add filters
		if (options?.isRead !== undefined) selector.isRead = options.isRead;
		if (options?.favorite !== undefined) selector.favorite = options.favorite;
		if (options?.tag) selector.tags = { $elemMatch: { $eq: options.tag } };

		// Default sort
		let sort: Array<{ [propName: string]: "asc" | "desc" }> = [
			{ savedAt: "desc" },
		];

		// Custom sort
		if (options?.sortBy) {
			sort = [{ [options.sortBy]: options.sortDirection || "desc" }];
		}

		console.log(
			"Executing PouchDB find with selector:",
			JSON.stringify(selector),
		);

		const result = await articlesDb.find({
			selector,
			sort,
			limit: options?.limit || 50,
			skip: options?.skip || 0,
		});

		const docs = result?.docs || [];
		console.log(`Found ${docs.length} articles in database`);
		return docs;
	} catch (error) {
		console.error("Error getting articles:", error);
		// Throw the error so it can be handled by the caller
		throw error;
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
export function setupSync() {
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
