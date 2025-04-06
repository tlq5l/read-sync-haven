import type { ArticleView } from "@/hooks/useArticleView";
import type { Article, Tag } from "@/services/db";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleProvider, useArticles } from "./ArticleContext";

// --- Mock Data ---
const mockArticle1: Article = {
	_id: "1",
	url: "http://example.com/a",
	title: "Article A",
	content: "...",
	savedAt: 1000,
	status: "inbox",
	isRead: false,
	favorite: false,
	type: "article",
	userId: "user1",
	excerpt: "...",
	tags: [],
	version: 1,
	_rev: "rev-1",
};
const mockArticle2: Article = {
	_id: "2",
	url: "http://example.com/b",
	title: "Article B",
	content: "...",
	savedAt: 2000,
	status: "inbox",
	isRead: true,
	favorite: false,
	type: "article",
	userId: "user1",
	excerpt: "...",
	tags: ["news"],
	version: 1,
	_rev: "rev-2",
};
const mockArticle3: Article = {
	_id: "3",
	url: "http://example.com/c",
	title: "Article C",
	content: "...",
	savedAt: 500,
	status: "inbox",
	isRead: false,
	favorite: true,
	type: "article",
	userId: "user1",
	excerpt: "...",
	tags: ["tech"],
	version: 1,
	_rev: "rev-3",
};

// --- Hoisted Mocks ---
// Hoisted Tags Mock
const { hoistedMockTags, mockGetAllTags } = vi.hoisted(() => {
	const tags: Tag[] = [
		{ _id: "tag:news", name: "news", color: "#ffffff", createdAt: Date.now() },
		{ _id: "tag:tech", name: "tech", color: "#000000", createdAt: Date.now() },
	];
	return {
		hoistedMockTags: tags,
		mockGetAllTags: vi.fn().mockResolvedValue(tags),
	};
});

// Hoisted Mocks for services used BY useArticleSync
const {
	mockGetAllArticles,
	mockFetchCloudItems,
	mockOperationsQueueDbAllDocs,
	// Add other service mocks if needed by tests
} = vi.hoisted(() => ({
	mockGetAllArticles: vi.fn(),
	mockFetchCloudItems: vi.fn(),
	mockOperationsQueueDbAllDocs: vi.fn(),
	// ...initialize other service mocks here
}));

// --- Mocks for Other Hooks and DB Services ---

vi.mock("@/hooks/useDatabaseInit", () => ({
	useDatabaseInit: () => ({ isInitialized: true, dbError: null }), // Assume DB is initialized
}));

vi.mock("@/hooks/useArticleView", () => ({
	// Keep simple view mock
	useArticleView: (initialView: ArticleView) => {
		return { currentView: initialView, setCurrentView: vi.fn() };
	},
}));

// Mock Clerk hooks (keep stable mocks)
const { stableUseAuthResult, stableUseUserResult } = vi.hoisted(() => {
	const _stableGetTokenFn = vi.fn().mockResolvedValue("test-token");
	const _stableAuthResult = {
		userId: "user1",
		isSignedIn: true,
		isLoaded: true,
		getToken: _stableGetTokenFn,
		sessionId: "sid1",
	};
	const _stableUserResult = {
		isLoaded: true,
		isSignedIn: true,
		user: {
			id: "user1",
			primaryEmailAddress: { emailAddress: "user@test.com" },
		},
	};
	return {
		stableGetToken: _stableGetTokenFn,
		stableUseAuthResult: _stableAuthResult,
		stableUseUserResult: _stableUserResult,
	};
});
vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => stableUseAuthResult,
	useUser: () => stableUseUserResult,
}));

// Mock useArticleActions - keep this simple unless testing actions themselves
const mockOptimisticRemove = vi.fn();
// We need a mock refresh function *if* useArticleActions depends on it
// const mockRefreshForActions = vi.fn(); // Removed as unused
vi.mock("@/hooks/useArticleActions", () => ({
	useArticleActions: () => ({
		// removed refresh callback dependency for simplicity here
		addArticleByUrl: vi.fn().mockResolvedValue(null),
		addArticleByFile: vi.fn().mockResolvedValue(null),
		updateArticleStatus: vi.fn().mockResolvedValue(undefined),
		removeArticle: mockOptimisticRemove, // Use specific mock for remove if testing optimistic update
		updateReadingProgress: vi.fn().mockResolvedValue(undefined),
	}),
}));

