import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpApi from "i18next-http-backend";
import { initReactI18next } from "react-i18next";

// Define supported languages
export const supportedLngs = {
	en: "English",
	vi: "Tiếng Việt",
	de: "Deutsch",
	fr: "Français",
	es: "Español",
};

i18n
	// Load translation using http -> see /public/locales (i.e. https://github.com/i18next/react-i18next/tree/master/example/react/public/locales)
	// Learn more: https://github.com/i18next/i18next-http-backend
	.use(HttpApi)
	// Detect user language
	// Learn more: https://github.com/i18next/i18next-browser-languageDetector
	.use(LanguageDetector)
	// Pass the i18n instance to react-i18next.
	.use(initReactI18next)
	// Init i18next
	// For all options read: https://www.i18next.com/overview/configuration-options
	.init({
		// debug: true, // Uncomment to enable debug output
		supportedLngs: Object.keys(supportedLngs), // Use keys from our definition
		fallbackLng: "en",
		interpolation: {
			escapeValue: false, // Not needed for react as it escapes by default
		},
		detection: {
			// Order and from where user language should be detected
			order: ["localStorage", "navigator", "htmlTag", "path", "subdomain"],
			// Keys or params to lookup language from
			lookupLocalStorage: "i18nextLng",
			// Cache user language on
			caches: ["localStorage"],
			// Optional htmlTag attribute which detects language from html root element
			htmlTag: document.documentElement,
		},
		backend: {
			// Path where resources get loaded from, eg. /locales/en/translation.json
			loadPath: "/locales/{{lng}}/translation.json",
		},
	});

export default i18n;
