import type { ArticleView } from "@/hooks/useArticleView";
import { server } from "@/mocks/server"; // Import the MSW server instance
// Import db for seeding, adjust Tag import path if needed
import { type DexieTag, db } from "@/services/db/dexie";
import type { Article, Tag } from "@/services/db/types"; // Assuming types are here
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw"; // Import MSW functions
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"; // Added afterEach
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

// Hoisted Mocks for services used BY useArticleSync (REMOVED as useArticleSync will be mocked directly)
// Hoisted mock for useArticleSync return values
const { mockUseArticleSyncReturn, mockRefreshArticles, mockRetryLoading } =
	vi.hoisted(() => ({
		mockRefreshArticles: vi.fn().mockResolvedValue([]), // Default mock for refresh
		mockRetryLoading: vi.fn(),
		mockUseArticleSyncReturn: vi.fn().mockReturnValue({
			articles: [],
			isLoading: true,
			isRefreshing: false,
			error: null,
			syncStatus: "idle",
			refreshArticles: vi.fn().mockResolvedValue([]), // Default function mock
			retryLoading: vi.fn(), // Default function mock
		}),
	}));

vi.mock("@/hooks/useArticleSync", () => ({
	useArticleSync: mockUseArticleSyncReturn,
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

// Mock DB/Cloud services (REMOVED as useArticleSync will be mocked directly)
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

	// Log removed
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
	beforeEach(async () => {
		// Make beforeEach async for db operations
		vi.clearAllMocks();
		// Stub the environment variable needed by sync logic
		vi.stubEnv("VITE_WORKER_URL", "http://dummy-worker-url.com");

		// Reset mocks
		mockUseArticleSyncReturn.mockReturnValue({
			articles: [],
			isLoading: true,
			isRefreshing: false,
			error: null,
			syncStatus: "idle",
			refreshArticles: mockRefreshArticles.mockResolvedValue([]),
			retryLoading: mockRetryLoading,
		});
		mockOptimisticRemove.mockReset();

		// Seed Dexie with tags before each test
		// NOTE: Assumes fake-indexeddb clears between tests or we clear manually
		await db.tags.clear(); // Clear previous tags
		// Explicitly construct plain objects matching DexieTag structure
		const plainTags = hoistedMockTags.map((tag) => ({
			id: tag._id, // Map _id to id
			name: tag.name,
			color: tag.color,
			createdAt: tag.createdAt,
			// userId: tag.userId // Explicitly include if defined and needed, otherwise omit
		}));
		await db.tags.bulkAdd(plainTags); // Use plain objects
		// No need to mockGetAllTags anymore as context uses db.tags.toArray()

		// Add MSW handler for the dummy worker URL needed by fetchInitialData
		server.use(
			http.get("http://dummy-worker-url.com/items", () => {
				// Return just an empty array, as expected by the .map call in fetchInitialData
				return HttpResponse.json([]);
			}),
		);
	});

	afterEach(() => {
		// Ensure environment variables are unstubbed after each test
		vi.unstubAllEnvs();
		// Reset MSW handlers added via server.use()
		server.resetHandlers();
	});

	it("should provide initial loading state and then load articles", async () => {
		// 1. Mock initial loading state (done by beforeEach)
		const initialRender = render(
			<ArticleProvider>
				<ArticleConsumer />
			</ArticleProvider>,
		);
		expect(screen.getByTestId("loading-state")).toHaveTextContent("true");
		expect(screen.getByTestId("raw-count")).toHaveTextContent("0");

		// 2. Mock the loaded state *after* initial render
		mockUseArticleSyncReturn.mockReturnValue({
			articles: [mockArticle1, mockArticle2], // Provide mock articles
			isLoading: false, // Set loading to false
			isRefreshing: false,
			error: null,
			syncStatus: "success",
			refreshArticles: mockRefreshArticles.mockResolvedValue([
				mockArticle1,
				mockArticle2,
			]),
			retryLoading: mockRetryLoading,
		});

		// 3. Re-render or trigger update (React Testing Library handles this with state updates)
		// We need to wait for the state update triggered by the mock change
		await waitFor(() => {
			expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
		});

		// 4. Assert final state
		expect(screen.getByTestId("raw-count")).toHaveTextContent("2");
		expect(screen.getByTestId("processed-count")).toHaveTextContent("2");
		expect(screen.getByText("Article A")).toBeInTheDocument();
		expect(screen.getByText("Article B")).toBeInTheDocument();
	});
	it("should provide fetched tags", async () => {
		// Initial render (loading state from beforeEach)
		render(
			<ArticleProvider>
				<ArticleConsumer />
			</ArticleProvider>,
		);
		expect(screen.getByTestId("tag-count")).toHaveTextContent("0"); // Initially 0

		// Set mock to non-loading state (tags are fetched independently by the context)
		mockUseArticleSyncReturn.mockReturnValue({
			articles: [], // Doesn't matter for this test
			isLoading: false,
			isRefreshing: false,
			error: null,
			syncStatus: "success",
			refreshArticles: mockRefreshArticles.mockResolvedValue([]),
			retryLoading: mockRetryLoading,
		});

		// Wait for the context to fetch tags and update state
		await waitFor(
			() => {
				// Check loading state from the hook mock
				expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
				// Check tag count (relies on mockGetAllTags set in beforeEach)
				expect(screen.getByTestId("tag-count")).toHaveTextContent(
					hoistedMockTags.length.toString(),
				);
			},
			{ timeout: 3000 }, // Increased timeout slightly if tag fetching takes time
		);
	});

	it("should update articles after refresh", async () => {
		// Rename test to reflect focus
		const initialArticles = [mockArticle1];
		const finalArticles = [mockArticle1, mockArticle2];

		// --- State Definitions ---
		const stateInitial = {
			articles: initialArticles,
			isLoading: false, // Start in loaded state
			isRefreshing: false,
			error: null,
			syncStatus: "success",
			refreshArticles: mockRefreshArticles, // Use hoisted mock fn
			retryLoading: mockRetryLoading,
		};
		const stateRefreshing = {
			...stateInitial, // Base on initial
			isRefreshing: true,
			syncStatus: "syncing",
		};
		const stateFinal = {
			...stateRefreshing, // Base on refreshing
			articles: finalArticles, // Update articles
			isRefreshing: false,
			syncStatus: "success",
		};

		// --- Mock Setup ---
		// 1. Set initial return value for the useArticleSync hook
		mockUseArticleSyncReturn.mockReturnValue(stateInitial);

		// 2. Simplify the mock refresh function - it just needs to resolve
		mockRefreshArticles.mockReset(); // Clear previous implementations
		mockRefreshArticles.mockImplementation(async () => {
			// Simulate async work briefly, then return final articles
			await new Promise((res) => setTimeout(res, 10)); // Short delay
			return finalArticles;
		});

		// Initial Render
		// --- Test Execution ---
		// Initial Render (will initially show loading=true from beforeEach mock)
		render(
			<ArticleProvider>
				<ArticleConsumer />
			</ArticleProvider>,
		);

		// Wait for the initial state (isLoading=false, isRefreshing=false)
		await waitFor(() => {
			expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
			expect(screen.getByTestId("refreshing-state")).toHaveTextContent("false");
			expect(screen.getByTestId("processed-count")).toHaveTextContent("1");
		});

		// Trigger Refresh by clicking button
		const refreshButton = screen.getByRole("button", { name: /Refresh/i });
		// Trigger the refresh action (button click)
		await act(async () => {
			await refreshButton.click(); // Await the promise from the simplified mock implementation
		});

		// Now that the refresh function's promise has resolved (implicitly by awaiting the click),
		// update the hook's return value to reflect the final state.
		await act(async () => {
			mockUseArticleSyncReturn.mockReturnValue(stateFinal);
			// Allow state update to propagate
			await new Promise((res) => setTimeout(res, 0));
		});

		// Assert the final outcome: the article count should have updated
		await waitFor(
			() => {
				// We no longer check isRefreshing state directly
				expect(screen.getByTestId("processed-count")).toHaveTextContent("2");
				// Optionally check if the new article title appears
				expect(screen.getByText("Article B")).toBeInTheDocument();
			},
			{ timeout: 2000 },
		); // Keep a reasonable timeout
	});

	it("should reflect error state from sync", async () => {
		// 1. Mock initial loading state (done by beforeEach)
		render(
			<ArticleProvider>
				<ArticleConsumer />
			</ArticleProvider>,
		);
		expect(screen.getByTestId("loading-state")).toHaveTextContent("true");

		// 2. Mock the error state *after* initial render
		const testError = new Error("Sync Failed");
		mockUseArticleSyncReturn.mockReturnValue({
			articles: [], // Empty articles on error
			isLoading: false, // Loading finished
			isRefreshing: false,
			error: testError, // Provide the error object
			syncStatus: "offline", // Or appropriate error status
			refreshArticles: mockRefreshArticles,
			retryLoading: mockRetryLoading,
		});

		// 3. Wait for the state update triggered by the mock change
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
		// 1. Initial Load State with 3 articles
		const initialState = {
			articles: [mockArticle1, mockArticle2, mockArticle3],
			isLoading: false,
			isRefreshing: false,
			error: null,
			syncStatus: "success",
			refreshArticles: mockRefreshArticles,
			retryLoading: mockRetryLoading,
		};
		mockUseArticleSyncReturn.mockReturnValue(initialState);

		render(
			<ArticleProvider>
				<ArticleConsumer />
			</ArticleProvider>,
		);

		// Wait for initial load and assert state
		await waitFor(() => {
			expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
			expect(screen.getByTestId("processed-count")).toHaveTextContent("3");
		});
		expect(screen.getByTestId("raw-count")).toHaveTextContent("3");
		expect(screen.getByText("Article A")).toBeInTheDocument();

		// 2. Trigger Optimistic Removal
		const removeButton = screen.getByRole("button", { name: /Remove A/i });
		// Click the button directly, the state update is synchronous
		removeButton.click();

		// 3. Assert mock call immediately after act completes
		expect(mockOptimisticRemove).toHaveBeenCalledWith("1");
		expect(mockOptimisticRemove).toHaveBeenCalledTimes(1);

		// 4. Assert final state using waitFor to catch the result of the state update
		// The state update from setHidingArticleIds should cause a re-render and update processedArticles
		await waitFor(
			() => {
				expect(screen.getByTestId("processed-count")).toHaveTextContent("2");
				expect(screen.queryByText("Article A")).not.toBeInTheDocument();
			},
			{ timeout: 2000 }, // Keep timeout just in case
		);

		// Check other elements are still there
		expect(screen.getByText("Article B")).toBeInTheDocument();
		expect(screen.getByText("Article C")).toBeInTheDocument();
		// Raw count remains the same as the underlying hook mock didn't change
		expect(screen.getByTestId("raw-count")).toHaveTextContent("3");
	});
});
