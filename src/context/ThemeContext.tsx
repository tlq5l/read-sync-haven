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
		() => (localStorage.getItem(storageKey) as Theme) || defaultTheme
	);

	useEffect(() => {
		const root = window.document.documentElement;

		// Remove the old theme class
		root.classList.remove("light", "dark");

		if (theme === "system") {
			const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
				.matches
				? "dark"
				: "light";

			root.classList.add(systemTheme);
			return;
		}

		// Add the new theme class
		root.classList.add(theme);
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
	const { setTheme, theme } = useTheme();

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
					event.matches ? "dark" : "light"
				);
			}
		};

		mediaQuery.addEventListener("change", listener);
		return () => mediaQuery.removeEventListener("change", listener);
	}, [theme, setTheme]);

	return null;
}

export const useTheme = () => {
	const context = useContext(ThemeContext);

	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}

	return context;
};
