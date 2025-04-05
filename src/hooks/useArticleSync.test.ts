// import React from "react"; // Removed unused React import
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleSync } from "./useArticleSync";
// import { MockArticleProvider } from "@/test-utils/MockArticleProvider"; // Commented out unused import

// Import types needed for mocks and tests
import type { Article, QueuedOperation } from "@/services/db";

// --- Mocks Setup ---

// Use vi.hoisted for mocks that need to be available before imports, including Clerk mocks
const {
	// Removed duplicate mockGetAllArticles declaration
	// All hoisted mocks are defined within vi.hoisted and destructured here
	mockGetAllArticles,
	mockSaveArticle,
	mockBulkSaveArticles,
	mockLocalSoftDeleteArticle,
	mockArticlesDbGet,
	mockArticlesDbPut,
	mockArticlesDbRemove,
	mockArticlesDbBulkDocs,
	mockOperationsQueueDbGet,
	mockOperationsQueueDbPut,
	mockOperationsQueueDbRemove,
	mockOperationsQueueDbAllDocs,
	mockOperationsQueueDbBulkDocs,
	mockFetchCloudItems,
	mockDeleteItemFromCloud,
	mockSaveItemToCloud,
	mockUseAuth, // Function for clearing
	mockUseUser, // Function for clearing
	stableGetToken, // Function for tests/vi.mock
	stableUseAuthResult, // Stable object for vi.mock
	stableUseUserResult, // Stable object for vi.mock
} = vi.hoisted(() => {
	// --- Stable Clerk Values ---
	const _stableGetTokenFn = vi.fn().mockResolvedValue("test-token");
	const _stableAuthResult = {
		userId: "test-user-id",
		isSignedIn: true,
		isLoaded: true,
		getToken: _stableGetTokenFn,
		sessionId: "test-session-id",
		// Add other properties if needed by useArticleSync or its internals
	};
	const _stableUserObject = {
		primaryEmailAddress: { emailAddress: "test@example.com" },
		id: "test-user-clerk-id",
		// Add other properties if needed
	};
	const _stableUserResult = {
		isLoaded: true,
		isSignedIn: true,
		user: _stableUserObject,
	};
	// Mock functions for Clerk hooks (needed for clearing)
	const _mockUseAuthFn = vi.fn(() => _stableAuthResult);
	const _mockUseUserFn = vi.fn(() => _stableUserResult);

	// --- All Other Mocks ---
	const _mockGetAllArticles = vi.fn();
	const _mockSaveArticle = vi.fn((article) =>
		Promise.resolve({ ...article, _rev: "mock-rev-save" }),
	);
	const _mockBulkSaveArticles = vi.fn((articles) =>
		Promise.resolve(
			articles.map((a: any) => ({
				ok: true,
				id: a._id,
				rev: `mock-rev-bulk-${a._id}`,
			})),
		),
	);
	const _mockLocalSoftDeleteArticle = vi.fn().mockResolvedValue(true);
	const _mockArticlesDbGet = vi.fn();
	const _mockArticlesDbPut = vi.fn();
	const _mockArticlesDbRemove = vi.fn();
	const _mockArticlesDbBulkDocs = vi.fn().mockResolvedValue([]);
	const _mockOperationsQueueDbGet = vi.fn();
	const _mockOperationsQueueDbPut = vi.fn();
	const _mockOperationsQueueDbRemove = vi.fn();
	const _mockOperationsQueueDbAllDocs = vi.fn();
	const _mockOperationsQueueDbBulkDocs = vi.fn().mockResolvedValue([]);
	const _mockFetchCloudItems = vi.fn();
	const _mockDeleteItemFromCloud = vi.fn();
	const _mockSaveItemToCloud = vi.fn();

	// --- Returned Hoisted Object ---
	return {
		// Standard Mocks
		mockGetAllArticles: _mockGetAllArticles,
		mockSaveArticle: _mockSaveArticle,
		mockBulkSaveArticles: _mockBulkSaveArticles,
		mockLocalSoftDeleteArticle: _mockLocalSoftDeleteArticle,
		mockArticlesDbGet: _mockArticlesDbGet,
		mockArticlesDbPut: _mockArticlesDbPut,
		mockArticlesDbRemove: _mockArticlesDbRemove,
		mockArticlesDbBulkDocs: _mockArticlesDbBulkDocs,
		mockOperationsQueueDbGet: _mockOperationsQueueDbGet,
		mockOperationsQueueDbPut: _mockOperationsQueueDbPut,
		mockOperationsQueueDbRemove: _mockOperationsQueueDbRemove,
		mockOperationsQueueDbAllDocs: _mockOperationsQueueDbAllDocs,
		mockOperationsQueueDbBulkDocs: _mockOperationsQueueDbBulkDocs,
		mockFetchCloudItems: _mockFetchCloudItems,
		mockDeleteItemFromCloud: _mockDeleteItemFromCloud,
		mockSaveItemToCloud: _mockSaveItemToCloud,
		// Clerk Mock Functions (for clearing)
		mockUseAuth: _mockUseAuthFn,
		mockUseUser: _mockUseUserFn,
		// Clerk Stable Values (for vi.mock factories / tests)
		stableGetToken: _stableGetTokenFn,
		stableUseAuthResult: _stableAuthResult,
		stableUseUserResult: _stableUserResult,
	};
});

