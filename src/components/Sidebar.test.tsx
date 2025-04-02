import { AnimationProvider } from "@/context/AnimationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

// Mock Clerk hooks
vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => ({ isSignedIn: true }),
	useUser: () => ({ user: { firstName: "Test" } }),
	UserButton: () => <div data-testid="user-button">User Button</div>,
}));
// Mock useArticles hook
vi.mock("@/context/ArticleContext", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/context/ArticleContext")>();
	return {
		...actual, // Keep other exports like ArticleProvider if needed elsewhere, though not used here
		useArticles: vi.fn(() => ({
			articles: [], // Provide default empty array or mock data if needed
			isLoading: false,
			isRefreshing: false,
			error: null,
			refreshArticles: vi.fn().mockResolvedValue([]),
			retryLoading: vi.fn(),
			currentView: "all", // Default view state
			setCurrentView: vi.fn(), // Mock function
			addArticleByUrl: vi.fn().mockResolvedValue(null),
			addArticleByFile: vi.fn().mockResolvedValue(null),
			updateArticleStatus: vi.fn().mockResolvedValue(undefined),
			removeArticle: vi.fn().mockResolvedValue(undefined),
			updateReadingProgress: vi.fn().mockResolvedValue(undefined),
			isDbInitialized: true, // Assume DB is initialized for Sidebar tests
		})),
	};
});

// Simplified MockProviders without ArticleProvider
const MockProviders = ({ children }: { children: React.ReactNode }) => (
	<MemoryRouter>
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			<AnimationProvider>{children}</AnimationProvider>
		</ThemeProvider>
	</MemoryRouter>
);

describe("Sidebar Component", () => {
	it("should not render the 'Home' navigation link", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);

		// Check if the 'Home' link text is present
		const homeLink = screen.queryByRole("link", { name: /home/i });
		expect(homeLink).not.toBeInTheDocument();

		// Optionally, check if the associated icon (BookOpen) is not present
		// Since the import was removed, this might be redundant, but good for thoroughness
		// We'd need a way to query the icon specifically if it were still potentially rendered
	});

	it("should render other expected navigation links like 'Search' and 'Settings'", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);

		// Removed expectation for "Search" link as it's no longer rendered
		expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
	});

	it("should render article view buttons like 'Home'", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		// The button that sets the view to 'all' has the text "Home"
		expect(screen.getByRole("button", { name: /home/i })).toBeInTheDocument();
	});
});
