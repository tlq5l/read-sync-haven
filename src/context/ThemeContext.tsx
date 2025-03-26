import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
	theme: "system",
	setTheme: () => null,
};

const ThemeContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "bondwise-ui-theme",
	...props
}: ThemeProviderProps) {
	const [theme, setTheme] = useState<Theme>(
		() => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
	);

	useEffect(() => {
		const root = window.document.documentElement;

		// Add transition class to enable smooth theme change
		root.classList.add("changing-theme");

		// Remove the old theme class
		root.classList.remove("light", "dark");

		if (theme === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";

			root.classList.add(systemTheme);
		} else {
			// Add the new theme class
			root.classList.add(theme);
		}

		// Remove transition class after animation completes
		const transitionTimeout = setTimeout(() => {
			root.classList.remove("changing-theme");
		}, 500); // Match transition duration in CSS

		return () => clearTimeout(transitionTimeout);
	}, [theme]);

	const value = {
		theme,
		setTheme: (theme: Theme) => {
			localStorage.setItem(storageKey, theme);
			setTheme(theme);
		},
	};

	return (
		<ThemeContext.Provider {...props} value={value}>
			{children}
		</ThemeContext.Provider>
	);
}

// Add system theme change listener
export function ThemeSupport() {
	const { theme } = useTheme();

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		// Initial check
		if (theme === "system") {
			const systemTheme = mediaQuery.matches ? "dark" : "light";
			document.documentElement.classList.remove("light", "dark");
			document.documentElement.classList.add(systemTheme);
		}

		// Add listener for future changes
		const listener = (event: MediaQueryListEvent) => {
			if (theme === "system") {
				document.documentElement.classList.remove("light", "dark");
				document.documentElement.classList.add(
					event.matches ? "dark" : "light",
				);
			}
		};

		mediaQuery.addEventListener("change", listener);
		return () => mediaQuery.removeEventListener("change", listener);
	}, [theme]);

	return null;
}

export const useTheme = () => {
	const context = useContext(ThemeContext);

	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}

	return context;
};
