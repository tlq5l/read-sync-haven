import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/context/ThemeContext";
import { authClient } from "@/lib/authClient"; // Import authClient
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./HomePage";

// Mock the authClient module
vi.mock("@/lib/authClient", () => ({
	authClient: {
		useSession: vi.fn(),
	},
}));

// Type assertion for mocked methods
const mockUseSession = authClient.useSession as ReturnType<typeof vi.fn>;

// Mock Dropdown components
vi.mock("@/components/ui/dropdown-menu", async () => {
	const actual = await vi.importActual<
		typeof import("@/components/ui/dropdown-menu")
	>("@/components/ui/dropdown-menu");
	return {
		...actual,
		DropdownMenu: ({ children }: { children: React.ReactNode }) => (
			<div>{children}</div>
		),
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

// Constants for mock session data
const MOCK_USER_ID = "test-user-id-123";
const MOCK_USER_NAME = "Testy McTestFace";
const MOCK_SESSION_WITH_NAME = {
	user: { id: MOCK_USER_ID, name: MOCK_USER_NAME },
};
const MOCK_SESSION_WITHOUT_NAME = {
	user: { id: "user-no-name", name: null },
};

describe("HomePage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Default mock: authenticated user with a name
		mockUseSession.mockReturnValue({
			data: MOCK_SESSION_WITH_NAME,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
	});

	it("renders welcome message with user's name", () => {
		renderHomePage();
		// Check for the name defined in MOCK_SESSION_WITH_NAME
		expect(screen.getByText(`Welcome ${MOCK_USER_NAME}`)).toBeInTheDocument();
	});

	it("renders welcome message with 'User' if name is not available in session", () => {
		// Override mock for this test case
		mockUseSession.mockReturnValue({
			data: MOCK_SESSION_WITHOUT_NAME,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
		renderHomePage();
		expect(screen.getByText(/Welcome User/i)).toBeInTheDocument();
	});

	it("renders welcome message with 'User' if session is null (though unlikely if protected)", () => {
		// Override mock for this test case
		mockUseSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
			refetch: vi.fn(),
		});
		renderHomePage();
		expect(screen.getByText(/Welcome User/i)).toBeInTheDocument();
	});

	it("renders the Configure button", () => {
		renderHomePage();
		expect(
			screen.getByRole("button", { name: /Configure/i }),
		).toBeInTheDocument();
	});

	it("shows dropdown items when Configure button is clicked (mocked)", async () => {
		renderHomePage();
		const configureButton = screen.getByRole("button", { name: /Configure/i });
		fireEvent.click(configureButton);

		// Check for mocked dropdown items
		expect(screen.getByText("Option 1")).toBeInTheDocument();
		expect(screen.getByText("Option 2")).toBeInTheDocument();
		expect(screen.getByText("Option 3")).toBeInTheDocument();
	});
});
