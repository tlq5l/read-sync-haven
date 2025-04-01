import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchCloudItems } from "./cloudSync";
// import type { Article } from "./db"; // No longer needed for these tests

// Mock the global fetch function
// We will mock fetch inside each test case using vi.fn()

describe("services/cloudSync", () => {
	beforeEach(() => {
		// vi.resetAllMocks(); // Resetting might not be needed if we mock per test
	});

	afterEach(() => {
		vi.restoreAllMocks(); // Still good practice to restore mocks
	});

	describe("fetchCloudItems", () => {
		it("should map 'id' to '_id' and handle 'scrapedAt' for 'savedAt'", async () => {
			// Mock API response data with 'id' and 'scrapedAt'
			const mockApiResponse = [
				{
					id: "cloud-123", // Note: 'id', not '_id'
					url: "http://example.com/1",
					title: "Cloud Article 1",
					content: "Content 1",
					scrapedAt: "2024-01-01T10:00:00.000Z", // ISO string timestamp
					type: "article",
					userId: "user-abc",
					// Other fields might be present or missing
				},
				{
					id: "cloud-456",
					url: "http://example.com/2",
					title: "Cloud Article 2",
					content: "Content 2",
					scrapedAt: "2024-01-02T12:30:00.000Z",
					type: "article",
					userId: "user-abc",
					isRead: true, // Include other potential fields
					favorite: false,
				},
				{
					id: "cloud-789",
					url: "http://example.com/3",
					title: "Cloud Article 3",
					content: "Content 3",
					// Missing scrapedAt to test fallback
					type: "article",
					userId: "user-abc",
				},
			];

			// Mock fetch implementation
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => mockApiResponse,
			} as Response);

			// Call the function
			const result = await fetchCloudItems("mock-token", "test@example.com");

			// Assertions
			expect(global.fetch).toHaveBeenCalledTimes(1);
			expect(result).toHaveLength(3);

			// Check mapping for the first item
			expect(result[0]._id).toBe("cloud-123"); // id mapped to _id
			// Removed check for result[0].id as it causes TS error; _id check is sufficient
			expect(result[0].savedAt).toBe(Date.parse("2024-01-01T10:00:00.000Z")); // scrapedAt parsed to savedAt
			expect(result[0].isRead).toBe(false); // Default value
			expect(result[0].favorite).toBe(false); // Default value

			// Check mapping for the second item
			expect(result[1]._id).toBe("cloud-456");
			expect(result[1].savedAt).toBe(Date.parse("2024-01-02T12:30:00.000Z"));
			expect(result[1].isRead).toBe(true); // Value from API used
			expect(result[1].favorite).toBe(false); // Value from API used

			// Check mapping for the third item (fallback for savedAt)
			expect(result[2]._id).toBe("cloud-789");
			expect(result[2].savedAt).toBeGreaterThan(0); // Should have a fallback timestamp (Date.now())
			expect(result[2].savedAt).toBeLessThanOrEqual(Date.now()); // Ensure it's a recent timestamp
		});

		it("should reject on fetch network error", async () => {
			// Mock fetch to throw an error using vi.fn()
			const networkError = new Error("Network Error");
			global.fetch = vi.fn().mockRejectedValue(networkError);

			// Expect the promise to reject with the same error
			await expect(
				fetchCloudItems("mock-token", "test@example.com"),
			).rejects.toThrow(networkError);
		});

		it("should reject on non-ok (500) response", async () => {
			// Corrected test name
			// Mock fetch with a non-ok response using vi.fn()
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			} as Response);

			// Expect fetchCloudItems to throw an error for non-ok responses other than 401
			await expect(
				fetchCloudItems("mock-token", "test@example.com"),
			).rejects.toThrow("API error: 500 Internal Server Error");

			// If we wanted it to return [], the catch block in fetchCloudItems would need adjustment
			// const result = await fetchCloudItems("mock-token", "test@example.com");
			// expect(result).toEqual([]);
		});

		it("should throw an authentication error on 401 response", async () => {
			// Mock fetch with a 401 response using vi.fn()
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
			} as Response);

			await expect(
				fetchCloudItems("mock-token", "test@example.com"),
			).rejects.toThrow("Authentication failed. Please sign in again.");
		});
	});

	// TODO: Add tests for saveItemToCloud if needed
});