// ---- MOCK MODULES ----

// Use a stable reference for the toast mock
const mockToastFn = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ toast: mockToastFn }),
}));

// Use stable Clerk mocks defined in hoisted block
vi.mock("@clerk/clerk-react", () => ({
	useAuth: vi.fn(() => stableUseAuthResult), // Mock useAuth to return stable object
	useUser: vi.fn(() => stableUseUserResult), // Mock useUser to return stable object
}));

vi.mock("@/services/db", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/services/db")>();
	return {
		...actual,
		getAllArticles: mockGetAllArticles,
		saveArticle: mockSaveArticle,
		bulkSaveArticles: mockBulkSaveArticles,
		deleteArticle: mockLocalSoftDeleteArticle,
		articlesDb: {
			get: mockArticlesDbGet,
			put: mockArticlesDbPut,
			remove: mockArticlesDbRemove,
			bulkDocs: mockArticlesDbBulkDocs,
			info: vi.fn().mockResolvedValue({ doc_count: 0 }),
			createIndex: vi.fn().mockResolvedValue({ result: "created" }),
		},
		operationsQueueDb: {
			get: mockOperationsQueueDbGet,
			put: mockOperationsQueueDbPut,
			remove: mockOperationsQueueDbRemove,
			allDocs: mockOperationsQueueDbAllDocs,
			bulkDocs: mockOperationsQueueDbBulkDocs,
			info: vi.fn().mockResolvedValue({ doc_count: 0 }),
			createIndex: vi.fn().mockResolvedValue({ result: "created" }),
		},
	};
});

vi.mock("@/services/cloudSync", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/services/cloudSync")>();
	return {
		...actual,
		fetchCloudItems: mockFetchCloudItems,
		deleteItemFromCloud: mockDeleteItemFromCloud,
		saveItemToCloud: mockSaveItemToCloud,
	};
});

vi.mock("@/lib/articleUtils", () => {
	return {
		filterAndSortArticles: vi.fn((articles: Article[], view: string) => {
			if (view === "unread") return articles.filter((a: Article) => !a.isRead);
			if (view === "favorites")
				return articles.filter((a: Article) => a.favorite);
			return articles;
		}),
		runOneTimeFileSync: vi.fn(),
	};
});

// --- Test Data ---
const baseMockArticle = (
	id: string,
	version: number,
	savedAt: number,
	titleSuffix = "",
): Article => ({
	_id: id,
	url: `http://example.com/${id}`,
	title: `Article ${id}${titleSuffix}`,
	content: `Content ${id}`,
	savedAt: savedAt,
	status: "inbox" as const,
	isRead: false,
	favorite: false,
	type: "article" as const,
	userId: "test-user-id",
	excerpt: `Excerpt ${id}`,
	tags: [],
	version: version,
	_rev: `rev-${id}-${version}`,
	deletedAt: undefined,
});

const mockArticles: Article[] = [
	baseMockArticle("1", 1, 1000),
	baseMockArticle("2", 1, 2000),
];

