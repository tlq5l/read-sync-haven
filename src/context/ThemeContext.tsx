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

/**
 * Provides theme context to child components, managing dark, light, and system themes with persistence in localStorage.
 *
 * Wraps its children with a context that supplies the current theme and a setter function. The theme is initialized from localStorage if available and valid, or falls back to the provided default. Updates to the theme are reflected in the document's root element and persisted for future sessions.
 *
 * @param children - React nodes to receive theme context.
 * @param defaultTheme - Theme to use if no valid value is found in localStorage. Defaults to "system".
 * @param storageKey - Key used for storing the theme in localStorage. Defaults to "thinkara-ui-theme".
 */
export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "thinkara-ui-theme", // Key for theme - UPDATED
	...props
}: ThemeProviderProps) {
	const [theme, setTheme] = useState<Theme>(() => {
		try {
			const item = window.localStorage.getItem(storageKey);
			// Ensure item is one of the valid Theme types
			if (item === "light" || item === "dark" || item === "system") {
				return item;
			}
		} catch (e) {
			// Ignore localStorage errors
			console.error("Error reading theme from localStorage", e);
		}
		return defaultTheme;
	});

	// Effect for Theme
	useEffect(() => {
		const root = window.document.documentElement;

		root.classList.remove("light", "dark");

		if (theme === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";
			root.classList.add(systemTheme);
			return; // Early return for system theme
		}

		root.classList.add(theme);
	}, [theme]);

	const value = {
		theme,
		setTheme: (newTheme: Theme) => {
			localStorage.setItem(storageKey, newTheme);
			setTheme(newTheme);
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
