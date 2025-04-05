import { TooltipProvider } from "@/components/ui/tooltip"; // Import TooltipProvider
import { ThemeProvider } from "@/context/ThemeContext"; // Import ThemeProvider
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"; // Import QueryClientProvider
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
import HomePage from "./HomePage";

// Mock Clerk's useUser hook
vi.mock("@clerk/clerk-react", () => ({
	useUser: vi.fn(),
	useAuth: vi.fn(() => ({ isSignedIn: true })), // Mock useAuth as well if needed by sub-components
}));

const mockUseUser = vi.mocked((await import("@clerk/clerk-react")).useUser);

// Mock Dropdown components if they cause issues in tests
vi.mock("@/components/ui/dropdown-menu", async () => {
	const actual = await vi.importActual<
		typeof import("@/components/ui/dropdown-menu")
	>("@/components/ui/dropdown-menu");
	return {
		...actual,
		DropdownMenu: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		// Render children directly to avoid extra button wrapper
		DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
			<>{children}</>
		),
		DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
		DropdownMenuItem: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
	};
});

const queryClient = new QueryClient();

const renderHomePage = () => {
	return render(
		<MemoryRouter>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider>
					<TooltipProvider>
						<HomePage />
					</TooltipProvider>
				</ThemeProvider>
			</QueryClientProvider>
		</MemoryRouter>,
	);
};

describe("HomePage", () => {
	beforeEach(() => {
		// Reset mocks before each test
		vi.clearAllMocks();
	});

	it("renders welcome message with user's first name", () => {
		mockUseUser.mockReturnValue({
			isLoaded: true,
			isSignedIn: true,
			user: {
				id: "user_123",
				firstName: "Testy",
				lastName: "McTestFace",
				// Add other necessary user properties if needed
			} as any, // Use 'as any' to bypass strict type checking for mock
		});

		renderHomePage();
		expect(screen.getByText(/Welcome Testy/i)).toBeInTheDocument();
	});

	it("renders welcome message with 'User' if first name is not available", () => {
		mockUseUser.mockReturnValue({
			isLoaded: true,
			isSignedIn: true,
			user: { id: "user_456", firstName: null } as any,
		});

		renderHomePage();
		expect(screen.getByText(/Welcome User/i)).toBeInTheDocument();
	});

	it("renders the Configure button", () => {
		mockUseUser.mockReturnValue({
			isLoaded: true,
			isSignedIn: true,
			user: { id: "user_789", firstName: "Config" } as any,
		});

		renderHomePage();
		expect(
			screen.getByRole("button", { name: /Configure/i }),
		).toBeInTheDocument();
	});

	// Basic test for dropdown interaction (can be expanded)
	it("shows dropdown items when Configure button is clicked (mocked)", async () => {
		mockUseUser.mockReturnValue({
			isLoaded: true,
			isSignedIn: true,
			user: { id: "user_abc", firstName: "Dropdown" } as any,
		});

		renderHomePage();
		const configureButton = screen.getByRole("button", { name: /Configure/i });
		fireEvent.click(configureButton);

		// Since dropdown is mocked, we check for the mocked items
		// In a real scenario with unmocked dropdown, you'd wait for items
		expect(screen.getByText("Option 1")).toBeInTheDocument();
		expect(screen.getByText("Option 2")).toBeInTheDocument();
		expect(screen.getByText("Option 3")).toBeInTheDocument();
	});
});