// --- Tests ---
describe("useArticleSync", () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Explicitly clear this critical mock's history
		mockBulkSaveArticles.mockClear();
		// --- Reset Core Mocks ---
		mockGetAllArticles.mockReset().mockResolvedValue([]);
		mockFetchCloudItems.mockReset().mockResolvedValue([]);
		mockOperationsQueueDbAllDocs.mockReset().mockResolvedValue({
			offset: 0,
			total_rows: 0,
			rows: [],
		});
		mockDeleteItemFromCloud.mockReset().mockResolvedValue("success");
		mockSaveItemToCloud.mockReset().mockResolvedValue("success");
		mockBulkSaveArticles.mockReset().mockImplementation(async (articles) =>
			articles.map((a: any) => ({
				ok: true,
				id: a._id,
				rev: `mock-rev-bulk-${a._id}`,
			})),
		);
		mockLocalSoftDeleteArticle.mockReset().mockResolvedValue(true);

		// PouchDB specific mocks
		mockArticlesDbGet.mockReset().mockImplementation(async (id: string) => {
			throw {
				status: 404,
				name: "not_found",
				message: `Doc ${id} missing (mock)`,
			};
		});
		mockArticlesDbPut.mockReset();
		mockArticlesDbRemove.mockReset();
		mockArticlesDbBulkDocs.mockReset().mockResolvedValue([]);
		mockOperationsQueueDbGet.mockReset();
		mockOperationsQueueDbPut.mockReset();
		mockOperationsQueueDbRemove.mockReset();
		mockOperationsQueueDbBulkDocs.mockReset().mockResolvedValue([]);

		// Reset Clerk mocks (optional, but good practice)
		mockUseAuth.mockClear();
		mockUseUser.mockClear();
		stableGetToken.mockClear(); // Also clear the stable getToken mock if needed
	});

	it("should deduplicate articles that have the same ID but different savedAt", async () => {
		const duplicateArticles: Article[] = [
			...mockArticles,
			{
				...baseMockArticle("1", 1, 3000, " Updated"),
				_rev: "rev-1-1-dup",
				favorite: true,
			},
		];
		mockGetAllArticles.mockResolvedValue(duplicateArticles); // Initial cache load has duplicates

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);

		// Wait for loading to finish and state to update
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
			// Also wait for the article count to reflect deduplication
			expect(result.current.articles).toHaveLength(2);
		});

		// Now check the state after loading
		expect(result.current.articles.length).toBe(2);
		const article1 = result.current.articles.find((a) => a._id === "1");
		expect(article1).toBeDefined();
		expect(article1?.title).toBe("Article 1 Updated");
		expect(article1?.savedAt).toBe(3000);
	});

	it("should deduplicate articles received from the cloud", async () => {
		const cloudArticles: Article[] = [
			{
				...baseMockArticle("1", 2, 5000, " Cloud Updated"),
				isRead: true,
				favorite: true,
				_rev: "rev-cloud-1-2",
			},
			{
				...baseMockArticle("3", 1, 4000, " Cloud Article 3"),
				_rev: "rev-cloud-3-1",
			},
		];

		// Mock initial load: Returns the two base articles
		mockGetAllArticles.mockResolvedValueOnce([...mockArticles]);

		// Mock fetchCloudItems: Returns the cloud state with updated #1 and new #3
		mockFetchCloudItems.mockResolvedValue(cloudArticles);

		// Mock bulkSaveArticles: This will be called to save the updated #1 and new #3
		let savedArticles: Article[] = [];
		mockBulkSaveArticles.mockImplementation(async (articlesToSave) => {
			savedArticles = articlesToSave.map((a: any) => ({
				...a,
				_rev: `mock-rev-bulk-${a._id}-${a.version}`,
			}));
			return savedArticles.map((a) => ({ ok: true, id: a._id, rev: a._rev }));
		});

		// Mock the final getAllArticles call (non-deleted) after sync
		mockGetAllArticles.mockImplementation(async (params) => {
			if (params?.includeDeleted) {
				// This is the reconciliation fetch, return the initial state
				return [...mockArticles];
			}
			// This is the final UI state fetch
			// Return the original article #2 plus the saved articles (#1 updated, #3 new)
			const finalState = [
				...mockArticles.filter((a) => a._id === "2"),
				...savedArticles,
			];
			return finalState;
		});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);

		// Wait for the hook to finish loading and refreshing, and for the articles
		// count to become 3.
		await waitFor(
			() => {
				expect(result.current.isLoading).toBe(false);
				expect(result.current.isRefreshing).toBe(false);
				expect(result.current.articles.length).toBe(3);
			},
			{ timeout: 2000 },
		);

		// Additional check to ensure mocks were called as expected
		expect(mockFetchCloudItems).toHaveBeenCalledTimes(1);
		expect(mockBulkSaveArticles).toHaveBeenCalledTimes(1);

		// Verify the content of the articles after sync
		const article1 = result.current.articles.find((a) => a._id === "1");
		expect(article1).toBeDefined();
		expect(article1?.title).toBe("Article 1 Cloud Updated");
		expect(article1?.version).toBe(2);
		expect(article1?.isRead).toBe(true);

		const article2 = result.current.articles.find((a) => a._id === "2");
		expect(article2).toBeDefined(); // Should still exist

		const article3 = result.current.articles.find((a) => a._id === "3");
		expect(article3).toBeDefined(); // Should be newly added
		expect(article3?.title).toBe("Article 3 Cloud Article 3");
	});

	// --- New Reconciliation Tests ---

	it("Scenario: Local Delete (Online)", async () => {
		const localDeletedArticle = {
			...baseMockArticle("1", 2, 2000),
			deletedAt: Date.now(),
			_rev: "rev-1-2",
		};
		const cloudArticle = baseMockArticle("1", 1, 1000);

		// Override mock for articlesDb.get for this test, needed for hard delete
		mockArticlesDbGet.mockResolvedValue(localDeletedArticle);

		// For all getAllArticles calls
		mockGetAllArticles.mockImplementation((params) => {
			if (params?.includeDeleted) {
				return Promise.resolve([localDeletedArticle]);
			}
			return Promise.resolve([]);
		});
		mockFetchCloudItems.mockResolvedValue([cloudArticle]);
		mockDeleteItemFromCloud.mockResolvedValue("success");
		mockOperationsQueueDbAllDocs.mockResolvedValue({
			offset: 0,
			total_rows: 0,
			rows: [],
		});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(mockDeleteItemFromCloud).toHaveBeenCalledWith("1", "test-token"); // Expect token
		expect(mockArticlesDbBulkDocs).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: "1", _rev: "rev-1-2", _deleted: true }),
			]),
		);
		expect(result.current.articles).toEqual([]);
		expect(mockOperationsQueueDbAllDocs).toHaveBeenCalled();
	});

	it("Scenario: Local Delete (Offline then Sync)", async () => {
		const queuedDeleteOpDoc: QueuedOperation &
			PouchDB.Core.IdMeta &
			PouchDB.Core.RevisionIdMeta = {
			_id: "qdel-1",
			_rev: "qrev-1",
			type: "delete",
			docId: "1",
			timestamp: Date.now(),
			retryCount: 0,
		};
		const queuedDeleteOpRow = {
			doc: queuedDeleteOpDoc,
			id: queuedDeleteOpDoc._id,
			key: queuedDeleteOpDoc._id,
			value: { rev: queuedDeleteOpDoc._rev },
		};
		const localDeletedArticle = {
			...baseMockArticle("1", 2, 2000),
			deletedAt: Date.now(),
			_rev: "rev-1-2",
		};
		const cloudArticle = baseMockArticle("1", 1, 1000);

		// Override mock for articlesDb.get for this test, needed by queue processor AND hard delete
		mockArticlesDbGet.mockResolvedValue(localDeletedArticle); // Resolves multiple times if needed

		mockOperationsQueueDbAllDocs.mockResolvedValue({
			offset: 0,
			total_rows: 1,
			rows: [queuedDeleteOpRow],
		});
		mockDeleteItemFromCloud.mockResolvedValue("success");
		// For all getAllArticles calls
		mockGetAllArticles.mockImplementation((params) => {
			if (params?.includeDeleted) {
				return Promise.resolve([localDeletedArticle]);
			}
			return Promise.resolve([]);
		});
		mockFetchCloudItems.mockResolvedValue([cloudArticle]);

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(mockOperationsQueueDbAllDocs).toHaveBeenCalled();
		expect(mockDeleteItemFromCloud).toHaveBeenCalledWith("1", "test-token"); // Expect token
		expect(mockOperationsQueueDbBulkDocs).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: "qdel-1", _deleted: true }),
			]),
		);
		expect(mockArticlesDbBulkDocs).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: "1", _rev: "rev-1-2", _deleted: true }),
			]),
		);
		expect(result.current.articles).toEqual([]);
	});

	it("Scenario: Cloud Delete", async () => {
		const localActiveArticle = {
			...baseMockArticle("1", 1, 1000),
			_rev: "rev-1-1",
		};

		// Mock articlesDb.get needed by localSoftDeleteArticle
		mockArticlesDbGet.mockResolvedValue(localActiveArticle);

		// For all getAllArticles calls
		mockGetAllArticles.mockImplementation((params) => {
			if (params?.includeDeleted) {
				return Promise.resolve([localActiveArticle]);
			}
			if (mockGetAllArticles.mock.calls.length <= 1) {
				return Promise.resolve([localActiveArticle]);
			}
			return Promise.resolve([]);
		});
		mockFetchCloudItems.mockResolvedValue([]); // Cloud is empty
		mockLocalSoftDeleteArticle.mockResolvedValue(true);
		mockOperationsQueueDbAllDocs.mockResolvedValue({
			offset: 0,
			total_rows: 0,
			rows: [],
		});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(mockLocalSoftDeleteArticle).toHaveBeenCalledWith("1");
		expect(mockDeleteItemFromCloud).not.toHaveBeenCalled();
		expect(mockOperationsQueueDbPut).not.toHaveBeenCalled();
		expect(result.current.articles).toEqual([]);
	});

	it("Scenario: Conflict - Cloud Update vs Local Delete (Cloud Wins)", async () => {
		const initialLocal: Article[] = [baseMockArticle("1", 1, 1000)];
		const cloudUpdate: Article[] = [
			baseMockArticle("1", 2, 2000, " Cloud Wins"), // Higher version
		];
		const localDeletedRev = "rev-local-delete";

		// Initial load (before delete)
		mockGetAllArticles.mockResolvedValueOnce([...initialLocal]);

		// Fetch cloud items returns the newer version
		mockFetchCloudItems.mockResolvedValue(cloudUpdate);

		// Mock the getAllArticles call *during* reconciliation (includes deleted)
		mockGetAllArticles.mockResolvedValueOnce([
			{ ...initialLocal[0], deletedAt: Date.now(), _rev: localDeletedRev },
		]);

		// Mock the final getAllArticles call (non-deleted) after sync
		const finalSavedArticle = { ...cloudUpdate[0], _rev: "rev-after-save-1-2" };
		mockGetAllArticles.mockResolvedValueOnce([finalSavedArticle]);

		// Mock bulkSaveArticles: Expect it to be called with the cloud data + local deleted rev
		mockBulkSaveArticles.mockImplementation(async (articlesToSave) => {
			// Check if it's called with the expected data
			expect(articlesToSave).toHaveLength(1);
			expect(articlesToSave[0]).toMatchObject({
				...cloudUpdate[0],
				_rev: localDeletedRev, // Expecting the local deleted rev
			});
			// Simulate successful save, returning a *new* revision
			return [
				{ ok: true, id: finalSavedArticle._id, rev: finalSavedArticle._rev },
			];
		});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);

		// Wait for sync to complete and check final state
		await waitFor(
			() => {
				expect(result.current.isLoading).toBe(false);
				expect(result.current.isRefreshing).toBe(false);
				expect(result.current.articles.length).toBe(1);
				expect(result.current.articles[0].title).toBe("Article 1 Cloud Wins");
				expect(result.current.articles[0]._rev).toBe(finalSavedArticle._rev);
				expect(result.current.articles[0].deletedAt).toBeUndefined();
			},
			{ timeout: 2000 },
		);

		// Verify bulkSaveArticles was called exactly once
		expect(mockBulkSaveArticles).toHaveBeenCalledTimes(1);
	});

	it("Scenario: Conflict - Local Update vs Cloud Delete (Cloud Wins)", async () => {
		const localUpdatedArticle = {
			...baseMockArticle("1", 2, 2000, " Local Update"),
			_rev: "rev-1-2",
		};

		// Mock get needed by localSoftDeleteArticle
		mockArticlesDbGet.mockResolvedValueOnce(localUpdatedArticle);

		// For all getAllArticles calls
		mockGetAllArticles.mockImplementation((params) => {
			if (params?.includeDeleted) {
				return Promise.resolve([localUpdatedArticle]);
			}
			if (mockGetAllArticles.mock.calls.length <= 1) {
				return Promise.resolve([localUpdatedArticle]);
			}
			return Promise.resolve([]);
		});
		mockFetchCloudItems.mockResolvedValue([]); // Cloud deleted it
		mockLocalSoftDeleteArticle.mockResolvedValue(true);
		mockOperationsQueueDbAllDocs.mockResolvedValue({
			offset: 0,
			total_rows: 0,
			rows: [],
		});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false), {
			timeout: 2000,
		});

		expect(mockLocalSoftDeleteArticle).toHaveBeenCalledWith("1");
		expect(mockOperationsQueueDbPut).not.toHaveBeenCalled();
		expect(result.current.articles).toEqual([]);
	});

	it("Scenario: Local Create/Update Offline then Sync", async () => {
		const localUpdatedArticle = {
			...baseMockArticle("1", 2, 2000, " Local Update"),
			_rev: "rev-1-2",
		};
		const cloudOldArticle = baseMockArticle("1", 1, 1000);
		const queuedUpdateOpDoc: QueuedOperation &
			PouchDB.Core.IdMeta &
			PouchDB.Core.RevisionIdMeta = {
			_id: "qupd-1",
			_rev: "qrev-1",
			type: "update",
			docId: "1",
			timestamp: Date.now(),
			retryCount: 0,
			data: localUpdatedArticle as Partial<Article>,
		};
		const queuedUpdateOpRow = {
			doc: queuedUpdateOpDoc,
			id: queuedUpdateOpDoc._id,
			key: queuedUpdateOpDoc._id,
			value: { rev: queuedUpdateOpDoc._rev },
		};

		mockOperationsQueueDbAllDocs.mockResolvedValue({
			offset: 0,
			total_rows: 1,
			rows: [queuedUpdateOpRow],
		});
		mockSaveItemToCloud.mockResolvedValue("success");
		// Mock get needed by queue processor
		mockArticlesDbGet.mockResolvedValue(localUpdatedArticle);
		// For all getAllArticles calls
		mockGetAllArticles.mockResolvedValue([localUpdatedArticle]);
		mockFetchCloudItems.mockResolvedValue([cloudOldArticle]);

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(mockOperationsQueueDbAllDocs).toHaveBeenCalled();
		expect(mockSaveItemToCloud).toHaveBeenCalledWith(
			localUpdatedArticle,
			"test-token",
		); // Expect token
		expect(mockOperationsQueueDbBulkDocs).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: "qupd-1", _deleted: true }),
			]),
		);
		expect(mockBulkSaveArticles).not.toHaveBeenCalled();
		expect(mockLocalSoftDeleteArticle).not.toHaveBeenCalled();
		expect(result.current.articles).toHaveLength(1); // Should have the updated article
		expect(result.current.articles[0].version).toBe(2);
		expect(result.current.articles[0].title).toBe(localUpdatedArticle.title);
	});

	it("should skip offline queue processing if token is null", async () => {
		// Mock getToken to return null for this specific test
		stableGetToken.mockResolvedValueOnce(null); // Override the default mock

		// Setup a dummy queue item to ensure queue would be processed if token existed
		const queuedOpDoc: QueuedOperation &
			PouchDB.Core.IdMeta &
			PouchDB.Core.RevisionIdMeta = {
			_id: "qnull-1",
			_rev: "qrev-null",
			type: "delete",
			docId: "null-doc",
			timestamp: Date.now(),
			retryCount: 0,
		};
		const queuedOpRow = {
			doc: queuedOpDoc,
			id: queuedOpDoc._id,
			key: queuedOpDoc._id,
			value: { rev: queuedOpDoc._rev },
		};
		mockOperationsQueueDbAllDocs.mockResolvedValue({
			offset: 0,
			total_rows: 1,
			rows: [queuedOpRow],
		});

		// Mock other functions to allow sync to proceed after queue skip attempt
		mockGetAllArticles.mockResolvedValue([]);
		mockFetchCloudItems.mockResolvedValue([]);

		// Spy on console.error to check for the specific warning
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);

		// Wait for the sync process to potentially throw or complete
		await waitFor(() => {
			// The sync process should throw because token is null after the queue check
			expect(result.current.error).not.toBeNull();
			expect(result.current.error?.message).toContain(
				"Authentication token missing, cannot sync.",
			);
		});

		// Check that the specific error message for skipping queue was logged
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Sync Hook: Cannot process offline queue, authentication token is missing.",
		);
		// Ensure queue processing functions were NOT called
		expect(mockDeleteItemFromCloud).not.toHaveBeenCalled();
		expect(mockSaveItemToCloud).not.toHaveBeenCalled();
		expect(mockOperationsQueueDbBulkDocs).not.toHaveBeenCalled();

		// Clean up the spy
		consoleErrorSpy.mockRestore();
	});

	it("should handle API 401 error during offline delete processing", async () => {
		const queuedDeleteOpDoc: QueuedOperation &
			PouchDB.Core.IdMeta &
			PouchDB.Core.RevisionIdMeta = {
			_id: "qdel-fail-1",
			_rev: "qrev-fail-1",
			type: "delete",
			docId: "fail-doc-1",
			timestamp: Date.now(),
			retryCount: 0,
		};
		const queuedDeleteOpRow = {
			doc: queuedDeleteOpDoc,
			id: queuedDeleteOpDoc._id,
			key: queuedDeleteOpDoc._id,
			value: { rev: queuedDeleteOpDoc._rev },
		};
		mockOperationsQueueDbAllDocs.mockResolvedValue({
			offset: 0,
			total_rows: 1,
			rows: [queuedDeleteOpRow],
		});

		// Mock deleteItemFromCloud to return unauthorized
		mockDeleteItemFromCloud.mockResolvedValueOnce("unauthorized");

		// Mock other calls to let sync proceed
		mockGetAllArticles.mockResolvedValue([]);
		mockFetchCloudItems.mockResolvedValue([]);

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		// Check that deleteItemFromCloud was called with the token
		expect(mockDeleteItemFromCloud).toHaveBeenCalledWith(
			"fail-doc-1",
			"test-token",
		);
		// Check that the queue item was updated (retry count incremented)
		expect(mockOperationsQueueDbBulkDocs).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: "qdel-fail-1", retryCount: 1 }),
			]),
		);
		// Check for the warning log
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			"Sync Hook: Queued delete failed for fail-doc-1, status: unauthorized",
		);
		consoleWarnSpy.mockRestore();
	});

	it("should pass token during reconciliation delete re-attempt", async () => {
		const localDeletedArticle = {
			...baseMockArticle("recon-del-1", 2, 2000),
			deletedAt: Date.now(),
			_rev: "rev-recon-del-1",
		};
		const cloudArticleStillExists = baseMockArticle("recon-del-1", 1, 1000); // Lower version

		// Mock needed by hard delete check
		mockArticlesDbGet.mockResolvedValue(localDeletedArticle);

		// Setup mocks
		mockGetAllArticles.mockResolvedValueOnce([]); // Empty initial cache
		mockGetAllArticles.mockResolvedValueOnce([localDeletedArticle]); // Reconciliation fetch
		mockFetchCloudItems.mockResolvedValue([cloudArticleStillExists]); // Cloud has older version
		mockDeleteItemFromCloud.mockResolvedValue("success"); // Mock successful delete re-attempt
		mockOperationsQueueDbAllDocs.mockResolvedValue({
			offset: 0,
			total_rows: 0,
			rows: [],
		}); // Empty queue

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		// Check that deleteItemFromCloud was called during reconciliation with the token
		expect(mockDeleteItemFromCloud).toHaveBeenCalledWith(
			"recon-del-1",
			"test-token",
		);
		// Check that local hard delete was triggered
		expect(mockArticlesDbBulkDocs).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					_id: "recon-del-1",
					_rev: "rev-recon-del-1",
					_deleted: true,
				}),
			]),
		);
	});

	// Define the wrapper component using a standard function declaration
	// function WrapperComponent(props: { children: React.ReactNode }) {
	// 	return <MockArticleProvider>{props.children}</MockArticleProvider>;
	// }
	it("should handle duplicate articles correctly", async () => {
		const duplicateArticles: Article[] = [
			...mockArticles,
			{
				_id: "1", // Same ID as the first article
				url: "http://example.com/1",
				title: "Article 1 Updated", // Different title
				content: "Updated content", // Different content
				savedAt: 3000, // Newer timestamp
				status: "inbox",
				isRead: false,
				favorite: false,
				type: "article",
				userId: "test-user-id",
				excerpt: "Updated excerpt",
				tags: [],
				version: 2, // Higher version
				_rev: "rev-1-2",
			},
		];

		mockGetAllArticles.mockResolvedValueOnce(duplicateArticles);

		const { result } = renderHook(
			() => useArticleSync(true, new Set<string>()), // Removed the options object with the wrapper
		);

		await waitFor(() => {
			expect(result.current.articles).toHaveLength(mockArticles.length); // Wait for length update

			// Also verify content within waitFor
			const newerArticle = result.current.articles.find((a) => a._id === "1");
			expect(newerArticle).toBeDefined();
			expect(newerArticle?.version).toBe(2);
			expect(newerArticle?.title).toBe("Article 1 Updated");
		});

		// No need for assertions outside waitFor now
	});
});

