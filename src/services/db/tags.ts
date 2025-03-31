// src/services/db/tags.ts

import { v4 as uuidv4 } from "uuid";
import type { Tag } from "./types";
import { tagsDb } from "./config"; // Import the initialized DB instance
import { executeWithRetry } from "./utils";

/**
 * Saves a new tag or returns an existing tag with the same name.
 * Tag names are treated as unique (case-sensitive).
 *
 * @param name - The name of the tag.
 * @param color - The color for the tag (hex code, default: '#3B82F6').
 * @param userId - Optional user ID if tags are user-specific.
 * @returns The saved or existing tag document.
 * @throws Error if saving fails.
 */
export async function saveTag(
	name: string,
	color = "#3B82F6", // Default Tailwind blue-500
	userId?: string,
): Promise<Tag> {
	return executeWithRetry(async () => {
		// Normalize tag name (e.g., trim whitespace)
		const normalizedName = name.trim();
		if (!normalizedName) {
			throw new Error("Tag name cannot be empty.");
		}

		// Check if tag already exists (case-sensitive check)
		try {
			// Use find for potentially better performance if indexed
			const findSelector: PouchDB.Find.Selector = { name: normalizedName };
			if (userId) {
				findSelector.userId = userId; // Add userId to selector if provided
			}

			const existingTags = await tagsDb.find({ selector: findSelector });

			if (existingTags.docs.length > 0) {
				console.log(
					`Tag "${normalizedName}" already exists with id ${existingTags.docs[0]._id}. Returning existing.`,
				);
				return existingTags.docs[0]; // Return the first match
			}
		} catch (findError) {
			console.warn(
				`Error finding existing tag "${normalizedName}", proceeding with creation:`,
				findError,
			);
			// If find fails (e.g., index not ready), we'll proceed to create,
			// PouchDB's put will handle potential conflicts if the ID happens to exist.
		}

		// Tag doesn't exist, create a new one
		const newTag: Tag = {
			_id: `tag_${uuidv4()}`,
			name: normalizedName,
			color,
			createdAt: Date.now(),
			...(userId && { userId }), // Add userId if provided
		};

		try {
			console.log(`Attempting to save new tag "${normalizedName}"`);
			const response = await tagsDb.put(newTag);

			if (response.ok) {
				console.log(
					`Tag "${normalizedName}" saved successfully with id ${response.id}`,
				);
				return { ...newTag, _rev: response.rev };
			}
			throw new Error(
				`Failed to save tag "${normalizedName}". Response: ${JSON.stringify(
					response,
				)}`,
			);
		} catch (error: any) {
			// Handle potential conflicts during put (e.g., if find failed but ID existed)
			if (error.name === "conflict") {
				console.warn(
					`Conflict saving tag "${normalizedName}". This might indicate a race condition or failed 'find' query. Attempting to fetch existing...`,
				);
				// Attempt to fetch again to return the existing tag
				try {
					const findSelector: PouchDB.Find.Selector = { name: normalizedName };
					if (userId) findSelector.userId = userId;
					const retryFind = await tagsDb.find({ selector: findSelector });
					if (retryFind.docs.length > 0) {
						return retryFind.docs[0];
					}
				} catch (retryFindError) {
					console.error(
						`Error refetching tag "${normalizedName}" after conflict:`,
						retryFindError,
					);
				}
			}
			console.error(`Error saving tag "${normalizedName}":`, error);
			throw error; // Rethrow the original or subsequent error
		}
	});
}

/**
 * Retrieves all tags, optionally filtered by user ID.
 * Uses allDocs and filters in memory for reliability.
 *
 * @param userId - Optional user ID to filter tags.
 * @returns An array of tag documents. Returns empty array on error.
 */
