import { AnimationProvider } from "@/context/AnimationContext";
import { KeyboardProvider } from "@/context/KeyboardContext"; // Import KeyboardProvider
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
const mockSignOut = vi.fn(async (callback?: () => void) => {
	// Simulate async sign out and then call the optional callback
	await Promise.resolve(); // Simulate async operation
	if (callback) {
		callback();
	}
});
const mockUseAuthDefault = {
	isSignedIn: true, // Default to signed in
	signOut: mockSignOut,
};
const mockUseAuth = vi.fn(() => mockUseAuthDefault); // Default mock values

vi.mock("@clerk/clerk-react", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@clerk/clerk-react")>();
	return {
		...actual, // Keep original exports not explicitly mocked
		useAuth: () => mockUseAuth(), // Use the mock function
		useUser: () => ({ user: { firstName: "Test" } }), // Keep user mock if needed elsewhere
		UserButton: () => <div data-testid="user-button">User Button</div>, // Keep button mock
	};
});

// Mock useArticles hook
const mockSetCurrentView = vi.fn();
const mockSetSelectedCategory = vi.fn(); // Define mock function externally
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
			setSelectedCategory: mockSetSelectedCategory, // Use external mock function
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
	// Icons used in Sidebar and its sub-components
	const iconNames = [
		"Home",
		"Library",
		"Settings",
		"Sun", // Needed for ThemeProvider context? Keep for now.
		"Moon", // Needed for ThemeProvider context? Keep for now.
		"LogIn",
		"LogOut",
		"Plus",
		"SidebarClose",
		"SidebarOpen",
		// Removed unused Chevron and category icons
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

// Mock Animation/Transition Components and Hooks
vi.mock("@/components/ui/transition-group", () => ({
	TransitionGroup: ({
		children,
		className,
	}: { children: React.ReactNode; className?: string }) => (
		<div className={className}>{children}</div>
	),
	TransitionItem: ({
		children,
		className,
	}: { children: React.ReactNode; className?: string }) => (
		<div className={className}>{children}</div>
	),
}));
vi.mock("@/context/AnimationContext", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/context/AnimationContext")>();
	return {
		...actual,
		useAnimation: () => ({
			synchronizeAnimations: (callback: () => void) => callback(), // Simple passthrough
		}),
	};
});
vi.mock("@/hooks/use-synchronized-animation", () => ({
	useSynchronizedAnimation: () => ({
		ref: vi.fn(), // Mock ref
	}),
}));
// Mock KeyboardContext hook
const mockToggleSidebar = vi.fn();
vi.mock("@/context/KeyboardContext", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/context/KeyboardContext")>();
	return {
		...actual,
		useKeyboard: () => ({
			isSidebarCollapsed: false, // Default state
			toggleSidebar: mockToggleSidebar,
			// Mock other returned values if needed by the component/tests
			registerShortcut: vi.fn(),
			unregisterShortcut: vi.fn(),
			triggerShortcut: vi.fn(),
		}),
	};
});

// --- Test Setup ---

// MockProviders WITHOUT KeyboardProvider (as it seems to cause the leak)
// Keep AnimationProvider mocked as well (done earlier)
// useKeyboard hook is mocked above to provide necessary values
const MockProviders = ({ children }: { children: React.ReactNode }) => (
	<MemoryRouter>
		<ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
			{/* AnimationProvider is effectively mocked via useAnimation/useSynchronizedAnimation mocks */}
			{/* KeyboardProvider is removed due to suspected memory leak */}
			{children}
		</ThemeProvider>
	</MemoryRouter>
);

describe("Sidebar Component", () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
		// Reset useAuth mock to default (signed in with signOut function) before each test
		mockUseAuth.mockReturnValue({
			isSignedIn: true,
			signOut: mockSignOut,
		});
		mockSignOut.mockClear(); // Clear calls to signOut
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

	// ----- Library Dropdown Tests Removed -----

	it("renders the Library button, navigates, and resets category on click", () => {
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
		// Check chevrons are NOT present
		expect(
			libraryButton.querySelector('[data-testid="icon-ChevronRight"]'),
		).not.toBeInTheDocument();
		expect(
			libraryButton.querySelector('[data-testid="icon-ChevronDown"]'),
		).not.toBeInTheDocument();

		fireEvent.click(libraryButton);
		// Check category reset
		expect(mockSetSelectedCategory).toHaveBeenCalledWith(null);
		// Check navigation
		expect(mockNavigate).toHaveBeenCalledWith("/library");
		// Check setCurrentView is NOT called (only category buttons did this)
		expect(mockSetCurrentView).not.toHaveBeenCalled();
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

	// Test case for theme toggle button removed as the button was moved to Settings/Appearance page.

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
		mockUseAuth.mockReturnValue({ isSignedIn: false, signOut: mockSignOut }); // Add signOut mock here too

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

	it("renders Sign Out button when signed in", () => {
		// Arrange: Already signed in by default in beforeEach
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);

		// Assert Sign Out button is visible
		const signOutButton = screen.getByRole("button", { name: /sign out/i });
		expect(signOutButton).toBeVisible();
		expect(
			signOutButton.querySelector('[data-testid="icon-LogOut"]'),
		).toBeVisible();

		// Assert Sign In link is NOT visible
		expect(
			screen.queryByRole("link", { name: /sign in/i }),
		).not.toBeInTheDocument();
	});

	it("calls signOut and navigates on Sign Out button click", async () => {
		// Arrange: Already signed in by default
		render(
			<MockProviders>
				<Sidebar />
			</MockProviders>,
		);
		const signOutButton = screen.getByRole("button", { name: /sign out/i });

		// Act
		await act(async () => {
			fireEvent.click(signOutButton);
		});

		// Assert signOut was called (Clerk's signOut is called with a redirect callback)
		expect(mockSignOut).toHaveBeenCalledTimes(1);
		// Check that it was called with a function (the callback)
		expect(mockSignOut).toHaveBeenCalledWith(expect.any(Function));

		// Assert navigation occurred (triggered by the callback inside signOut mock)
		await waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith("/sign-in");
		});
	});

	// Add more tests as needed for collapse/expand etc.
});