// Mock DB/Cloud services used by the REAL useArticleSync
vi.mock("@/services/db", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/services/db")>();
	return {
		...actual,
		getAllTags: mockGetAllTags,
		getAllArticles: mockGetAllArticles, // Use hoisted mock
		articlesDb: {
			// Mock PouchDB methods if needed directly
			get: vi.fn(),
			put: vi.fn(),
			remove: vi.fn(),
			bulkDocs: vi.fn().mockResolvedValue([]), // Default mock for bulkDocs
			info: vi.fn().mockResolvedValue({ doc_count: 0 }),
			createIndex: vi.fn().mockResolvedValue({ result: "created" }),
		},
		operationsQueueDb: {
			// Mock queue methods
			allDocs: mockOperationsQueueDbAllDocs, // Use hoisted mock
			bulkDocs: vi.fn().mockResolvedValue([]),
			// Add other queue methods if needed
		},
		// Keep other exports if necessary
	};
});
vi.mock("@/services/cloudSync", () => ({
	fetchCloudItems: mockFetchCloudItems, // Use hoisted mock
	deleteItemFromCloud: vi.fn().mockResolvedValue("success"),
	saveItemToCloud: vi.fn().mockResolvedValue("success"),
}));

vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

// --- Test Component ---
const ArticleConsumer = () => {
	const {
		articles,
		processedArticles,
		isLoading,
		isRefreshing,
		error,
		allTags,
		optimisticRemoveArticle,
		refreshArticles, // Also expose refresh for test trigger if needed
	} = useArticles();
	return (
		<div>
			<div data-testid="loading-state">{isLoading.toString()}</div>
			<div data-testid="refreshing-state">{isRefreshing.toString()}</div>
			<div data-testid="error-state">{error ? error.message : "null"}</div>
			<div data-testid="raw-count">{articles.length}</div>
			<div data-testid="processed-count">{processedArticles.length}</div>
			<ul data-testid="processed-list">
				{processedArticles.map((a) => (
					<li key={a._id}>{a.title}</li>
				))}
			</ul>
			<div data-testid="tag-count">{allTags.length}</div>
			<button type="button" onClick={() => optimisticRemoveArticle("1")}>
				Remove A
			</button>
			{/* Button to trigger refresh within the test */}
			<button type="button" onClick={() => refreshArticles()}>
				Refresh
			</button>
		</div>
	);
};

