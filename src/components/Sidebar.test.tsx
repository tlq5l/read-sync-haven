import { AnimationProvider } from "@/context/AnimationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

// --- Mocks ---

// Mock Clerk hooks
vi.mock("@clerk/clerk-react", () => ({
	useAuth: () => ({ isSignedIn: true }),
	useUser: () => ({ user: { firstName: "Test" } }),
	UserButton: () => <div data-testid="user-button">User Button</div>,
}));

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
			filters: { // Add filters object
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

	it("renders other expected navigation links like Settings", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		expect(screen.getByRole("link", { name: /settings/i })).toBeInTheDocument();
		// Check for Settings icon
		expect(screen.getByTestId("icon-Settings")).toBeInTheDocument();
	});

	it("renders theme toggle button", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		// Check for either Sun or Moon icon depending on default theme mock if needed
		// Or just check for the button role
		expect(
			screen.getByRole("button", { name: /light mode|dark mode/i }),
		).toBeInTheDocument();
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

	// Add more tests as needed for collapse/expand, sign-in state etc.
});
