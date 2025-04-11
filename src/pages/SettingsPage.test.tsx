/// <reference types="@testing-library/jest-dom" />

// src/pages/SettingsPage.test.tsx

import { ThemeProvider } from "@/context/ThemeContext"; // Import real ThemeProvider
import { authClient } from "@/lib/authClient"; // Import authClient
import SettingsPage from "@/pages/SettingsPage";
import { cleanup, fireEvent, render, screen } from "@testing-library/react"; // Add fireEvent import
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

// Mock useArticleActions
const mockRemoveDuplicateLocalArticles = vi.fn();
vi.mock("@/hooks/useArticleActions", () => ({
	useArticleActions: () => ({
		removeDuplicateLocalArticles: mockRemoveDuplicateLocalArticles,
		addArticleByUrl: vi.fn(),
		addArticleByFile: vi.fn(),
		updateArticleStatus: vi.fn(),
		updateReadingProgress: vi.fn(),
		removeArticle: vi.fn(),
	}),
}));

// Mock useToast
vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({
		toast: vi.fn(),
	}),
}));

// Mock the authClient module
vi.mock("@/lib/authClient", () => ({
	authClient: {
		useSession: vi.fn(),
	},
}));

// Type assertion for mocked methods
const mockUseSession = authClient.useSession as ReturnType<typeof vi.fn>;

// Mock child components
vi.mock("@/components/UserProfileSection", () => ({
	default: () => (
		<div data-testid="mock-user-profile-section">Mock User Profile Section</div>
	),
}));
vi.mock("@/components/keyboard-shortcuts-tab", () => ({
	KeyboardShortcutsTab: () => (
		<div data-testid="mock-shortcuts-tab">Mock Shortcuts Tab</div>
	),
}));

// Mock DB interactions (keep existing mock)
vi.mock("@/services/db", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/services/db")>();
	return {
		...original,
		articlesDb: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
		highlightsDb: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
		tagsDb: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
	};
});
// Mock Tabs component (keep existing mock)
vi.mock("@/components/ui/tabs", () => ({
	Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TabsList: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	TabsTrigger: ({
		children,
		...props
	}: { children: React.ReactNode; value: string }) => (
		<button {...props}>{children}</button>
	),
	TabsContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
}));

// --- Test Suite ---

// Mock session data
const MOCK_USER_ID = "settings-user-test";
const MOCK_SESSION = { user: { id: MOCK_USER_ID } };

describe("SettingsPage", () => {
	const originalLocalStorage = window.localStorage;
	let localStorageMock: Record<string, string>;

	beforeEach(() => {
		mockRemoveDuplicateLocalArticles.mockClear();
		// Default mock: authenticated user
		mockUseSession.mockReturnValue({
			data: MOCK_SESSION,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});

		// Mock localStorage
		localStorageMock = {};
		Object.defineProperty(window, "localStorage", {
			value: {
				getItem: vi.fn((key) => localStorageMock[key] || null),
				setItem: vi.fn((key, value) => {
					localStorageMock[key] = value;
				}),
				removeItem: vi.fn((key) => {
					delete localStorageMock[key];
				}),
				clear: vi.fn(() => {
					localStorageMock = {};
				}),
				length: 0,
				key: vi.fn(),
			},
			writable: true,
		});

		// Mock matchMedia
		Object.defineProperty(window, "matchMedia", {
			writable: true,
			value: vi.fn().mockImplementation((query) => ({
				matches: false,
				media: query,
				onchange: null,
				addListener: vi.fn(),
				removeListener: vi.fn(),
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				dispatchEvent: vi.fn(),
			})),
		});

		// Mock window.URL
		global.URL.createObjectURL = vi.fn(() => "mock-url");
		global.URL.revokeObjectURL = vi.fn();
	});

	afterEach(() => {
		Object.defineProperty(window, "localStorage", {
			value: originalLocalStorage,
			writable: true,
		});
		cleanup();
		vi.restoreAllMocks();
	});

	const renderComponent = () => {
		render(
			<BrowserRouter>
				<ThemeProvider>
					<SettingsPage />
				</ThemeProvider>
			</BrowserRouter>,
		);
	};

	it("should render the settings page correctly", () => {
		renderComponent();
		const title = screen.getByText("Settings");
		expect(title).toBeInTheDocument();
		// Check if mocked child components are rendered
		expect(screen.getByTestId("mock-user-profile-section")).toBeInTheDocument();
		expect(screen.getByTestId("mock-shortcuts-tab")).toBeInTheDocument();
	});

	// Test interaction with mocked hook
	it("should call removeDuplicateLocalArticles when the corresponding button is clicked", () => {
		renderComponent();
		// Find the button within the mocked tab content (or however it's structured)
		// Assuming the button exists and is identifiable
		const removeButton = screen.getByRole("button", {
			name: /Remove Duplicate Articles/i,
		});
		fireEvent.click(removeButton);
		expect(mockRemoveDuplicateLocalArticles).toHaveBeenCalledTimes(1);
	});

	// Add more tests for other settings as needed
});
