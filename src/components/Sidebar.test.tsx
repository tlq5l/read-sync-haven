import { AnimationProvider } from "@/context/AnimationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { authClient } from "@/lib/authClient"; // Import authClient
import { fireEvent, render, screen, within } from "@testing-library/react"; // Import within
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "./Sidebar";

// --- Mocks ---

// Mock the authClient module
vi.mock("@/lib/authClient", () => ({
	authClient: {
		useSession: vi.fn(),
		signOut: vi.fn().mockResolvedValue(undefined), // Mock signOut if UserMenu calls it
	},
}));

// Type assertion for mocked methods
const mockUseSession = authClient.useSession as ReturnType<typeof vi.fn>;
// const mockSignOut = authClient.signOut as ReturnType<typeof vi.fn>; // Removed unused mock variable

// Mock useArticles hook (keep existing mock)
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
			setCurrentView: mockSetCurrentView,
			addArticleByUrl: vi.fn().mockResolvedValue(null),
			addArticleByFile: vi.fn().mockResolvedValue(null),
			updateArticleStatus: vi.fn().mockResolvedValue(undefined),
			removeArticle: vi.fn().mockResolvedValue(undefined),
			updateReadingProgress: vi.fn().mockResolvedValue(undefined),
			isDbInitialized: true,
		})),
	};
});

// Mock react-router-dom hooks (keep existing mock)
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-router-dom")>();
	return {
		...actual,
		useNavigate: () => mockNavigate,
		useLocation: () => ({ pathname: "/" }),
	};
});

// Mock lucide-react icons (keep existing mock)
vi.mock("lucide-react", async (importOriginal) => {
	const actual = await importOriginal<Record<string, any>>();
	const mockedIcons: Record<string, React.FC<{ "data-testid"?: string }>> = {};
	const iconNames = [
		"Home",
		"Library",
		"Settings",
		"Sun",
		"Moon",
		"LogIn",
		"LogOut", // Added LogOut
		"Plus",
		"ChevronLeft",
		"MenuIcon",
	];
	for (const name of iconNames) {
		mockedIcons[name] = (props) => (
			<svg data-testid={`icon-${name}`} {...props} />
		);
	}
	return { ...actual, ...mockedIcons };
});

// --- Test Setup ---

const MockProviders = ({ children }: { children: React.ReactNode }) => (
	<MemoryRouter>
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			<AnimationProvider>{children}</AnimationProvider>
		</ThemeProvider>
	</MemoryRouter>
);

// Mock session data
const MOCK_USER_ID = "user-sidebar-test";
const MOCK_USER_NAME = "Sidebar User";
const MOCK_USER_EMAIL = "sidebar@test.com";
const MOCK_SESSION = {
	user: {
		id: MOCK_USER_ID,
		name: MOCK_USER_NAME,
		email: MOCK_USER_EMAIL,
		image: null,
	},
};

describe("Sidebar Component", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default mock: authenticated user
		mockUseSession.mockReturnValue({
			data: MOCK_SESSION,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
	});

	it("renders the Home button with Home icon and navigates to '/' on click", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		const homeButton = screen.getByRole("button", { name: /home/i });
		expect(homeButton).toBeInTheDocument();
		expect(within(homeButton).getByTestId("icon-Home")).toBeInTheDocument(); // Use within
		fireEvent.click(homeButton);
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
		expect(
			within(libraryButton).getByTestId("icon-Library"),
		).toBeInTheDocument();
		fireEvent.click(libraryButton);
		expect(mockSetCurrentView).toHaveBeenCalledWith("all");
		expect(mockNavigate).toHaveBeenCalledWith("/inbox");
	});

	it("renders other expected navigation links like Settings", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		const settingsLink = screen.getByRole("link", { name: /settings/i });
		expect(settingsLink).toBeInTheDocument();
		expect(
			within(settingsLink).getByTestId("icon-Settings"),
		).toBeInTheDocument();
	});

	it("renders theme toggle button", () => {
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		expect(
			screen.getByRole("button", { name: /light mode|dark mode/i }),
		).toBeInTheDocument();
	});

	it("renders Add Content button when signed in", () => {
		// Uses default mock (signed in)
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		const addContentLink = screen.getByRole("link", { name: /add content/i });
		expect(addContentLink).toBeInTheDocument();
		expect(within(addContentLink).getByTestId("icon-Plus")).toBeInTheDocument();
	});

	it("does NOT render Add Content button when signed out", () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		}); // Signed out
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		expect(
			screen.queryByRole("link", { name: /add content/i }),
		).not.toBeInTheDocument();
	});

	it("renders Sign In link when signed out", () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		}); // Signed out
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		const signInLink = screen.getByRole("link", { name: /sign in/i });
		expect(signInLink).toBeInTheDocument();
		expect(within(signInLink).getByTestId("icon-LogIn")).toBeInTheDocument();
	});

	it("does NOT render Sign In link when signed in", () => {
		// Uses default mock (signed in)
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		expect(
			screen.queryByRole("link", { name: /sign in/i }),
		).not.toBeInTheDocument();
	});

	// Test UserMenu rendering (indirectly)
	it("renders UserMenu components when signed in", () => {
		// Uses default mock (signed in)
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		// Check for elements expected within UserMenu (Avatar, Dropdown trigger)
		expect(screen.getByRole("button", { name: "" })).toBeInTheDocument(); // Avatar trigger button usually has no name initially
		// Maybe check for avatar text/image if possible, though it's an implementation detail
	});

	it("does NOT render UserMenu components when signed out", () => {
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		}); // Signed out
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		// Assert that elements expected within UserMenu are not present
		expect(screen.queryByRole("button", { name: "" })).not.toBeInTheDocument();
	});

	// Add more tests as needed for collapse/expand, sign-out interaction etc.
});
