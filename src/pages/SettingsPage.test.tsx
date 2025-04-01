/// <reference types="@testing-library/jest-dom" />

// src/pages/SettingsPage.test.tsx

import { ThemeProvider } from "@/context/ThemeContext";
import SettingsPage from "@/pages/SettingsPage";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ---

// Mock useArticleActions
const mockRemoveDuplicateLocalArticles = vi.fn();
vi.mock("@/hooks/useArticleActions", () => ({
	useArticleActions: () => ({
		removeDuplicateLocalArticles: mockRemoveDuplicateLocalArticles,
		// Mock other actions if needed by the component, otherwise omit
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

// Mock Clerk useAuth
vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => ({
		userId: "test-user-id",
		isSignedIn: true,
	}),
	// Mock other Clerk components/hooks used if necessary
	UserProfile: () => <div>Mock User Profile</div>,
}));

// Mock child components that might be heavy or irrelevant
vi.mock("@/components/UserProfileSection", () => ({
	default: () => <div>Mock User Profile Section</div>,
}));
vi.mock("@/components/keyboard-shortcuts-tab", () => ({
	KeyboardShortcutsTab: () => <div>Mock Shortcuts Tab</div>,
}));

// Mock DB interactions for export (optional, but good practice)
vi.mock("@/services/db", async (importOriginal) => {
	const original = await importOriginal<typeof import("@/services/db")>();
	return {
		...original,
		articlesDb: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
		highlightsDb: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
		tagsDb: { allDocs: vi.fn().mockResolvedValue({ rows: [] }) },
	};
});

// --- Test Suite ---

describe("SettingsPage", () => {
	beforeEach(() => {
		// Reset mocks before each test
		mockRemoveDuplicateLocalArticles.mockClear();
		// Mock window.URL.createObjectURL and revokeObjectURL for export test
		global.URL.createObjectURL = vi.fn(() => "mock-url");
		global.URL.revokeObjectURL = vi.fn();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks(); // Restore original implementations
	});

	const renderComponent = () => {
		render(
			<BrowserRouter>
				<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
					<SettingsPage />
				</ThemeProvider>
			</BrowserRouter>,
		);
	};

	it("should render the 'Remove Local Duplicates' button in the Data tab", async () => {
		renderComponent();

		// Find and click the Data tab
		const dataTab = screen.getByRole("tab", { name: /data/i });
		fireEvent.click(dataTab);

		// Wait for the button to be visible within the Data tab content
		const removeButton = await screen.findByRole("button", {
			name: /remove local duplicates/i,
		});
		expect(removeButton).toBeInTheDocument();
	});

	it("should call removeDuplicateLocalArticles when the button is clicked", async () => {
		renderComponent();

		// Find and click the Data tab
		const dataTab = screen.getByRole("tab", { name: /data/i });
		fireEvent.click(dataTab);

		// Find and click the button
		const removeButton = await screen.findByRole("button", {
			name: /remove local duplicates/i,
		});
		fireEvent.click(removeButton);

		// Check if the hook function was called
		expect(mockRemoveDuplicateLocalArticles).toHaveBeenCalledTimes(1);

		// Optional: Check for loading state (button text changes to "Cleaning...")
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /cleaning.../i }),
			).toBeInTheDocument();
		});

		// Optional: Wait for the mock promise to resolve (if it were async) and check button text reverts
		// await waitFor(() => {
		//     expect(screen.getByRole("button", { name: /remove local duplicates/i })).toBeInTheDocument();
		// });
	});

	// Add more tests for other settings sections (export, appearance, etc.) if needed
});
