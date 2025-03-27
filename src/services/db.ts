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
	pageCount?: number; // Number of pages (for PDF)
	userId?: string; // User ID from Clerk
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

// Track created indexes to avoid duplicate creation
let indexesCreated = false;

// Create indexes for better query performance
async function initializeIndexes() {
	if (indexesCreated) {
		console.log("Indexes already created, skipping");
		return;
	}

	try {
		// Create a basic index with a common field first
		await articlesDb
			.createIndex({
				index: { fields: ["_id"] },
			})
			.catch((err) => console.warn("Error creating _id index:", err));

		// Create simple indexes
		await articlesDb
			.createIndex({
				index: { fields: ["savedAt"] },
			})
			.catch((err) => console.warn("Error creating savedAt index:", err));

		await articlesDb
			.createIndex({
				index: { fields: ["isRead"] },
			})
			.catch((err) => console.warn("Error creating isRead index:", err));

		await articlesDb
			.createIndex({
				index: { fields: ["favorite"] },
			})
			.catch((err) => console.warn("Error creating favorite index:", err));

		// Add userId index
		await articlesDb
			.createIndex({
				index: { fields: ["userId"] },
			})
			.catch((err) => console.warn("Error creating userId index:", err));

		// Wait a bit between index creation to avoid concurrency issues
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Highlight and tag indexes
		await highlightsDb
			.createIndex({
				index: { fields: ["articleId"] },
			})
			.catch((err) => console.warn("Error creating articleId index:", err));

		await tagsDb
			.createIndex({
				index: { fields: ["name"] },
			})
			.catch((err) => console.warn("Error creating tag name index:", err));

		// Mark indexes as created
		indexesCreated = true;
		console.log("Database indexes created successfully");
	} catch (error) {
		console.error("Error creating database indexes:", error);
		// Not throwing error to allow app to continue, but with reduced performance
	}
}

// Initialize database
export async function initializeDatabase() {
	return executeWithRetry(async () => {
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

			console.log(
				"Database initialization completed with status:",
				initSuccess,
			);
			return initSuccess;
		} catch (error) {
			console.error("Failed to initialize database:", error);
			// Don't throw the error here, just report it
			return false;
		}
	});
}

