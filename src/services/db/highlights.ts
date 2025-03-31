// src/services/db/highlights.ts

import { v4 as uuidv4 } from "uuid";
import { highlightsDb } from "./config"; // Import the initialized DB instance
import type { Highlight } from "./types";
import { executeWithRetry } from "./utils";

/**
 * Saves a new highlight to the database.
 *
 * @param highlightData - The highlight data (excluding _id, _rev, createdAt).
 * @returns The newly created highlight document with its _id, _rev, and createdAt timestamp.
 * @throws Error if saving fails.
 */
export async function saveHighlight(
	highlightData: Omit<Highlight, "_id" | "_rev" | "createdAt">,
): Promise<Highlight> {
	return executeWithRetry(async () => {
		const newHighlight: Highlight = {
			...highlightData,
			_id: `highlight_${uuidv4()}`,
			createdAt: Date.now(),
			tags: highlightData.tags || [], // Ensure tags array exists
		};

		try {
			console.log(
				`Attempting to save new highlight for article ${newHighlight.articleId}`,
			);
			const response = await highlightsDb.put(newHighlight);

			if (response.ok) {
				console.log(
					`Highlight ${response.id} saved successfully with rev ${response.rev}`,
				);
				return { ...newHighlight, _rev: response.rev };
			}
			throw new Error(
				`Failed to save highlight ${newHighlight._id}. Response: ${JSON.stringify(
					response,
				)}`,
			);
		} catch (error) {
			console.error(
				`Error saving highlight for article ${newHighlight.articleId}:`,
				error,
			);
			throw error; // Rethrow for the caller
		}
	});
}

/**
 * Retrieves all highlights associated with a specific article ID.
 * Uses allDocs and filters in memory for reliability.
 *
 * @param articleId - The _id of the article whose highlights are to be retrieved.
 * @returns An array of highlight documents for the given article. Returns empty array on error.
 */
export async function getHighlightsByArticle(
	articleId: string,
): Promise<Highlight[]> {
	return executeWithRetry(async () => {
		try {
			console.log(`Getting highlights for article ${articleId}`);
			// Prefer allDocs for reliability over find with potentially missing indexes
			const allHighlights = await highlightsDb.allDocs<Highlight>({
				include_docs: true,
				// While we could use startkey/endkey if IDs were structured differently,
				// filtering by articleId in memory is safer given potential ID structures.
			});

			const filteredHighlights = allHighlights.rows
				.filter((row) => row.doc && row.doc.articleId === articleId)
				.map((row) => row.doc as Highlight);

			console.log(
				`Found ${filteredHighlights.length} highlights for article ${articleId}`,
			);
			return filteredHighlights;
		} catch (error) {
			console.error(
				`Error getting highlights for article ${articleId}:`,
				error,
			);
			return []; // Return empty array on error
		}
	});
}

/**
 * Updates specific fields of an existing highlight.
 * Requires the highlight's _id and latest _rev.
 *
 * @param highlightUpdate - An object containing the _id, _rev, and fields to update.
 * @returns The fully updated highlight document with the new revision.
 * @throws Error if the update fails (e.g., conflict, document not found).
 */
export async function updateHighlight(
	highlightUpdate: Partial<Highlight> & { _id: string; _rev: string },
): Promise<Highlight> {
	return executeWithRetry(async () => {
		try {
			console.log(`Attempting to update highlight ${highlightUpdate._id}`);
			// Fetch the existing document first to merge onto
			const existingHighlight = await highlightsDb.get(highlightUpdate._id, {
				rev: highlightUpdate._rev,
			});

			// Merge updates
			const updatedHighlight: Highlight = {
				...existingHighlight,
				...highlightUpdate,
				_id: highlightUpdate._id, // Ensure correct ID and Rev are used for put
				_rev: highlightUpdate._rev,
			};

			const response = await highlightsDb.put(updatedHighlight);

			if (response.ok) {
				console.log(
					`Highlight ${updatedHighlight._id} updated successfully to rev ${response.rev}`,
				);
				return { ...updatedHighlight, _rev: response.rev };
			}
			throw new Error(
				`Failed to update highlight ${updatedHighlight._id}. Response: ${JSON.stringify(
					response,
				)}`,
			);
		} catch (error: any) {
			console.error(`Error updating highlight ${highlightUpdate._id}:`, error);
			if (error.name === "conflict") {
				console.warn(
					`Conflict updating highlight ${highlightUpdate._id}. Provided _rev may be outdated.`,
				);
			}
			throw error; // Rethrow for the caller
		}
	});
}

/**
 * Deletes a highlight from the database.
 * Requires the highlight's _id and latest _rev.
 *
 * @param id - The _id of the highlight to delete.
 * @param rev - The latest _rev of the highlight to delete.
 * @returns True if deletion was successful, false otherwise.
 * @throws Error if deletion fails (e.g., conflict, document not found).
 */
export async function deleteHighlight(
	id: string,
	rev: string,
): Promise<boolean> {
	return executeWithRetry(async () => {
		try {
			console.log(`Attempting to delete highlight ${id} with rev ${rev}`);
			const response = await highlightsDb.remove(id, rev);
			if (response.ok) {
				console.log(`Highlight ${id} deleted successfully.`);
				return true;
			}
			console.error(
				`Failed to delete highlight ${id}. Response: ${JSON.stringify(response)}`,
			);
			return false; // Should not be reached if remove throws
		} catch (error: any) {
			console.error(`Error deleting highlight ${id}:`, error);
			throw error; // Rethrow for the caller
		}
	});
}
