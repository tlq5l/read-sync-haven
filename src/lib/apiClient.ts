// Clerk token retrieval is now handled by passing getToken function as an argument

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
	console.error("VITE_API_BASE_URL is not defined in environment variables.");
	// Optionally throw an error or provide a default, but logging is safer for now
}

type ApiClientOptions = Omit<RequestInit, "headers"> & {
	headers?: Record<string, string>;
};

export class ApiError extends Error {
	status: number;
	body?: unknown; // Store the parsed error body if available

	constructor(message: string, status: number, body?: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
		Object.setPrototypeOf(this, ApiError.prototype); // Maintain prototype chain
	}
}

/**
 * Makes an authenticated API request to the backend.
 * Automatically retrieves the Clerk JWT and adds the Authorization header.
 *
 * @param endpoint The API endpoint path (e.g., '/user/settings')
 * @param options Standard fetch options (method, body, etc.)
 * @returns The parsed JSON response.
 * @throws {ApiError} If the request fails or returns an error status code.
 */
// Define the expected type for the getToken function
type GetTokenFunction = () => Promise<string | null>;

export const apiClient = async <T = unknown>(
	endpoint: string,
	getToken: GetTokenFunction, // Add getToken as a required argument
	options: ApiClientOptions = {},
): Promise<T> => {
	// Authentication check is implicitly handled by getToken presence/success

	let token: string | null = null;
	try {
		token = await getToken(); // Use the passed-in function
		if (!token) {
			// Handle cases where getToken returns null (e.g., logged out user)
			throw new ApiError("User not authenticated or token unavailable", 401);
		}
	} catch (error) {
		console.error("Clerk getToken error:", error);
		// Rethrow as ApiError for consistent handling downstream
		throw new ApiError(
			error instanceof Error
				? error.message
				: "Authentication token retrieval failed",
			error instanceof ApiError ? error.status : 401, // Preserve status if already ApiError
			error instanceof ApiError ? error.body : undefined,
		);
	}

	const url = `${API_BASE_URL?.replace(/\/$/, "")}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

	const headers: HeadersInit = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${token}`,
		...options.headers, // Allow overriding default headers
	};

	// biome-ignore lint/performance/noDelete: Necessary for fetch API
	delete options.headers; // Remove headers from options to avoid conflict

	try {
		const response = await fetch(url, {
			...options,
			headers,
		});

		if (!response.ok) {
			let errorBody: unknown = null;
			try {
				// Attempt to parse error body for more context
				errorBody = await response.json();
			} catch (parseError) {
				// Ignore if body isn't valid JSON or doesn't exist
				console.warn("Could not parse error response body:", parseError);
			}
			throw new ApiError(
				`API request failed: ${response.status} ${response.statusText}`,
				response.status,
				errorBody,
			);
		}

		// Handle cases where the response might be empty (e.g., 204 No Content)
		if (
			response.status === 204 ||
			response.headers.get("Content-Length") === "0"
		) {
			return undefined as T; // Or null, depending on expected return type for empty responses
		}

		return (await response.json()) as T;
	} catch (error) {
		if (error instanceof ApiError) {
			// Re-throw specific API errors
			throw error;
		}
		// Catch network errors or other unexpected issues
		console.error("API Client fetch error:", error);
		throw new ApiError(
			error instanceof Error ? error.message : "Network or unexpected error",
			500, // Default to 500 for unknown errors
			error,
		);
	}
};

// Example Usage (for reference, remove later):
// async function fetchSettings() {
//   try {
//     const settings = await apiClient<{ theme: string }>('/user/settings');
//     console.log('Settings:', settings);
//   } catch (error) {
//     if (error instanceof ApiError) {
//       console.error(`API Error (${error.status}):`, error.message, error.body);
//     } else {
//       console.error('Unexpected error:', error);
//     }
//   }
// }

// async function updateSettings(newSettings: { theme: string }) {
//   try {
//     await apiClient('/user/settings', {
//       method: 'POST',
//       body: JSON.stringify(newSettings),
//     });
//     console.log('Settings updated successfully');
//   } catch (error) {
//      if (error instanceof ApiError) {
//       console.error(`API Error (${error.status}):`, error.message, error.body);
//     } else {
//       console.error('Unexpected error:', error);
//     }
//   }
// }
