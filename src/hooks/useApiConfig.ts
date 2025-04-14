import { useState } from 'react';

export interface ApiConfig {
  apiKey: string | null;
  apiEndpoint: string | null;
  model: string | null;
}

// Placeholder hook
export function useApiConfig() {
  const [apiConfig, setApiConfig] = useState<ApiConfig | null>(null);
  const availableProviders = ['openai', 'custom']; // Example

  console.warn("Using placeholder useApiConfig hook!");

  return {
    apiConfig,
    setApiConfig,
    availableProviders,
  };
}