export async function getAllTags(userId?: string): Promise<Tag[]> {
	return executeWithRetry(async () => {
		try {
			console.log(`Getting all tags${userId ? ` for user ${userId}` : ""}`);
			const allTags = await tagsDb.allDocs<Tag>({ include_docs: true });

			let filteredTags = allTags.rows
				.filter((row) => !!row.doc) // Filter out deleted/missing docs
				.map((row) => row.doc as Tag);

			// Filter by userId if provided
			if (userId) {
				filteredTags = filteredTags.filter((tag) => tag.userId === userId);
				console.log(`Found ${filteredTags.length} tags for user ${userId}`);
			} else {
				console.log(`Found ${filteredTags.length} total tags`);
			}

			// Sort tags alphabetically by name (case-insensitive)
			filteredTags.sort((a, b) =>
				a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
			);

			return filteredTags;
		} catch (error) {
			console.error("Error getting all tags:", error);
			return []; // Return empty array on error
		}
	});
}

/**
 * Deletes a tag from the database.
 * Requires the tag's _id and latest _rev.
 * Note: This does not automatically remove the tag ID from associated articles/highlights.
 *
 * @param id - The _id of the tag to delete.
 * @param rev - The latest _rev of the tag to delete.
 * @returns True if deletion was successful, false otherwise.
 * @throws Error if deletion fails (e.g., conflict, document not found).
 */
export async function deleteTag(id: string, rev: string): Promise<boolean> {
	return executeWithRetry(async () => {
		try {
			console.log(`Attempting to delete tag ${id} with rev ${rev}`);
			const response = await tagsDb.remove(id, rev);
			if (response.ok) {
				console.log(`Tag ${id} deleted successfully.`);
				return true;
			}
			console.error(
				`Failed to delete tag ${id}. Response: ${JSON.stringify(response)}`,
			);
			return false; // Should not be reached if remove throws
		} catch (error: any) {
			console.error(`Error deleting tag ${id}:`, error);
			throw error; // Rethrow for the caller
		}
	});
}

/**
 * Updates the name and/or color of an existing tag.
 * Requires the tag's _id and latest _rev.
 *
 * @param tagUpdate - An object containing _id, _rev, and optional new name/color.
 * @returns The updated tag document.
 * @throws Error if update fails.
 */
export async function updateTag(
	tagUpdate: Partial<Pick<Tag, "name" | "color">> & {
		_id: string;
		_rev: string;
	},
): Promise<Tag> {
	return executeWithRetry(async () => {
		try {
			console.log(`Attempting to update tag ${tagUpdate._id}`);
			const existingTag = await tagsDb.get(tagUpdate._id, {
				rev: tagUpdate._rev,
			});

			// Prepare update, normalizing name if provided
			const updates: Partial<Tag> = {};
			if (tagUpdate.name !== undefined) {
				const normalizedName = tagUpdate.name.trim();
				if (!normalizedName) throw new Error("Tag name cannot be empty.");
				updates.name = normalizedName;
			}
			if (tagUpdate.color !== undefined) {
				updates.color = tagUpdate.color;
			}

			if (Object.keys(updates).length === 0) {
				console.warn(
					`No updates provided for tag ${tagUpdate._id}. Returning existing.`,
				);
				return existingTag; // No changes needed
			}

			const updatedTag: Tag = {
				...existingTag,
				...updates,
				_id: tagUpdate._id, // Ensure correct ID and Rev
				_rev: tagUpdate._rev,
			};

			const response = await tagsDb.put(updatedTag);

			if (response.ok) {
				console.log(
					`Tag ${updatedTag._id} updated successfully to rev ${response.rev}`,
				);
				return { ...updatedTag, _rev: response.rev };
			}
			throw new Error(
				`Failed to update tag ${updatedTag._id}. Response: ${JSON.stringify(response)}`,
			);
		} catch (error: any) {
			console.error(`Error updating tag ${tagUpdate._id}:`, error);
			if (error.name === "conflict") {
				console.warn(
					`Conflict updating tag ${tagUpdate._id}. Provided _rev may be outdated.`,
				);
			}
			// Consider checking for unique name constraint violation if applicable
			if (
				error.name !== "conflict" &&
				tagUpdate.name &&
				error.message?.includes("unique")
			) {
				console.error(
					`Update failed: Tag name "${tagUpdate.name}" might already exist.`,
				);
			}
			throw error; // Rethrow
		}
	});
}