// --- Tests for Handling Invalid Cloud Data ---
describe("Handling Invalid Cloud Data", () => {
	it("should log warning and skip saving cloud article missing content", async () => {
		const invalidCloudArticle = {
			...baseMockArticle("invalid-1", 1, 3000),
			content: undefined, // Missing content
		};
		mockFetchCloudItems.mockResolvedValue([invalidCloudArticle]);
		mockGetAllArticles.mockResolvedValue([]); // No local articles initially

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		// Check that the warning was logged
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				`Sync Hook: Invalid or incomplete article data received from cloud for ID: ${invalidCloudArticle._id}. Skipping.`,
			),
			expect.objectContaining({ _id: invalidCloudArticle._id }),
		);

		// Check that bulkSaveArticles was NOT called
		expect(mockBulkSaveArticles).not.toHaveBeenCalled();
		expect(result.current.articles).toEqual([]); // No articles should be added

		consoleWarnSpy.mockRestore();
	});

	it("should log warning and skip saving cloud article missing title", async () => {
		const invalidCloudArticle = {
			...baseMockArticle("invalid-2", 1, 3000),
			title: undefined as any, // Missing title
		};
		mockFetchCloudItems.mockResolvedValue([invalidCloudArticle]);
		mockGetAllArticles.mockResolvedValue([]);

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				`Sync Hook: Invalid or incomplete article data received from cloud for ID: ${invalidCloudArticle._id}. Skipping.`,
			),
			expect.objectContaining({ _id: invalidCloudArticle._id }),
		);
		expect(mockBulkSaveArticles).not.toHaveBeenCalled();
		expect(result.current.articles).toEqual([]);

		consoleWarnSpy.mockRestore();
	});

	it("should log warning and skip saving cloud article missing url", async () => {
		const invalidCloudArticle = {
			...baseMockArticle("invalid-3", 1, 3000),
			url: undefined as any, // Missing url
		};
		mockFetchCloudItems.mockResolvedValue([invalidCloudArticle]);
		mockGetAllArticles.mockResolvedValue([]);

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				`Sync Hook: Invalid or incomplete article data received from cloud for ID: ${invalidCloudArticle._id}. Skipping.`,
			),
			expect.objectContaining({ _id: invalidCloudArticle._id }),
		);
		expect(mockBulkSaveArticles).not.toHaveBeenCalled();
		expect(result.current.articles).toEqual([]);

		consoleWarnSpy.mockRestore();
	});

	it("should process valid articles even if some invalid articles are received", async () => {
		const validCloudArticle = baseMockArticle("valid-1", 1, 4000);
		const invalidCloudArticle = {
			...baseMockArticle("invalid-4", 1, 3000),
			content: undefined, // Missing content
		};
		mockFetchCloudItems.mockResolvedValue([
			validCloudArticle,
			invalidCloudArticle,
		]);

		// Mock getAllArticles:
		// 1. Initial cache load: Empty
		mockGetAllArticles.mockResolvedValueOnce([]);
		// 2. Reconciliation fetch (includes deleted): Empty
		mockGetAllArticles.mockResolvedValueOnce([]);
		// 3. Final fetch for UI update (non-deleted): Returns the saved valid article
		mockGetAllArticles.mockResolvedValue([validCloudArticle]);

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		// Check warning for the invalid one
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				`Sync Hook: Invalid or incomplete article data received from cloud for ID: ${invalidCloudArticle._id}. Skipping.`,
			),
			expect.objectContaining({ _id: invalidCloudArticle._id }),
		);

		// Check bulkSave was called ONLY with the valid one
		expect(mockBulkSaveArticles).toHaveBeenCalledTimes(1);
		expect(mockBulkSaveArticles).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: validCloudArticle._id }),
			]),
		);
		expect(mockBulkSaveArticles).not.toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: invalidCloudArticle._id }),
			]),
		);

		// Check final state contains only the valid article
		expect(result.current.articles).toHaveLength(1);
		expect(result.current.articles[0]._id).toBe(validCloudArticle._id);

		consoleWarnSpy.mockRestore();
	});

	it("should skip invalid cloud UPDATE", async () => {
		// Reset mockBulkSaveArticles to ensure it's clean for this test
		mockBulkSaveArticles.mockReset();

		const localArticle = baseMockArticle("valid-1", 1, 3000);
		const invalidCloudUpdate = {
			...baseMockArticle("valid-1", 2, 4000, " Invalid Update"),
			content: undefined, // Missing content
		};
		mockGetAllArticles.mockResolvedValueOnce([localArticle]); // Initial
		mockGetAllArticles.mockResolvedValueOnce([localArticle]); // Reconciliation
		mockGetAllArticles.mockResolvedValue([localArticle]); // Final
		mockFetchCloudItems.mockResolvedValue([invalidCloudUpdate]);

		// Mock the bulkSaveArticles function to track what it's called with
		const bulkSaveSpy = vi.fn();
		mockBulkSaveArticles.mockImplementation(bulkSaveSpy);

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"Invalid or incomplete article data received from cloud",
			),
			expect.objectContaining({ _id: "valid-1" }),
		);
		// Check that bulkSaveSpy was not called with the invalid article
		expect(bulkSaveSpy).not.toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: "valid-1", content: undefined }),
			]),
		);
		expect(result.current.articles[0].version).toBe(1); // Should retain local version 1

		consoleWarnSpy.mockRestore();
	});

	it("should skip invalid cloud UNDELETE/UPDATE", async () => {
		// Reset all mocks to ensure they're clean for this test
		mockBulkSaveArticles.mockReset();
		mockDeleteItemFromCloud.mockReset();
		mockArticlesDbBulkDocs.mockReset();

		const localDeletedArticle = {
			...baseMockArticle("deleted-1", 1, 3000),
			deletedAt: Date.now(),
			_rev: "rev-deleted-1",
		};
		const invalidCloudUndelete = {
			...baseMockArticle("deleted-1", 2, 4000, " Invalid Undelete"),
			content: undefined, // Missing content
		};
		mockGetAllArticles.mockResolvedValueOnce([]); // Initial
		mockGetAllArticles.mockResolvedValueOnce([localDeletedArticle]); // Reconciliation
		mockGetAllArticles.mockResolvedValue([]); // Final (should remain deleted locally)
		mockFetchCloudItems.mockResolvedValue([invalidCloudUndelete]);

		// Mock the bulkSaveArticles function to track what it's called with
		const bulkSaveSpy = vi.fn();
		mockBulkSaveArticles.mockImplementation(bulkSaveSpy);

		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		const { result } = renderHook(() =>
			useArticleSync(true, new Set<string>()),
		);
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(consoleWarnSpy).toHaveBeenCalledWith(
			expect.stringContaining(
				"Invalid or incomplete article data received from cloud",
			),
			expect.objectContaining({ _id: "deleted-1" }),
		);
		// Check that bulkSaveSpy was not called with the invalid article
		expect(bulkSaveSpy).not.toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({ _id: "deleted-1", content: undefined }),
			]),
		);
		// Should not attempt to re-delete from cloud as local delete is older
		expect(mockDeleteItemFromCloud).not.toHaveBeenCalled();
		// Should not trigger hard delete as cloud version wasn't processed
		expect(mockArticlesDbBulkDocs).not.toHaveBeenCalled();
		expect(result.current.articles).toEqual([]); // Should remain empty (locally soft-deleted)

		consoleWarnSpy.mockRestore();
	});
});