// Articles CRUD operations
export async function saveArticle(
	article: Omit<Article, "_id" | "savedAt" | "isRead" | "favorite" | "tags"> & {
		_id?: string;
		tags?: string[];
		userId?: string;
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
		pageCount: article.pageCount,
		userId: article.userId,
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
import {
	extractPdfMetadata,
	getEstimatedReadingTime as getPdfReadingTime,
} from "./pdf";

// Function to save an EPUB file
export async function saveEpubFile(
	file: File,
	userId?: string,
): Promise<Article> {
	try {
		console.log(
			`Processing EPUB file: ${file.name}, size: ${(file.size / 1024).toFixed(
				1,
			)}KB`,
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
			userId: userId,
		};

		// Log the fileData length for debugging
		console.log(
			`EPUB file encoded successfully: ${base64Encoded.length} bytes encoded`,
		);

		return await saveArticle(article);
	} catch (error) {
		console.error("Error saving EPUB file:", error);
		throw new Error(
			`Failed to save EPUB file. ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

// Function to save a PDF file
export async function savePdfFile(
	file: File,
	userId?: string,
): Promise<Article> {
	try {
		console.log(
			`Processing PDF file: ${file.name}, size: ${(file.size / 1024).toFixed(
				1,
			)}KB`,
		);

		// Read the file as ArrayBuffer
		const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as ArrayBuffer);
			reader.onerror = (e) => {
				console.error("FileReader error:", e);
				reject(new Error("Failed to read PDF file"));
			};
			reader.readAsArrayBuffer(file);
		});

		console.log(
			`FileReader successfully read file as ArrayBuffer: ${arrayBuffer.byteLength} bytes`,
		);

		// Convert to Base64 using a chunking method
		let base64Encoded = "";
		try {
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
			throw new Error("Failed to encode PDF data");
		}

		// Validate the converted data
		if (!base64Encoded || base64Encoded.length < 100) {
			throw new Error("Failed to properly encode PDF file data");
		}

		// Extract metadata from the PDF file
		console.log("Extracting PDF metadata...");
		const metadata = await extractPdfMetadata(file, arrayBuffer);
		console.log("PDF metadata extracted:", metadata.title);

		// Use extracted metadata or fallback to filename
		const title = metadata.title || file.name.replace(/\.pdf$/i, "");
		const author = metadata.author || "Unknown";
		const excerpt = metadata.description || `PDF Document: ${title}`;
		const pageCount =
			metadata.pageCount || Math.max(1, Math.floor(file.size / 100000));

		const article: Omit<
			Article,
			"_id" | "savedAt" | "isRead" | "favorite" | "tags"
		> = {
			title: title,
			url: `local://${file.name}`, // Use a special URL scheme for local files
			content:
				"<div class='pdf-placeholder'>PDF content will be displayed in a reader.</div>",
			excerpt: excerpt,
			author: author,
			publishedDate: metadata.publishedDate,
			type: "pdf",
			fileData: base64Encoded,
			fileSize: file.size,
			fileName: file.name,
			pageCount: pageCount,
			estimatedReadTime: getPdfReadingTime(file.size, pageCount),
			siteName: "PDF Document",
			userId: userId,
		};

		// Log the fileData length for debugging
		console.log(
			`PDF file encoded successfully: ${base64Encoded.length} bytes encoded`,
		);

		return await saveArticle(article);
	} catch (error) {
		console.error("Error saving PDF file:", error);
		throw new Error(
			`Failed to save PDF file. ${
				error instanceof Error ? error.message : String(error)
			}`,
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

// Query cache to reduce database operations
const recentQueriesCache = new Map<
	string,
	{ data: Article[]; timestamp: number }
>();
const CACHE_TTL = 5000; // 5 seconds cache TTL

export async function getAllArticles(options?: {
	limit?: number;
	skip?: number;
	isRead?: boolean;
	favorite?: boolean;
	tag?: string;
	sortBy?: "savedAt" | "title" | "readAt";
	sortDirection?: "asc" | "desc";
	userId?: string;
}): Promise<Article[]> {
	return executeWithRetry(async () => {
		try {
			// Generate cache key from options
			const cacheKey = JSON.stringify(options || {});

			// Check cache first
			const cached = recentQueriesCache.get(cacheKey);
			if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
				console.log(`Using cached articles for query: ${cacheKey}`);
				return cached.data;
			}
			// Ensure database is ready
			const dbInfo = await articlesDb.info();
			console.log(`Database has ${dbInfo.doc_count} documents`);

			// If we have no documents at all, return empty array immediately
			if (dbInfo.doc_count === 0) {
				console.warn("No documents in database");
				return [];
			}

			// Initialize indexes if not done yet
			if (!indexesCreated) {
				await initializeIndexes();
			}

			// Create a selector object for filters
			const selector: Record<string, unknown> = {};

			// Add filters
			if (options?.isRead !== undefined) selector.isRead = options.isRead;
			if (options?.favorite !== undefined) selector.favorite = options.favorite;
			if (options?.tag && typeof options.tag === "string")
				selector.tags = { $elemMatch: { $eq: options.tag } };
			// Add userId filter
			if (options?.userId) selector.userId = options.userId;

			// Fallback for when no records are found matching the selector
			if (Object.keys(selector).length > 0) {
				try {
					const count = await articlesDb.find({
						selector,
						limit: 1,
					});

					if (count.docs.length === 0) {
						console.warn(
							"No records found with selector, falling back to allDocs",
						);
						// Fall back to allDocs which doesn't require indexes
						const allDocs = await articlesDb.allDocs({ include_docs: true });
						const docs = allDocs.rows
							.map((row) => row.doc)
							.filter((doc) => doc) as Article[];

						console.log(
							`Found ${docs.length} total articles, applying filters...`,
						);

						// Filter in memory
						let filteredDocs = [...docs];
						if (options?.isRead !== undefined) {
							filteredDocs = filteredDocs.filter(
								(doc) => doc.isRead === options.isRead,
							);
							console.log(
								`After isRead filter: ${filteredDocs.length} articles`,
							);
						}
						if (options?.favorite !== undefined) {
							filteredDocs = filteredDocs.filter(
								(doc) => doc.favorite === options.favorite,
							);
							console.log(
								`After favorite filter: ${filteredDocs.length} articles`,
							);
						}
						if (options?.tag && typeof options.tag === "string") {
							filteredDocs = filteredDocs.filter((doc) =>
								doc.tags?.includes(options.tag as string),
							);
							console.log(`After tag filter: ${filteredDocs.length} articles`);
						}
						// Add userId filter
						if (options?.userId) {
							filteredDocs = filteredDocs.filter(
								(doc) => doc.userId === options.userId,
							);
							console.log(
								`After userId filter: ${filteredDocs.length} articles`,
							);
						}

						// Sort in memory
						const sortField = options?.sortBy || "savedAt";
						const sortDirection = options?.sortDirection || "desc";

						filteredDocs.sort((a, b) => {
							const aVal = (a[sortField as keyof Article] as any) || 0;
							const bVal = (b[sortField as keyof Article] as any) || 0;

							if (sortDirection === "asc") {
								return aVal > bVal ? 1 : -1;
							}
							return aVal < bVal ? 1 : -1;
						});

						// Apply limit and skip
						const start = options?.skip || 0;
						const end = options?.limit ? start + options.limit : undefined;
						return filteredDocs.slice(start, end);
					}
				} catch (findError) {
					console.error(
						"Error using find, falling back to allDocs:",
						findError,
					);
				}
			}

			// Standard query using allDocs (more reliable than find)
			try {
				// Try using allDocs first which is more reliable
				const allDocs = await articlesDb.allDocs({ include_docs: true });
				let docs = allDocs.rows
					.map((row) => row.doc)
					.filter((doc) => doc) as Article[];

				console.log(
					`Retrieved ${docs.length} articles via allDocs, applying filters`,
				);

				// Filter in memory
				if (options?.isRead !== undefined) {
					docs = docs.filter((doc) => doc.isRead === options.isRead);
					console.log(`After isRead filter: ${docs.length} articles remain`);
				}
				if (options?.favorite !== undefined) {
					// Make sure favorite property exists and is explicitly true
					docs = docs.filter((doc) => doc.favorite === true);
					console.log(`After favorite filter: ${docs.length} articles remain`);
				}
				if (options?.tag && typeof options.tag === "string") {
					docs = docs.filter((doc) =>
						doc.tags?.includes(options.tag as string),
					);
					console.log(`After tag filter: ${docs.length} articles remain`);
				}
				// Add userId filter
				if (options?.userId) {
					docs = docs.filter((doc) => doc.userId === options.userId);
					console.log(`After userId filter: ${docs.length} articles remain`);
				}

				// Sort in memory
				const sortField = options?.sortBy || "savedAt";
				const sortDirection = options?.sortDirection || "desc";

				docs.sort((a, b) => {
					const aVal = (a[sortField as keyof Article] as any) || 0;
					const bVal = (b[sortField as keyof Article] as any) || 0;

					if (sortDirection === "asc") {
						return aVal > bVal ? 1 : -1;
					}
					return aVal < bVal ? 1 : -1;
				});

				// Apply limit and skip
				const start = options?.skip || 0;
				const end = options?.limit ? start + options.limit : undefined;

				const resultDocs = docs.slice(start, end || docs.length);

				console.log(
					`Found ${docs.length} articles, returning ${start} to ${
						end || docs.length
					}`,
				);

				// Update cache
				recentQueriesCache.set(cacheKey, {
					data: resultDocs,
					timestamp: Date.now(),
				});

				return resultDocs;
			} catch (allDocsError) {
				console.error(
					"Error using allDocs, falling back to find:",
					allDocsError,
				);

				// Last resort - try find query with no sorting
				const findQuery: PouchDB.Find.FindRequest<Article> = {
					selector,
					limit: options?.limit || 1000,
					skip: options?.skip || 0,
				};

				const result = await articlesDb.find(findQuery);
				const docs = result?.docs || [];

				// Manual sort since we can't rely on PouchDB sort
				const sortField = options?.sortBy || "savedAt";
				const sortDirection = options?.sortDirection || "desc";

				docs.sort((a, b) => {
					const aVal = (a[sortField as keyof Article] as any) || 0;
					const bVal = (b[sortField as keyof Article] as any) || 0;

					if (sortDirection === "asc") {
						return aVal > bVal ? 1 : -1;
					}
					return aVal < bVal ? 1 : -1;
				});

				console.log(`Found ${docs.length} articles using find fallback`);

				// Update cache even for this fallback path
				recentQueriesCache.set(cacheKey, {
					data: docs,
					timestamp: Date.now(),
				});

				return docs;
			}
		} catch (error) {
			console.error("Error getting articles:", error);
			// Return empty array instead of throwing to avoid breaking the UI
			return [];
		}
	});
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
		// Try using find with selector first
		try {
			const result = await highlightsDb.find({
				selector: { articleId },
			});
			return result.docs;
		} catch (findError) {
			console.warn(
				"Error using find for highlights, falling back to allDocs:",
				findError,
			);

			// Fallback to allDocs and filter in memory
			const allHighlights = await highlightsDb.allDocs({ include_docs: true });
			return allHighlights.rows
				.map((row) => row.doc)
				.filter((doc) => doc && doc.articleId === articleId) as Highlight[];
		}
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
	try {
		const existingTags = await tagsDb.find({
			selector: { name: { $eq: name } },
		});

		if (existingTags.docs.length > 0) {
			return existingTags.docs[0];
		}
	} catch (error) {
		console.warn("Error looking up existing tag:", error);
		// Continue with creation
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
		try {
			const result = await tagsDb.find({
				selector: {},
			});
			return result.docs;
		} catch (findError) {
			console.warn(
				"Error using find for tags, falling back to allDocs:",
				findError,
			);

			// Fallback to allDocs
			const allTags = await tagsDb.allDocs({ include_docs: true });
			return allTags.rows.map((row) => row.doc).filter((doc) => doc) as Tag[];
		}
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

// Helper function to identify transient errors that can be retried
function isTransientError(error: any): boolean {
	if (!error) return false;

	// Network or connection related errors are usually transient
	if (error.name === "NetworkError") return true;
	if (error.name === "timeout" || error.message?.includes("timeout"))
		return true;
	if (
		error.name === "connection_error" ||
		error.message?.includes("connection")
	)
		return true;
	if (
		error.status === 500 ||
		error.status === 502 ||
		error.status === 503 ||
		error.status === 504
	)
		return true;

	// PouchDB specific retry conditions
	if (error.name === "unknown_error") return true;
	if (error.message?.includes("conflict")) return false; // Don't retry conflicts
	if (error.message?.includes("network") || error.message?.includes("offline"))
		return true;

	return false;
}

// Execute operation with retry logic for transient failures
async function executeWithRetry<T>(
	operation: () => Promise<T>,
	maxRetries = 3,
): Promise<T> {
	let lastError: any;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (err) {
			console.warn(`Operation failed (attempt ${attempt}/${maxRetries}):`, err);
			lastError = err;

			// Only retry on transient errors
			if (!isTransientError(err)) throw err;

			// Don't wait on the last attempt
			if (attempt < maxRetries) {
				// Wait before retry (exponential backoff)
				const delay = Math.min(300 * 2 ** (attempt - 1), 3000);
				console.log(`Retrying after ${delay}ms...`);
				await new Promise((r) => setTimeout(r, delay));
			}
		}
	}

	throw lastError;
}

// Export databases (for advanced usage)
export const databases = {
	articles: articlesDb,
	highlights: highlightsDb,
	tags: tagsDb,
};
