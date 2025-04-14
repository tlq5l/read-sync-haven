import type { ApiConfig } from "@/hooks/useApiConfig"; // Import the type

interface ApiConfiguratorProps {
	apiConfig: ApiConfig | null;
	setApiConfig: (config: ApiConfig | null) => void;
	availableProviders: string[];
}

// Placeholder component
// Prefix unused prop with _ to suppress TS6133
export function ApiConfigurator({
	apiConfig,
	setApiConfig: _setApiConfig,
	availableProviders,
}: ApiConfiguratorProps) {
	console.warn("Using placeholder ApiConfigurator component!");

	return (
		<div>
			<h2>API Configuration (Placeholder)</h2>
			<p>Current Config: {apiConfig ? JSON.stringify(apiConfig) : "None"}</p>
			<p>Available Providers: {availableProviders.join(", ")}</p>
			{/* Add basic controls if needed for testing */}
		</div>
	);
}
