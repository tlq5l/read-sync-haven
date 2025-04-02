// bondwise-worker/src/handlers/items.test.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env, WorkerArticle } from "../types";
import { createUserItemKey } from "../utils";
import {
	handleDeleteItem,
	handleGetItem,
	handleListItems,
	handlePostItem,
} from "./items";

// Function to create a KV mock with an internal store
const createKvMock = () => {
	const store = new Map<string, string>(); // Internal store for this mock instance
	const mock = {
		_store: store, // Expose store for direct manipulation in tests if needed
		get: vi
			.fn()
			.mockImplementation(
				async (
					key: string,
					options?: any,
				): Promise<string | Record<string, any> | null> => {
					const value = store.get(key);
					const found = value !== undefined;
					// console.log(`[Mock KV Get] Key: "${key}", Found: ${found}`);
					if (!found) return null;
					if (options?.type === "json") {
						try {
							return JSON.parse(value);
						} catch (e) {
							return null;
						}
					}
					return value;
				},
			),
		put: vi
			.fn()
			.mockImplementation(
				async (key: string, value: string): Promise<undefined> => {
					// console.log(`[Mock KV Put] Setting Key: "${key}"`);
					store.set(key, value); // Use the internal store
					return undefined;
				},
			),
		delete: vi
			.fn()
			.mockImplementation(async (key: string): Promise<undefined> => {
				const deleted = store.delete(key); // Use the internal store
				// console.log(`[Mock KV Delete] Key: "${key}", Deleted: ${deleted}`);
				return undefined;
			}),
		list: vi
			.fn()
			.mockImplementation(
				async (
					options?: KVNamespaceListOptions,
				): Promise<KVNamespaceListResult<unknown>> => {
					const prefix = options?.prefix ?? "";
					// console.log(`[Mock KV List] Listing with prefix: "${prefix}". Current store size: ${store.size}`);
					// console.log("[Mock KV List] Current Keys:", Array.from(store.keys()));
					const keys: KVNamespaceListKey<unknown>[] = [];
					for (const key of store.keys()) {
						// Use the internal store
						if (key.startsWith(prefix)) {
							// console.log(`[Mock KV List]   Match found: "${key}"`);
							keys.push({
								name: key,
								expiration: undefined,
								metadata: undefined,
							});
						}
					}
					// console.log(`[Mock KV List] Returning ${keys.length} keys for prefix "${prefix}"`);
					return {
						keys: keys,
						list_complete: true,
						cacheStatus: null,
					};
				},
			),
		getWithMetadata: vi.fn(),
		deleteMany: vi.fn(),
		putMany: vi.fn(),
	};
	return mock as unknown as KVNamespace & { _store: Map<string, string> }; // Cast including _store
};

// Declare mockKvNamespace with let so it can be reassigned in beforeEach
let mockKvNamespace: ReturnType<typeof createKvMock>;

