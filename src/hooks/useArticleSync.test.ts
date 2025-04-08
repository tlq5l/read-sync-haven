import type { Article } from "@/services/db/types"; // Import correct Article type
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useArticleSync } from "./useArticleSync";

// --- Mocks Setup ---

// Keep Clerk mocks as they might still be relevant for user ID etc.
const {
	mockUseAuth,
	mockUseUser,
	stableGetToken,
	stableUseAuthResult,
	stableUseUserResult,
} = vi.hoisted(() => {
	const _stableGetTokenFn = vi.fn().mockResolvedValue("test-token");
	const _stableAuthResult = {
		userId: "test-user-id",
		isSignedIn: true,
		isLoaded: true,
		getToken: _stableGetTokenFn,
		sessionId: "test-session-id",
	};
	const _stableUserObject = {
		primaryEmailAddress: { emailAddress: "test@example.com" },
		id: "test-user-clerk-id",
	};
	const _stableUserResult = {
		isLoaded: true,
		isSignedIn: true,
		user: _stableUserObject,
	};
	const _mockUseAuthFn = vi.fn(() => _stableAuthResult);
	const _mockUseUserFn = vi.fn(() => _stableUserResult);
	return {
		mockUseAuth: _mockUseAuthFn,
		mockUseUser: _mockUseUserFn,
		stableGetToken: _stableGetTokenFn,
		stableUseAuthResult: _stableAuthResult,
		stableUseUserResult: _stableUserResult,
	};
});

// Mock Clerk
vi.mock("@clerk/clerk-react", () => ({
	useAuth: mockUseAuth,
	useUser: mockUseUser,
}));

// Keep Toast mock (might be used for error reporting)
const mockToastFn = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ toast: mockToastFn }),
}));

// Hoist the Dexie mock variables and definition - NEW
const { mockArticlesTable, mockDbData } = vi.hoisted(() => {
	const _mockDbData: Article[] = []; // In-memory store for articles
	const _mockArticlesTable = {
		// Core Methods
		toArray: vi.fn(async () => structuredClone(mockDbData)), // Return copy
		bulkPut: vi.fn(
			async (items: Article[], keys?: any, options?: { allKeys: boolean }) => {
				const addedIds: string[] = [];
				for (const item of items) {
					if (!item._id)
						throw new Error("Mock Dexie Error: Article must have an _id"); // Check for _id
					const index = mockDbData.findIndex(
						(dbItem) => dbItem._id === item._id,
					); // Use _id for findIndex
					const newItem = structuredClone(item); // Store copy
					if (index !== -1) {
						mockDbData[index] = newItem; // Update
					} else {
						mockDbData.push(newItem); // Add
					}
					addedIds.push(item._id); // Push _id
				}
				// Dexie's bulkPut returns the keys of the added/updated items
				return Promise.resolve(
					options?.allKeys ? addedIds : addedIds[addedIds.length - 1],
				);
			},
		),
		get: vi.fn(async (_id: string) => {
			// Parameter name changed for clarity
			const found = mockDbData.find((item) => item._id === _id); // Use _id for find
			return Promise.resolve(found ? structuredClone(found) : undefined); // Return copy
		}),
		put: vi.fn(async (item: Article, key?: any) => {
			// Use _id
			if (!item._id)
				throw new Error("Mock Dexie Error: Article must have an _id"); // Check for _id
			const index = mockDbData.findIndex((dbItem) => dbItem._id === item._id); // Use _id for findIndex
			const newItem = structuredClone(item); // Store copy
			if (index !== -1) {
				mockDbData[index] = newItem; // Update
			} else {
				mockDbData.push(newItem); // Add
			}
			return Promise.resolve(item._id); // Return _id
		}),
		delete: vi.fn(async (_id: string) => {
			// Parameter name changed for clarity
			const initialLength = _mockDbData.length; // Use internal variable
			// Filter in place: Find index and splice
			const indexToRemove = _mockDbData.findIndex((item) => item._id === _id); // Use internal variable
			if (indexToRemove !== -1) {
				_mockDbData.splice(indexToRemove, 1); // Modify internal array
			}
			return Promise.resolve(initialLength - mockDbData.length); // Dexie delete returns count of deleted items (0 or 1)
		}),
		// Querying Methods (add more as needed by useArticleSync)
		where: vi.fn((index: string) => ({
			equals: vi.fn((value: any) => ({
				toArray: vi.fn(async () => {
					const results = mockDbData.filter(
						(item) => item[index as keyof Article] === value,
					);
					return Promise.resolve(structuredClone(results)); // Return copy
				}),
				// Add other chainable methods if needed (e.g., modify, delete)
			})),
			// Add other comparison methods if needed (e.g., above, below, anyOf)
		})),
		// Utility methods
		clear: vi.fn(async () => {
			_mockDbData.length = 0; // Clear internal array in place
			return Promise.resolve();
		}),
		orderBy: vi.fn((index: string) => ({
			// Basic orderBy mock
			reverse: vi.fn(() => ({
				toArray: vi.fn(async () => {
					const sorted = [...mockDbData].sort((a, b) => {
						// Add undefined checks for sorting
						const valA = a[index as keyof Article];
						const valB = b[index as keyof Article];
						if (valA === undefined && valB === undefined) return 0;
						if (valA === undefined) return 1; // undefined sorts last in reverse
						if (valB === undefined) return -1;
						if (valA < valB) return 1;
						if (valA > valB) return -1;
						return 0;
					});
					return Promise.resolve(structuredClone(sorted)); // Return copy
				}),
			})),
			toArray: vi.fn(async () => {
				const sorted = [...mockDbData].sort((a, b) => {
					// Add undefined checks for sorting
					const valA = a[index as keyof Article];
					const valB = b[index as keyof Article];
					if (valA === undefined && valB === undefined) return 0;
					if (valA === undefined) return 1; // undefined sorts last
					if (valB === undefined) return -1;
					if (valA < valB) return -1;
					if (valA > valB) return 1;
					return 0;
				});
				return Promise.resolve(structuredClone(sorted)); // Return copy
			}),
		})),
		filter: vi.fn((filterFn: (article: Article) => boolean) => ({
			// Basic filter mock
			toArray: vi.fn(async () => {
				const filtered = mockDbData.filter(filterFn);
				return Promise.resolve(structuredClone(filtered)); // Return copy
			}),
		})),
		// Add other methods used by the hook (e.g., count, update)
	};
	return { mockArticlesTable: _mockArticlesTable, mockDbData: _mockDbData };
});

