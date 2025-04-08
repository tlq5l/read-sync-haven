// bondwise-worker/src/types.ts

/**
 * Defines the expected environment variables and bindings for the Cloudflare Worker.
 */
export interface Env {
	// Bindings
	SAVED_ITEMS_KV: KVNamespace;

	// Variables
	GCF_SUMMARIZE_URL: string;
	GCF_CHAT_URL: string;
	GEMINI_API_KEY: string; // Kept for potential future use/debugging
	GCLOUD_PROJECT_NUMBER: string;
	GCLOUD_WORKLOAD_IDENTITY_POOL_ID: string;
	GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: string;
	GCLOUD_SERVICE_ACCOUNT_EMAIL: string;

	// Secrets
	CLERK_SECRET_KEY: string;
	CLERK_PUBLISHABLE_KEY: string;
	GCF_AUTH_SECRET: string;
	CLERK_WEBHOOK_SECRET: string; // Secret for verifying Clerk webhooks
}

/**
 * Defines the structure for articles stored in the Worker's KV namespace.
 * This should align closely with the frontend's `Article` type.
 */
export interface WorkerArticle {
	_id: string; // Use _id to match PouchDB/frontend
	_rev?: string; // Optional revision marker
	userId: string;
	url: string;
	title: string;
	content?: string; // For HTML articles or placeholders
	fileData?: string; // For EPUB/PDF base64 content
	htmlContent?: string; // Raw HTML if needed
	excerpt?: string;
	author?: string;
	siteName?: string;
	type: "article" | "epub" | "pdf" | "youtube" | "other"; // Add epub/pdf
	savedAt: number; // Use number (timestamp) like frontend
	publishedDate?: string;
	isRead: boolean;
	favorite: boolean;
	tags?: string[];
	readingProgress?: number; // 0-100
	readAt?: number;
	scrollPosition?: number;
	// Add other fields from frontend Article type as needed
	coverImage?: string;
	language?: string;
	pageCount?: number; // For PDF
	estimatedReadTime?: number;
}

/**
 * Represents the structure of a successful authentication result.
 */
export interface AuthSuccess {
	status: "success";
	userId: string;
}

/**
 * Represents the structure of an authentication error result.
 */
export interface AuthError {
	status: "error";
	response: Response;
}

/**
 * Represents the possible outcomes of an authentication attempt.
 */
export type AuthResult = AuthSuccess | AuthError;

/**
 * Defines the structure for common API responses.
 */
export interface ApiResponse {
	status: "success" | "error";
	message?: string;
	data?: unknown; // Use a more specific type if possible
	[key: string]: any; // Allow additional properties
}
