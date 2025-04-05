import { render, screen, waitFor } from "@testing-library/react";
import i18n from "i18next";
import {
	I18nextProvider,
	initReactI18next,
	useTranslation,
} from "react-i18next";
import { beforeEach, describe, expect, it } from "vitest";
// Removed unused React import

// Define minimal resources for testing
const resources = {
	en: {
		translation: {
			greeting: "Hello",
			farewell: "Goodbye",
		},
	},
	de: {
		translation: {
			greeting: "Hallo",
			farewell: "Auf Wiedersehen",
		},
	},
};

// Initialize a test-specific i18n instance
// Use createInstance() to avoid interfering with the global singleton from src/lib/i18n.ts
const testI18n = i18n.createInstance();

// Simple component using translations
const TestTranslationComponent = () => {
	const { t } = useTranslation();
	return (
		<div>
			<p data-testid="greeting">{t("greeting")}</p>
			<p data-testid="farewell">{t("farewell")}</p>
		</div>
	);
};

describe("i18n Language Switching", () => {
	beforeEach(async () => {
		// Initialize the test instance before each test
		// Ensure initialization is complete before running tests
		if (!testI18n.isInitialized) {
			await testI18n.use(initReactI18next).init({
				resources,
				lng: "en", // Default language
				fallbackLng: "en",
				interpolation: {
					escapeValue: false, // React already does escaping
				},
				// No backend or detector needed for this test
			});
		} else {
			// If already initialized (e.g., from previous test), just change lang back to default
			await testI18n.changeLanguage("en");
		}
	});

	it("should display initial English translations", () => {
		render(
			<I18nextProvider i18n={testI18n}>
				<TestTranslationComponent />
			</I18nextProvider>,
		);
		expect(screen.getByTestId("greeting")).toHaveTextContent("Hello");
		expect(screen.getByTestId("farewell")).toHaveTextContent("Goodbye");
	});

	it("should switch to German translations when changeLanguage is called", async () => {
		render(
			<I18nextProvider i18n={testI18n}>
				<TestTranslationComponent />
			</I18nextProvider>,
		);

		// Initial check
		expect(screen.getByTestId("greeting")).toHaveTextContent("Hello");

		// Change language
		await testI18n.changeLanguage("de");

		// Wait for the component to re-render with the new language
		// Use findByText which includes waitFor implicitly
		expect(await screen.findByText("Hallo")).toBeInTheDocument();
		expect(screen.getByTestId("greeting")).toHaveTextContent("Hallo");
		expect(screen.getByTestId("farewell")).toHaveTextContent("Auf Wiedersehen");

		// Verify the instance's language property
		expect(testI18n.language).toBe("de");
	});

	it("should fallback to English if trying to switch to an unsupported language with defined resources", async () => {
		render(
			<I18nextProvider i18n={testI18n}>
				<TestTranslationComponent />
			</I18nextProvider>,
		);

		// Initial check
		expect(screen.getByTestId("greeting")).toHaveTextContent("Hello");

		// Change language to unsupported 'fr' (only en/de defined in test resources)
		await testI18n.changeLanguage("fr");

		// It should fallback to 'en' based on fallbackLng
		await waitFor(() => {
			// Text content remains English because 'fr' is missing, falls back to 'en'
			expect(screen.getByTestId("greeting")).toHaveTextContent("Hello");
		});
		expect(screen.getByTestId("farewell")).toHaveTextContent("Goodbye");

		// Verify the instance's language property
		// Note: i18next language might become 'fr', but resolvedLanguage will be 'en'
		expect(testI18n.language).toBe("fr"); // The language set
		expect(testI18n.resolvedLanguage).toBe("en"); // The language used for resources due to fallback
	});
});