describe("Worker Item Handlers", () => {
	let mockEnv: Env;
	let mockCtx: ExecutionContext;
	const testUserId = "user_test_items_123";
	const testEmail = "test@example.com";

	const article1: WorkerArticle = {
		_id: "article_1",
		userId: testUserId,
		url: "http://example.com/1",
		title: "Article 1",
		type: "article",
		savedAt: Date.now() - 10000,
		isRead: false,
		favorite: false,
		siteName: "Example",
		estimatedReadTime: 5,
	};
	const article2: WorkerArticle = {
		_id: "article_2",
		userId: testUserId,
		url: "http://example.com/2",
		title: "Article 2",
		type: "article",
		savedAt: Date.now(),
		isRead: true,
		favorite: true,
		siteName: "Example",
		estimatedReadTime: 10,
	};
	const articleEmail: WorkerArticle = {
		_id: "article_email",
		userId: testEmail,
		url: "http://example.com/email",
		title: "Email Article",
		type: "article",
		savedAt: Date.now() - 5000,
		isRead: false,
		favorite: false,
		siteName: "Example",
		estimatedReadTime: 3,
	};
	const articleOtherUser: WorkerArticle = {
		_id: "article_other",
		userId: "other_user_456",
		url: "http://example.com/other",
		title: "Other User Article",
		type: "article",
		savedAt: Date.now() - 20000,
		isRead: false,
		favorite: false,
	};

	beforeEach(() => {
		// Reset mocks and create a fresh KV mock instance before each test
		mockKvNamespace = createKvMock(); // Assign the fresh mock
		vi.clearAllMocks(); // Clear history of calls on the mock functions

		// Mock environment
		mockEnv = {
			SAVED_ITEMS_KV: mockKvNamespace,
			// Add other required Env properties
			CLERK_SECRET_KEY: "test_secret_key",
			CLERK_PUBLISHABLE_KEY: "test_pub_key",
			GCF_SUMMARIZE_URL: "http://example.com/summarize",
			GCF_CHAT_URL: "http://example.com/chat",
			GEMINI_API_KEY: "",
			GCLOUD_PROJECT_NUMBER: "",
			GCLOUD_WORKLOAD_IDENTITY_POOL_ID: "",
			GCLOUD_WORKLOAD_IDENTITY_PROVIDER_ID: "",
			GCLOUD_SERVICE_ACCOUNT_EMAIL: "",
			GCF_AUTH_SECRET: "test_gcf_secret",
		};

		// Mock execution context, including missing 'props'
		mockCtx = {
			waitUntil: vi.fn((promise) => promise),
			passThroughOnException: vi.fn(),
			// Add missing props property (can be an empty object for most tests)
			props: {},
		} as unknown as ExecutionContext; // Cast for simplicity if props details aren't needed

		// Pre-populate KV using the mock's internal store
		// Pre-populate KV using the mock's internal store
		mockKvNamespace._store.set(
			createUserItemKey(article1.userId, article1._id),
			JSON.stringify(article1),
		);
		mockKvNamespace._store.set(
			createUserItemKey(article2.userId, article2._id),
			JSON.stringify(article2),
		);
		mockKvNamespace._store.set(
			createUserItemKey(articleEmail.userId, articleEmail._id),
			JSON.stringify(articleEmail),
		);
		mockKvNamespace._store.set(
			createUserItemKey(articleOtherUser.userId, articleOtherUser._id),
			JSON.stringify(articleOtherUser),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// --- handleListItems ---
	describe("handleListItems", () => {
		it("should list items for the authenticated user ID", async () => {
			const request = new Request("http://example.com/items");
			const response = await handleListItems(request, mockEnv, testUserId);
			expect(response.status).toBe(200);
			const body = (await response.json()) as WorkerArticle[]; // Expecting an array
			expect(body).toHaveLength(2);
			expect(body.some((a: WorkerArticle) => a._id === article1._id)).toBe(
				true,
			);
			expect(body.some((a: WorkerArticle) => a._id === article2._id)).toBe(
				true,
			);
			expect(body.some((a: WorkerArticle) => a._id === articleEmail._id)).toBe(
				false,
			); // Should not include email item by default
			expect(mockKvNamespace.list).toHaveBeenCalledWith({
				prefix: `${testUserId}:`,
			});
		});

		it("should list items for the authenticated user ID and email if provided", async () => {
			const request = new Request(
				`http://example.com/items?email=${encodeURIComponent(testEmail)}`,
			); // Keep template literal here
			const response = await handleListItems(request, mockEnv, testUserId); // Authenticated as testUserId
			expect(response.status).toBe(200);
			const body = (await response.json()) as WorkerArticle[]; // Expecting an array
			expect(body).toHaveLength(3); // article1, article2, articleEmail
			expect(body.some((a: WorkerArticle) => a._id === article1._id)).toBe(
				true,
			);
			expect(body.some((a: WorkerArticle) => a._id === article2._id)).toBe(
				true,
			);
			expect(body.some((a: WorkerArticle) => a._id === articleEmail._id)).toBe(
				true,
			);
			expect(mockKvNamespace.list).toHaveBeenCalledWith({
				prefix: `${testUserId}:`,
			});
			expect(mockKvNamespace.list).toHaveBeenCalledWith({
				prefix: `${testEmail}:`,
			});
		});

		it("should return empty array if no items found for user", async () => {
			mockKvNamespace._store.clear(); // Clear the internal store of the mock
			const request = new Request("http://example.com/items");
			const response = await handleListItems(
				request,
				mockEnv,
				"non_existent_user",
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as any[]; // Expecting empty array
			expect(body).toEqual([]);
			expect(mockKvNamespace.list).toHaveBeenCalledWith({
				prefix: "non_existent_user:",
			});
		});

		it("should correctly derive siteName from URL if missing", async () => {
			// Add an item missing siteName to the mock KV
			const itemMissingSiteName: WorkerArticle = {
				_id: "article_no_site",
				userId: testUserId,
				url: "https://sub.domain.co.uk/path",
				title: "No Site Name",
				type: "article",
				savedAt: Date.now(),
				isRead: false,
				favorite: false,
				estimatedReadTime: 2,
			};
			mockKvNamespace._store.set(
				createUserItemKey(testUserId, itemMissingSiteName._id),
				JSON.stringify(itemMissingSiteName),
			);

			const request = new Request("http://example.com/items");
			const response = await handleListItems(request, mockEnv, testUserId);
			const body = (await response.json()) as WorkerArticle[];
			const testedItem = body.find((a) => a._id === itemMissingSiteName._id);
			expect(testedItem).toBeDefined();
			expect(testedItem?.siteName).toBe("sub.domain.co.uk"); // Expect derived hostname
		});

		it("should use default siteName if URL is invalid or missing", async () => {
			const itemInvalidUrl: WorkerArticle = {
				_id: "article_invalid_url",
				userId: testUserId,
				url: "invalid-url",
				title: "Invalid URL",
				type: "article",
				savedAt: Date.now(),
				isRead: false,
				favorite: false,
				estimatedReadTime: 1,
			};
			const itemPdfNoUrl: WorkerArticle = {
				_id: "pdf_no_url",
				userId: testUserId,
				url: "",
				title: "PDF No URL",
				type: "pdf",
				savedAt: Date.now(),
				isRead: false,
				favorite: false,
				estimatedReadTime: 1,
			};
			mockKvNamespace._store.set(
				createUserItemKey(testUserId, itemInvalidUrl._id),
				JSON.stringify(itemInvalidUrl),
			);
			mockKvNamespace._store.set(
				createUserItemKey(testUserId, itemPdfNoUrl._id),
				JSON.stringify(itemPdfNoUrl),
			);

			const request = new Request("http://example.com/items");
			const response = await handleListItems(request, mockEnv, testUserId);
			const body = (await response.json()) as WorkerArticle[];

			const testedItemInvalid = body.find((a) => a._id === itemInvalidUrl._id);
			expect(testedItemInvalid).toBeDefined();
			expect(testedItemInvalid?.siteName).toBe("Unknown Source"); // Fallback for article

			const testedItemPdf = body.find((a) => a._id === itemPdfNoUrl._id);
			expect(testedItemPdf).toBeDefined();
			expect(testedItemPdf?.siteName).toBe("PDF Document"); // Fallback for PDF
		});

		it("should calculate estimatedReadTime if missing", async () => {
			// Approx 400 words -> 2 mins
			const longContent = "<p>Word </p>".repeat(400); // Revert to simple string
			const itemMissingReadTime: WorkerArticle = {
				_id: "article_no_readtime",
				userId: testUserId,
				url: "http://example.com/no-readtime",
				title: "No Read Time",
				type: "article",
				savedAt: Date.now(),
				isRead: false,
				favorite: false,
				siteName: "Test",
				content: longContent,
			};
			mockKvNamespace._store.set(
				createUserItemKey(testUserId, itemMissingReadTime._id),
				JSON.stringify(itemMissingReadTime),
			);

			const request = new Request("http://example.com/items");
			const response = await handleListItems(request, mockEnv, testUserId);
			const body = (await response.json()) as WorkerArticle[];
			const testedItem = body.find((a) => a._id === itemMissingReadTime._id);
			expect(testedItem).toBeDefined();
			expect(testedItem?.estimatedReadTime).toBe(2); // Expect calculated time
		});

		it("should use default estimatedReadTime (1) if missing and content is empty/missing", async () => {
			const itemNoContent: WorkerArticle = {
				_id: "article_no_content",
				userId: testUserId,
				url: "http://example.com/no-content",
				title: "No Content",
				type: "article",
				savedAt: Date.now(),
				isRead: false,
				favorite: false,
				siteName: "Test",
				content: "", // Empty content
			};
			const itemMissingContent: WorkerArticle = {
				_id: "article_missing_content",
				userId: testUserId,
				url: "http://example.com/missing-content",
				title: "Missing Content",
				type: "article",
				savedAt: Date.now(),
				isRead: false,
				favorite: false,
				siteName: "Test", // No content field
			};
			mockKvNamespace._store.set(
				createUserItemKey(testUserId, itemNoContent._id),
				JSON.stringify(itemNoContent),
			);
			mockKvNamespace._store.set(
				createUserItemKey(testUserId, itemMissingContent._id),
				JSON.stringify(itemMissingContent),
			);

			const request = new Request("http://example.com/items");
			const response = await handleListItems(request, mockEnv, testUserId);
			const body = (await response.json()) as WorkerArticle[];

			const testedItemNoContent = body.find((a) => a._id === itemNoContent._id);
			expect(testedItemNoContent).toBeDefined();
			expect(testedItemNoContent?.estimatedReadTime).toBe(1); // Default 1 min

			const testedItemMissingContent = body.find(
				(a) => a._id === itemMissingContent._id,
			);
			expect(testedItemMissingContent).toBeDefined();
			expect(testedItemMissingContent?.estimatedReadTime).toBe(1); // Default 1 min
		});

		it("should handle NaN in estimatedReadTime and calculate fallback", async () => {
			const itemNanReadTime: WorkerArticle = {
				_id: "article_nan_readtime",
				userId: testUserId,
				url: "http://example.com/nan",
				title: "NaN Read Time",
				type: "article",
				savedAt: Date.now(),
				isRead: false,
				favorite: false,
				siteName: "Test",
				content: "<p>Word </p>".repeat(250),
				estimatedReadTime: Number.NaN, // Revert to simple string, keep Number.NaN
			};
			mockKvNamespace._store.set(
				createUserItemKey(testUserId, itemNanReadTime._id),
				JSON.stringify(itemNanReadTime),
			);

			const request = new Request("http://example.com/items");
			const response = await handleListItems(request, mockEnv, testUserId);
			const body = (await response.json()) as WorkerArticle[];
			const testedItem = body.find((a) => a._id === itemNanReadTime._id);
			expect(testedItem).toBeDefined();
			expect(testedItem?.estimatedReadTime).toBe(2); // Expect calculated time (250 words -> 2 min)
		});
	});

	// --- handlePostItem ---
	describe("handlePostItem", () => {
		const newItem: WorkerArticle = {
			_id: "article_new",
			userId: testUserId,
			url: "http://example.com/new",
			title: "New Article",
			type: "article",
			savedAt: Date.now(),
			isRead: false,
			favorite: false,
			siteName: "New Site",
			estimatedReadTime: 1,
		};

		it("should save a new item correctly", async () => {
			const request = new Request("http://example.com/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(newItem),
			});
			const response = await handlePostItem(
				request,
				mockEnv,
				mockCtx,
				testUserId,
			);
			expect(response.status).toBe(201);
			const body = (await response.json()) as {
				status?: string;
				item?: WorkerArticle;
				message?: string;
			};
			expect(body.status).toBe("success");
			expect(body.item).toEqual(newItem); // Check if the saved item is returned

			const key = createUserItemKey(testUserId, newItem._id);
			// Check that put was called with the correct key and the stringified newItem
			expect(mockKvNamespace.put).toHaveBeenCalledWith(
				key,
				JSON.stringify(newItem),
			);
			// Check that the item was actually stored in our mock KV store
			expect(mockKvNamespace._store.get(key)).toBe(JSON.stringify(newItem));
		});

		it("should return 400 for invalid item data", async () => {
			const invalidItem = { ...newItem, title: undefined }; // Missing title
			const request = new Request("http://example.com/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(invalidItem),
			});
			const response = await handlePostItem(
				request,
				mockEnv,
				mockCtx,
				testUserId,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toContain("Invalid article data");
			expect(mockKvNamespace.put).not.toHaveBeenCalled();
		});

		it("should return 403 if item userId does not match authenticated userId", async () => {
			const wrongUserItem = { ...newItem, userId: "wrong_user" };
			const request = new Request("http://example.com/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(wrongUserItem),
			});
			const response = await handlePostItem(
				request,
				mockEnv,
				mockCtx,
				testUserId,
			);
			expect(response.status).toBe(403);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe("User ID mismatch");
			expect(mockKvNamespace.put).not.toHaveBeenCalled();
		});

		it("should return 400 for invalid JSON body", async () => {
			const request = new Request("http://example.com/items", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{invalid json",
			});
			const response = await handlePostItem(
				request,
				mockEnv,
				mockCtx,
				testUserId,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe("Invalid JSON format in request body");
			expect(mockKvNamespace.put).not.toHaveBeenCalled();
		});
	});

	// --- handleGetItem ---
	describe("handleGetItem", () => {
		it("should retrieve an existing item for the user", async () => {
			const request = new Request(`http://example.com/items/${article1._id}`);
			const response = await handleGetItem(
				request,
				mockEnv,
				testUserId,
				article1._id,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as WorkerArticle; // Should succeed and return article
			expect(body).toEqual(article1);
			expect(mockKvNamespace.get).toHaveBeenCalledWith(
				createUserItemKey(testUserId, article1._id),
			);
		});

		it("should return 404 if item not found for the user", async () => {
			const request = new Request("http://example.com/items/non_existent_id");
			const response = await handleGetItem(
				request,
				mockEnv,
				testUserId,
				"non_existent_id",
			);
			expect(response.status).toBe(404);
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe("Item not found");
			expect(mockKvNamespace.get).toHaveBeenCalledWith(
				createUserItemKey(testUserId, "non_existent_id"),
			);
		});

		it("should return 404 if item exists but belongs to another user", async () => {
			const request = new Request(
				`http://example.com/items/${articleOtherUser._id}`,
			);
			// Authenticated as testUserId, trying to get articleOtherUser's item
			const response = await handleGetItem(
				request,
				mockEnv,
				testUserId,
				articleOtherUser._id,
			);
			expect(response.status).toBe(404); // KV key won't match
			const body = (await response.json()) as { message?: string };
			expect(body.message).toBe("Item not found");
			expect(mockKvNamespace.get).toHaveBeenCalledWith(
				createUserItemKey(testUserId, articleOtherUser._id),
			);
		});
	});

	// --- handleDeleteItem ---
	describe("handleDeleteItem", () => {
		it("should delete an existing item for the user", async () => {
			const key = createUserItemKey(testUserId, article1._id);
			expect(mockKvNamespace._store.has(key)).toBe(true); // Verify item exists before delete

			const request = new Request(`http://example.com/items/${article1._id}`, {
				method: "DELETE",
			});
			const response = await handleDeleteItem(
				request,
				mockEnv,
				testUserId,
				article1._id,
			);
			expect(response.status).toBe(200);
			const body = (await response.json()) as { status?: string };
			expect(body.status).toBe("success");
			expect(mockKvNamespace.delete).toHaveBeenCalledWith(key);
			// Re-check the store state *after* the await completes
			const itemExistsAfterDelete = mockKvNamespace._store.has(key);
			expect(itemExistsAfterDelete).toBe(false); // Verify item is gone
		});

		it("should return success even if item doesn't exist (idempotent)", async () => {
			const key = createUserItemKey(testUserId, "non_existent_id");
			expect(mockKvNamespace._store.has(key)).toBe(false);

			const request = new Request("http://example.com/items/non_existent_id", {
				method: "DELETE",
			});
			const response = await handleDeleteItem(
				request,
				mockEnv,
				testUserId,
				"non_existent_id",
			);
			expect(response.status).toBe(200); // Delete is idempotent
			const body = (await response.json()) as { status?: string };
			expect(body.status).toBe("success");
			expect(mockKvNamespace.delete).toHaveBeenCalledWith(key);
		});

		it("should not delete item belonging to another user", async () => {
			const otherUserKey = createUserItemKey(
				articleOtherUser.userId,
				articleOtherUser._id,
			);
			const keyToDelete = createUserItemKey(testUserId, articleOtherUser._id); // Key based on authenticated user
			expect(mockKvNamespace._store.has(otherUserKey)).toBe(true); // Other user's item exists

			const request = new Request(
				`http://example.com/items/${articleOtherUser._id}`,
				{ method: "DELETE" },
			);
			// Authenticated as testUserId
			const response = await handleDeleteItem(
				request,
				mockEnv,
				testUserId,
				articleOtherUser._id,
			);
			expect(response.status).toBe(200); // Delete is idempotent, doesn't error if key not found
			const body = (await response.json()) as { status?: string };
			expect(body.status).toBe("success");
			expect(mockKvNamespace.delete).toHaveBeenCalledWith(keyToDelete);
			expect(mockKvNamespace._store.has(otherUserKey)).toBe(true); // Other user's item should remain
		});
	});
});
