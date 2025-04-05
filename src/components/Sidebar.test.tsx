import { AnimationProvider } from "@/context/AnimationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { renderHook } from "@testing-library/react-hooks";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

// --- Mocks ---

// Mock Clerk hooks - Provide a flexible mock setup
const mockUseAuth = vi.fn(() => ({ isSignedIn: true })); // Default to signed in
vi.mock("@clerk/clerk-react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@clerk/clerk-react")>();
	return {
		...actual, // Keep original exports not explicitly mocked
		useAuth: () => mockUseAuth(), // Call the mock function defined outside (simplified)
		useUser: () => ({ user: { firstName: "Test" } }),
		UserButton: () => <div data-testid="user-button">User Button</div>,
	};
});

// Mock useArticles hook
const mockSetCurrentView = vi.fn();
vi.mock("@/context/ArticleContext", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/context/ArticleContext")>();
	return {
		...actual,
		useArticles: vi.fn(() => ({
			articles: [],
			isLoading: false,
			isRefreshing: false,
			error: null,
			refreshArticles: vi.fn().mockResolvedValue([]),
			retryLoading: vi.fn(),
			currentView: "all",
			setCurrentView: mockSetCurrentView, // Use the mock function here
			addArticleByUrl: vi.fn().mockResolvedValue(null),
			addArticleByFile: vi.fn().mockResolvedValue(null),
			updateArticleStatus: vi.fn().mockResolvedValue(undefined),
			removeArticle: vi.fn().mockResolvedValue(undefined),
			updateReadingProgress: vi.fn().mockResolvedValue(undefined),
			isDbInitialized: true,
			filters: {
				// Add filters object
				siteNames: [],
				types: [],
				tags: [],
				searchQuery: "",
				category: null, // Add default category
			},
			setFilters: vi.fn(), // Add mock setter if needed by component/test
			sortCriteria: { field: "savedAt", direction: "desc" }, // Add default sort
			setSortCriteria: vi.fn(), // Add mock setter
			setSortField: vi.fn(),
			toggleSortDirection: vi.fn(),
			setSelectedCategory: vi.fn(), // Add mock setter
		})),
	};
});

// Mock react-router-dom hooks
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return {
		...actual,
		useNavigate: () => mockNavigate,
		useLocation: () => ({ pathname: "/" }), // Mock location, adjust if needed per test
	};
});

// Mock lucide-react icons
vi.mock("lucide-react", async (importOriginal) => {
	const actual = await importOriginal<Record<string, any>>(); // Import as Record
	const mockedIcons: Record<string, React.FC<{ "data-testid"?: string }>> = {}; // Define type for mockedIcons

	// Create simple mock components for icons used in Sidebar
	const iconNames = [
		"Home",
		"Library",
		"Settings",
		"Sun",
		"Moon",
		"LogIn",
		"Plus",
		"ChevronLeft",
		"MenuIcon",
		// Add any other icons used if necessary
	];

	for (const name of iconNames) {
		mockedIcons[name] = (props) => (
			<svg data-testid={`icon-${name}`} {...props} />
		);
	}

	return {
		...actual, // Keep actual exports
		...mockedIcons, // Override specific icons with mocks
	};
});

// --- Test Setup ---

const MockProviders = ({ children }: { children: React.ReactNode }) => (
	<MemoryRouter>
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			<AnimationProvider>{children}</AnimationProvider>
		</ThemeProvider>
	</MemoryRouter>
);

describe("Sidebar Component", () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
		// Reset useAuth mock to default (signed in) before each test
		mockUseAuth.mockReturnValue({ isSignedIn: true });
	});

	it("renders the Home button with Home icon and navigates to '/' on click", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		const homeButton = screen.getByRole("button", { name: /home/i });
		expect(homeButton).toBeInTheDocument();
		// Check for the mocked Home icon within the button
		expect(
			homeButton.querySelector('[data-testid="icon-Home"]'),
		).toBeInTheDocument();

		fireEvent.click(homeButton);
		// setCurrentView *is* called when clicking the Home button
		expect(mockSetCurrentView).toHaveBeenCalledWith("all");
		expect(mockNavigate).toHaveBeenCalledWith("/");
	});

	it("renders the Library button with Library icon and navigates to '/inbox' on click", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		const libraryButton = screen.getByRole("button", { name: /library/i });
		expect(libraryButton).toBeInTheDocument();
		// Check for the mocked Library icon within the button
		expect(
			libraryButton.querySelector('[data-testid="icon-Library"]'),
		).toBeInTheDocument();

		fireEvent.click(libraryButton);
		// setCurrentView is *not* called when clicking the Library button itself
		expect(mockSetCurrentView).not.toHaveBeenCalled();
		expect(mockNavigate).toHaveBeenCalledWith("/inbox");
	});

	it("renders the Settings link visibly", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		// Assert visibility
		expect(screen.getByRole("link", { name: /settings/i })).toBeVisible();
		// Check for Settings icon
		expect(screen.getByTestId("icon-Settings")).toBeVisible();
	});

	it("renders the theme toggle button visibly", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		// Assert visibility
		const themeButton = screen.getByRole("button", {
			name: /light mode|dark mode/i,
		});
		expect(themeButton).toBeVisible();
		// Check for appropriate icon based on default theme (system->light initially)
		expect(themeButton.querySelector('[data-testid="icon-Sun"]')).toBeVisible();
	});

	it("renders Add Content button when signed in", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		expect(
			screen.getByRole("link", { name: /add content/i }),
		).toBeInTheDocument();
		expect(screen.getByTestId("icon-Plus")).toBeInTheDocument();
	});

	it("renders Sign In link visibly when signed out", () => {
		// Arrange: Mock signed out state
		mockUseAuth.mockReturnValue({ isSignedIn: false });

		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);

		// Assert visibility
		expect(screen.getByRole("link", { name: /sign in/i })).toBeVisible();
		expect(screen.getByTestId("icon-LogIn")).toBeVisible();
		// Ensure Add Content is NOT visible
		expect(
			screen.queryByRole("link", { name: /add content/i }),
		).not.toBeInTheDocument();
	});

	// Add more tests as needed for collapse/expand etc.
});
