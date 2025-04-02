import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";
export type TextSize = 1 | 2 | 3 | 4 | 5; // 5 levels, 3 is default

type ThemeProviderProps = {
	children: React.ReactNode;
	defaultTheme?: Theme;
	storageKey?: string;
};

type ThemeProviderState = {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	textSize: TextSize;
	setTextSize: (size: TextSize) => void;
};

const initialState: ThemeProviderState = {
	theme: "system",
	setTheme: () => null,
	textSize: 3, // Default text size
	setTextSize: () => null,
};

const ThemeContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
	children,
	defaultTheme = "system",
	storageKey = "bondwise-ui-theme", // Key for theme
	textSizeStorageKey = "bondwise-ui-text-size", // Key for text size
	defaultTextSize = 3, // Default text size value
	...props
}: ThemeProviderProps & {
	textSizeStorageKey?: string;
	defaultTextSize?: TextSize;
}) {
	const [theme, setTheme] = useState<Theme>(
		() => (localStorage.getItem(storageKey) as Theme) || defaultTheme,
	);
	const [textSize, setTextSizeState] = useState<TextSize>(
		() =>
			(Number(localStorage.getItem(textSizeStorageKey)) as TextSize) ||
			defaultTextSize,
	);

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

	// Effect for Text Size
	useEffect(() => {
		const root = window.document.documentElement;
		// Remove previous size attributes if any (optional, but good practice)
		for (let i = 1; i <= 5; i++) {
			root.removeAttribute(`data-text-size-${i}`); // Example if using multiple attributes
		}
		// Set the current text size attribute
		root.setAttribute("data-text-size", textSize.toString());
	}, [textSize]);

	const value = {
		theme,
		setTheme: (newTheme: Theme) => {
			localStorage.setItem(storageKey, newTheme);
			setTheme(newTheme);
		},
		textSize,
		setTextSize: (size: TextSize) => {
			localStorage.setItem(textSizeStorageKey, size.toString());
			setTextSizeState(size);
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
