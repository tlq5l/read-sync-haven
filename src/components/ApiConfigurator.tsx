import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// Select components are currently unused as provider selection is commented out
// import {
// 	Select,
// 	SelectContent,
// 	SelectItem,
// 	SelectTrigger,
// 	SelectValue,
// } from "@/components/ui/select";
import type { ApiConfig } from "@/hooks/useApiConfig"; // Import the type
import { useEffect, useState } from "react";

interface ApiConfiguratorProps {
	apiConfig: ApiConfig | null;
	setApiConfig: (config: ApiConfig | null) => void;
	// availableProviders: string[]; // Currently unused
}

export function ApiConfigurator({
	apiConfig,
	setApiConfig,
	// availableProviders, // Currently unused
}: ApiConfiguratorProps) {
	// Local state to manage form inputs, initialized from props
	const [localApiKey, setLocalApiKey] = useState<string>(
		apiConfig?.apiKey ?? "",
	);
	const [localApiEndpoint, setLocalApiEndpoint] = useState<string>(
		apiConfig?.apiEndpoint ?? "",
	);
	const [localModel, setLocalModel] = useState<string>(apiConfig?.model ?? "");
	// Assuming the provider is implicitly selected or managed elsewhere for now
	// If provider needs selection, add state and Select component for it.

	// Effect to update local state if the prop changes from outside
	useEffect(() => {
		setLocalApiKey(apiConfig?.apiKey ?? "");
		setLocalApiEndpoint(apiConfig?.apiEndpoint ?? "");
		setLocalModel(apiConfig?.model ?? "");
	}, [apiConfig]);

	const handleSave = () => {
		const newConfig: ApiConfig = {
			apiKey: localApiKey || null,
			apiEndpoint: localApiEndpoint || null,
			model: localModel || null,
		};
		setApiConfig(newConfig);
		// Optionally add feedback like a toast message here
		console.log("API Config saved:", newConfig);
	};

	// Basic implementation assuming a single provider setup for now
	// If multi-provider selection is needed, this needs a Select component
	// for 'availableProviders' and logic to show/hide fields based on provider.

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>AI Provider Settings</CardTitle>
				<CardDescription>Configure your AI provider details.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* If provider selection is needed: */}
				{/*
				<div className="space-y-2">
					<Label htmlFor="provider-select">Provider</Label>
					<Select
						// value={selectedProvider} // Manage this state
						// onValueChange={setSelectedProvider}
					>
						<SelectTrigger id="provider-select">
							<SelectValue placeholder="Select a provider" />
						</SelectTrigger>
						<SelectContent>
							{availableProviders.map((provider) => (
								<SelectItem key={provider} value={provider}>
									{provider}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				*/}
				<div className="space-y-2">
					<Label htmlFor="api-key">API Key</Label>
					<Input
						id="api-key"
						type="password"
						placeholder="Enter your API Key"
						value={localApiKey}
						onChange={(e) => setLocalApiKey(e.target.value)}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="api-endpoint">API Endpoint (Optional)</Label>
					<Input
						id="api-endpoint"
						type="text"
						placeholder="e.g., https://api.openai.com/v1"
						value={localApiEndpoint}
						onChange={(e) => setLocalApiEndpoint(e.target.value)}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="model">Model (Optional)</Label>
					<Input
						id="model"
						type="text"
						placeholder="e.g., gpt-4-turbo"
						value={localModel}
						onChange={(e) => setLocalModel(e.target.value)}
					/>
				</div>
			</CardContent>
			<CardFooter>
				<Button onClick={handleSave} className="w-full">
					Save Settings
				</Button>
			</CardFooter>
		</Card>
	);
}