// Mock the specific db instance exported from dexie.ts
vi.mock("@/services/db/dexie", () => ({
	db: {
		articles: mockArticlesTable, // Use the hoisted mock
		// Mock other tables (e.g., readingProgress) if useArticleSync uses them
	},
}));

// Mock articleUtils if still used (assuming filterAndSortArticles might be)
const mockFilterAndSortArticles = vi.fn((articles: Article[], view: string) => {
	// Simple pass-through or basic filtering for testing purposes
	if (view === "unread") return articles.filter((a: Article) => !a.isRead);
	if (view === "favorites") return articles.filter((a: Article) => a.favorite);
	return articles;
});
vi.mock("@/lib/articleUtils", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/articleUtils")>();
	return {
		...actual, // Keep other utils if they exist and are needed
		filterAndSortArticles: mockFilterAndSortArticles,
		// Mock other functions from articleUtils if they are used by useArticleSync
	};
});

// --- Test Data ---
// Updated baseMockArticle to use 'id' and remove '_rev', '_id'
const baseMockArticle = (
	id: string,
	savedAt: number,
	titleSuffix = "",
	override: Partial<Article> = {},
): Article => ({
	// Use _id as primary key
	_id: id, // Use _id instead of id
	url: `http://example.com/${id}`,
	title: `Article ${id}${titleSuffix}`,
	content: `Content ${id}`,
	savedAt: savedAt,
	status: "inbox",
	isRead: false,
	favorite: false,
	userId: "test-user-id", // Assuming userId is still relevant
	excerpt: `Excerpt ${id}`,
	tags: [],
	// Removed createdAt/updatedAt as they are not in Article type, savedAt covers this
	readingProgress: 0,
	// wordCount: 100, // Removed as it's not in Article type
	coverImage: undefined, // Match type: string | undefined
	// annotations: [], // Removed as it's not in Article type
	htmlContent: `<p>Content ${id}</p>`,
	author: `Author ${id}`,
	summary: null,
	...override,
});

const initialMockArticles: Article[] = [
	baseMockArticle("1", 1000),
	baseMockArticle("2", 2000, "", { isRead: true }),
	baseMockArticle("3", 1500, " Favorite", { favorite: true }),
];

