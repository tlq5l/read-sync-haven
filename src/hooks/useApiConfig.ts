import { useState } from "react";

export interface ApiConfig {
	apiKey: string | null;
	apiEndpoint: string | null;
	model: string | null;
}

/**
 * React hook for managing API configuration state and available provider options.
 *
 * @returns An object containing the current {@link ApiConfig} state, a setter to update it, and a list of available provider names.
 *
 * @remark This is a placeholder implementation and may not provide full functionality.
 */
export function useApiConfig() {
	const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
	const availableProviders = ["openai", "custom"]; // Example

	console.warn("Using placeholder useApiConfig hook!");

	return {
		apiConfig,
		setApiConfig,
		availableProviders,
	};
}
