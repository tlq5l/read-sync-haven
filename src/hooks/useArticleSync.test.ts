import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleSync } from "./useArticleSync";

// Import types needed for mocks and tests
import type { Article, QueuedOperation } from "@/services/db";

// --- Mocks Setup ---

// Use vi.hoisted for mocks that need to be available before imports, including Clerk mocks
const {
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
	// Define stable Clerk mocks inside hoisted block
	stableGetToken,
	mockUseAuth,
	mockUseUser,
} = vi.hoisted(() => {
	// Stable mock functions/values for Clerk
	const _stableGetToken = vi.fn().mockResolvedValue("test-token");
	const _mockUseAuth = vi.fn(() => ({
		userId: "test-user-id",
		isSignedIn: true,
		isLoaded: true,
		getToken: _stableGetToken,
		sessionId: "test-session-id",
		actor: null,
		orgId: null,
		orgRole: null,
		orgSlug: null,
		has: vi.fn().mockReturnValue(true),
		signOut: vi.fn(),
	}));
	const _mockUseUser = vi.fn(() => ({
		isLoaded: true,
		isSignedIn: true,
		user: {
			primaryEmailAddress: { emailAddress: "test@example.com" },
			id: "test-user-clerk-id",
			externalId: null,
			primaryEmailAddressId: "test-email-id",
			primaryPhoneNumberId: null,
			primaryWeb3WalletId: null,
			username: null,
			firstName: null,
			lastName: null,
			imageUrl: "",
			hasImage: false,
			banned: false,
			locked: false,
			createdAt: new Date(),
			updatedAt: new Date(),
			phoneNumbers: [],
			web3Wallets: [],
			emailAddresses: [],
			passkeys: [],
			externalAccounts: [],
			organizationMemberships: [],
			sessions: [],
			unsafeMetadata: {},
			publicMetadata: {},
			privateMetadata: {},
			twoFactorEnabled: vi.fn(),
			delete: vi.fn(),
			update: vi.fn(),
			createEmailAddress: vi.fn(),
			createPhoneNumber: vi.fn(),
			createExternalAccount: vi.fn(),
			createWeb3Wallet: vi.fn(),
			createPasskey: vi.fn(),
			isPrimaryEmailAddress: vi.fn(),
			isPrimaryPhoneNumber: vi.fn(),
			isPrimaryWeb3Wallet: vi.fn(),
			setProfileImage: vi.fn(),
			getSessions: vi.fn(),
			getOrganizationMemberships: vi.fn(),
			getOrganizationInvitations: vi.fn(),
			getOrganizationSuggestions: vi.fn(),
			createOrganization: vi.fn(),
			leaveOrganization: vi.fn(),
			getSamlAccounts: vi.fn(),
			removeSamlAccount: vi.fn(),
			experimental__removeFromOrganization: vi.fn(),
			__unstable__getTotpSecrets: vi.fn(),
			path: "",
			getInstance: vi.fn(),
		},
	}));

	return {
		mockGetAllArticles: vi.fn(),
		mockSaveArticle: vi.fn((article) =>
			Promise.resolve({ ...article, _rev: "mock-rev-save" }),
		),
		mockBulkSaveArticles: vi.fn((articles) =>
			Promise.resolve(
				articles.map((a: any) => ({
					ok: true,
					id: a._id,
					rev: `mock-rev-bulk-${a._id}`,
				})),
			),
		),
		mockLocalSoftDeleteArticle: vi.fn().mockResolvedValue(true),
		mockArticlesDbGet: vi.fn(),
		mockArticlesDbPut: vi.fn(),
		mockArticlesDbRemove: vi.fn(),
		mockArticlesDbBulkDocs: vi.fn().mockResolvedValue([]),
		mockOperationsQueueDbGet: vi.fn(),
		mockOperationsQueueDbPut: vi.fn(),
		mockOperationsQueueDbRemove: vi.fn(),
		mockOperationsQueueDbAllDocs: vi.fn(),
		mockOperationsQueueDbBulkDocs: vi.fn().mockResolvedValue([]),
		mockFetchCloudItems: vi.fn(),
		mockDeleteItemFromCloud: vi.fn(),
		mockSaveItemToCloud: vi.fn(),
		stableGetToken: _stableGetToken,
		mockUseAuth: _mockUseAuth,
		mockUseUser: _mockUseUser,
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
	useAuth: mockUseAuth, // Now defined before usage
	useUser: mockUseUser, // Now defined before usage
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
				rev: a._rev || `mock-rev-bulk-${a._id}`,
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

		const { result } = renderHook(() => useArticleSync(true));

		// Wait specifically for the article list to settle with the expected length
		await waitFor(() => expect(result.current.articles.length).toBe(2));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false)); // Wait for sync to finish

		expect(result.current.isLoading).toBe(false);
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

		const { result } = renderHook(() => useArticleSync(true));

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

		const { result } = renderHook(() => useArticleSync(true));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(mockDeleteItemFromCloud).toHaveBeenCalledWith("1");
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

		const { result } = renderHook(() => useArticleSync(true));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(mockOperationsQueueDbAllDocs).toHaveBeenCalled();
		expect(mockDeleteItemFromCloud).toHaveBeenCalledWith("1");
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

		const { result } = renderHook(() => useArticleSync(true));
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

		const { result } = renderHook(() => useArticleSync(true));

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

		const { result } = renderHook(() => useArticleSync(true));
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

		const { result } = renderHook(() => useArticleSync(true));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isRefreshing).toBe(false));

		expect(mockOperationsQueueDbAllDocs).toHaveBeenCalled();
		expect(mockSaveItemToCloud).toHaveBeenCalledWith(localUpdatedArticle);
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
});