// --- Tests ---
describe("useArticleSync (Dexie)", () => {
	beforeEach(() => {
		// Clear all general mocks
		vi.clearAllMocks();

		// Reset Dexie mock data and function calls
		mockDbData.length = 0; // Clear the hoisted array in place
		// Reset call history and restore default implementations where needed
		for (const mockFn of Object.values(mockArticlesTable)) {
			if (vi.isMockFunction(mockFn)) {
				mockFn.mockClear();
			} else if (typeof mockFn === "object" && mockFn !== null) {
				// Handle nested mocks like 'where', 'orderBy'
				for (const nestedMock of Object.values(mockFn)) {
					if (vi.isMockFunction(nestedMock)) {
						nestedMock.mockClear();
					} else if (typeof nestedMock === "object" && nestedMock !== null) {
						for (const deepMock of Object.values(nestedMock)) {
							if (vi.isMockFunction(deepMock)) deepMock.mockClear();
							// Reset deeper mocks if necessary
							if (deepMock?.toArray && vi.isMockFunction(deepMock.toArray))
								deepMock.toArray.mockClear();
							if (deepMock?.reverse && vi.isMockFunction(deepMock.reverse))
								deepMock.reverse.mockClear();
							if (deepMock?.equals && vi.isMockFunction(deepMock.equals))
								deepMock.equals.mockClear();
						}
					}
				}
			}
		}

		// Reset Clerk mocks (good practice)
		mockUseAuth.mockClear();
		mockUseUser.mockClear();
		stableGetToken.mockReset().mockResolvedValue("test-token"); // Restore default

		// Reset other mocks
		mockToastFn.mockClear();
		mockFilterAndSortArticles
			.mockClear()
			.mockImplementation((articles: Article[], view: string) => {
				if (view === "unread")
					return articles.filter((a: Article) => !a.isRead);
				if (view === "favorites")
					return articles.filter((a: Article) => a.favorite);
				return articles;
			});

		// Set default Dexie mock implementations *after* clearing
		mockArticlesTable.toArray.mockImplementation(
			async () => structuredClone(mockDbData), // Use hoisted array
		);
		mockArticlesTable.get.mockImplementation(async (id: string) => {
			const found = mockDbData.find((item) => item._id === id); // Use hoisted array
			return Promise.resolve(found ? structuredClone(found) : undefined);
		});
		mockArticlesTable.where.mockImplementation((index: string) => ({
			equals: vi.fn((value: any) => ({
				toArray: vi.fn(async () => {
					const results = mockDbData.filter(
						// Use hoisted array
						(item) => item[index as keyof Article] === value,
					);
					return Promise.resolve(structuredClone(results));
				}),
			})),
		}));
		mockArticlesTable.orderBy.mockImplementation((index: string) => ({
			reverse: vi.fn(() => ({
				toArray: vi.fn(async () => {
					const sorted = [...mockDbData].sort((a, b) => {
						// Use hoisted array
						// Add undefined checks for sorting
						const valA = a[index as keyof Article];
						const valB = b[index as keyof Article];
						if (valA === undefined && valB === undefined) return 0;
						if (valA === undefined) return 1; // undefined sorts last in reverse
						if (valB === undefined) return -1;
						if (valA < valB) return 1;
						if (valA > valB) return -1;
						return 0;
					});
					return Promise.resolve(structuredClone(sorted)); // Return copy
				}),
			})),
			toArray: vi.fn(async () => {
				const sorted = [...mockDbData].sort((a, b) => {
					// Use hoisted array
					// Add undefined checks for sorting
					const valA = a[index as keyof Article];
					const valB = b[index as keyof Article];
					if (valA === undefined && valB === undefined) return 0;
					if (valA === undefined) return 1; // undefined sorts last
					if (valB === undefined) return -1;
					if (valA < valB) return -1;
					if (valA > valB) return 1;
					return 0;
				});
				return Promise.resolve(structuredClone(sorted)); // Return copy
			}),
		}));
		mockArticlesTable.filter.mockImplementation(
			(filterFn: (article: Article) => boolean) => ({
				toArray: vi.fn(async () => {
					const filtered = mockDbData.filter(filterFn); // Use hoisted array
					return Promise.resolve(structuredClone(filtered)); // Return copy
				}),
			}),
		);
	});

	afterEach(() => {
		cleanup(); // Testing-library cleanup
	});

	it("should load initial articles from Dexie on mount", async () => {
		// Arrange: Populate mock DB before rendering
		mockDbData.length = 0; // Clear hoisted array
		mockDbData.push(...initialMockArticles); // Add to hoisted array

		// Act: Render the hook
		const { result } = renderHook(() => useArticleSync(true)); // Remove second argument

		// Assert: Loading state updates and articles are loaded
		expect(result.current.isLoading).toBe(true);
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(mockArticlesTable.toArray).toHaveBeenCalledTimes(1); // Or appropriate Dexie method used for initial load
		expect(result.current.articles).toHaveLength(initialMockArticles.length);
		// Optionally check content equality using expect.objectContaining or toEqual
		expect(result.current.articles).toEqual(
			expect.arrayContaining(
				initialMockArticles.map((a) => expect.objectContaining({ _id: a._id })),
			),
		); // Check _id
	});

	it("should return an empty array if no articles are in Dexie", async () => {
		// Arrange: Ensure mock DB is empty (should be by default from beforeEach)
		mockDbData.length = 0; // Clear hoisted array

		// Act
		const { result } = renderHook(() => useArticleSync(true)); // Remove second argument

		// Assert
		expect(result.current.isLoading).toBe(true);
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(mockArticlesTable.toArray).toHaveBeenCalledTimes(1); // Check Dexie was queried
		expect(result.current.articles).toHaveLength(0);
	});

	// Add more tests based on the NEW logic of useArticleSync with Dexie.
	// Examples:
	// - Testing manual refresh logic (if exists)
	// - Testing how it handles Dexie errors (e.g., mock a method to throw)
	// - Testing interaction with filters or views (if filterAndSortArticles is used)
	// - Testing interaction with other hooks or context if applicable

	it("should reflect updates made directly to Dexie if hook uses live queries (or re-fetches)", async () => {
		// Arrange: Start with initial data
		mockDbData.length = 0; // Clear hoisted array
		mockDbData.push(baseMockArticle("1", 1000)); // Add to hoisted array
		const { result, rerender } = renderHook(() => useArticleSync(true)); // Remove second argument
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.articles).toHaveLength(1);

		// Act: Simulate an external update to Dexie
		const newArticle = baseMockArticle("2", 2000);
		act(() => {
			mockDbData.push(newArticle); // Add to hoisted array
			// If useArticleSync doesn't use liveQuery, you might need to trigger a refresh mechanism here
			// e.g., result.current.refreshArticles(); or simulate dependency change causing re-render
			// For simplicity, let's assume a simple re-fetch on re-render or manual trigger
			mockArticlesTable.toArray.mockResolvedValueOnce(
				structuredClone(mockDbData), // Use hoisted array
			); // Mock next fetch
		});

		// Manually trigger a refresh if the hook provides it
		if (result.current.refreshArticles) {
			await act(async () => {
				await result.current.refreshArticles();
			});
		} else {
			// Or rerender if it refetches on rerender (less common for sync hooks)
			rerender();
		}

		// Assert: Hook state reflects the change
		await waitFor(() => {
			expect(result.current.articles).toHaveLength(2);
			expect(result.current.articles.find((a) => a._id === "2")).toBeDefined(); // Use _id
		});
		expect(mockArticlesTable.toArray).toHaveBeenCalledTimes(2); // Initial + Refresh/Rerender
	});

	it("should handle Dexie read errors gracefully", async () => {
		// Arrange: Mock Dexie to throw an error on read
		const testError = new Error("Dexie Read Failed");
		mockArticlesTable.toArray.mockRejectedValueOnce(testError);
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		// Act
		const { result } = renderHook(() => useArticleSync(true)); // Remove second argument

		// Assert
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false); // Should stop loading
			expect(result.current.error).toBeInstanceOf(Error); // Check if error state is set
			expect(result.current.error?.message).toBe("Dexie Read Failed");
		});
		expect(result.current.articles).toHaveLength(0); // Articles should be empty
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Error loading articles"),
			testError,
		);

		consoleErrorSpy.mockRestore();
	});

	// NOTE: The old tests were heavily focused on complex PouchDB<->Cloud sync and
	// reconciliation logic (conflicts, offline queue). These are likely NOT relevant
	// anymore as Dexie is local-first. New tests should focus on the hook's interaction
	// with the LOCAL Dexie database. If there's separate sync logic *outside* this
	// hook that interacts with a cloud service and Dexie, that needs its own tests.
	// The tests for deduplication and handling invalid data might still be relevant
	// if the hook performs these checks on data *before* storing it in Dexie,
	// but the implementation would be different.
});