// --- Tests ---
describe("ArticleContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mocks for services called by useArticleSync
		mockGetAllArticles.mockReset().mockResolvedValue([]); // Default to empty cache
		mockFetchCloudItems.mockReset().mockResolvedValue([]); // Default to empty cloud
		mockOperationsQueueDbAllDocs.mockReset().mockResolvedValue({ rows: [] }); // Default to empty queue
		mockOptimisticRemove.mockReset(); // Reset action mock
	});

	it("should provide initial loading state and then load articles", async () => {
		mockGetAllArticles.mockResolvedValueOnce([mockArticle1, mockArticle2]);
		await act(async () => {
			render(
				<ArticleProvider>
					<ArticleConsumer />
				</ArticleProvider>,
			);
		});
		await waitFor(
			() => {
				expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
			},
			{ timeout: 3000 },
		);
		expect(screen.getByTestId("raw-count")).toHaveTextContent("2");
		expect(screen.getByTestId("processed-count")).toHaveTextContent("2");
		expect(screen.getByText("Article A")).toBeInTheDocument();
		expect(screen.getByText("Article B")).toBeInTheDocument();
	});

	it("should provide fetched tags", async () => {
		await act(async () => {
			render(
				<ArticleProvider>
					<ArticleConsumer />
				</ArticleProvider>,
			);
		});
		await waitFor(
			() => {
				expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
				expect(screen.getByTestId("tag-count")).toHaveTextContent(
					hoistedMockTags.length.toString(),
				);
			},
			{ timeout: 3000 },
		);
	});

	// Reverted this test structure to use render + button click
	it("should reflect refreshing state during refresh", async () => {
		// Initial load setup
		mockGetAllArticles.mockResolvedValueOnce([mockArticle1]);
		mockFetchCloudItems.mockResolvedValueOnce([]);

		await act(async () => {
			render(
				<ArticleProvider>
					<ArticleConsumer />
				</ArticleProvider>,
			);
		});

		// Wait for initial load
		await waitFor(() => {
			expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
			expect(screen.getByTestId("processed-count")).toHaveTextContent("1");
		});
		expect(screen.getByTestId("refreshing-state")).toHaveTextContent("false");

		// Setup mocks for the *refresh* call
		// Reconciliation fetch (includes deleted)
		mockGetAllArticles.mockResolvedValueOnce([mockArticle1]);
		// Cloud fetch (returns new article)
		mockFetchCloudItems.mockResolvedValueOnce([mockArticle2]);
		// Final UI fetch (non-deleted)
		mockGetAllArticles.mockResolvedValueOnce([mockArticle1, mockArticle2]);

		// Find and click the Refresh button inside the consumer
		const refreshButton = screen.getByRole("button", { name: /Refresh/i });
		await act(async () => {
			refreshButton.click();
			// Wait for refreshing to start immediately after click
			await waitFor(() => {
				expect(screen.getByTestId("refreshing-state")).toHaveTextContent(
					"true",
				);
			});
		});

		// Wait for refreshing to complete and state to update
		await waitFor(
			() => {
				expect(screen.getByTestId("refreshing-state")).toHaveTextContent(
					"false",
				);
				expect(screen.getByTestId("processed-count")).toHaveTextContent("2");
			},
			{ timeout: 5000 },
		); // Longer timeout for refresh
	});

	it("should reflect error state from sync", async () => {
		mockGetAllArticles.mockResolvedValueOnce([]);
		const testError = new Error("Sync Failed");
		mockFetchCloudItems.mockRejectedValueOnce(testError);

		await act(async () => {
			render(
				<ArticleProvider>
					<ArticleConsumer />
				</ArticleProvider>,
			);
		});

		await waitFor(
			() => {
				expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
				expect(screen.getByTestId("error-state")).toHaveTextContent(
					"Sync Failed",
				);
			},
			{ timeout: 3000 },
		);
	});

	it("should optimistically hide removed articles from processedArticles", async () => {
		mockGetAllArticles.mockResolvedValueOnce([
			mockArticle1,
			mockArticle2,
			mockArticle3,
		]);
		mockFetchCloudItems.mockResolvedValueOnce([]); // No cloud changes

		await act(async () => {
			render(
				<ArticleProvider>
					<ArticleConsumer />
				</ArticleProvider>,
			);
		});

		await waitFor(() => {
			expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
			expect(screen.getByTestId("processed-count")).toHaveTextContent("3");
		});
		expect(screen.getByText("Article A")).toBeInTheDocument();

		const removeButton = screen.getByRole("button", { name: /Remove A/i });
		await act(async () => {
			removeButton.click();
		});

		expect(mockOptimisticRemove).toHaveBeenCalledWith("1");
		expect(mockOptimisticRemove).toHaveBeenCalledTimes(1);
		// With the real hook, the hiding is internal state, check the *result*
		// The `processedArticles` count *should* decrease visually.
		await waitFor(() => {
			expect(screen.getByTestId("processed-count")).toHaveTextContent("2");
		});
		expect(screen.queryByText("Article A")).not.toBeInTheDocument();
		expect(screen.getByText("Article B")).toBeInTheDocument();
		expect(screen.getByTestId("raw-count")).toHaveTextContent("3"); // Raw count from hook state doesn't change yet
	});
});
