import i18n from "i18next";
import HttpApi from "i18next-http-backend";
import { initReactI18next } from "react-i18next";
// import LanguageDetector from 'i18next-browser-languagedetector'; // Optional: To detect user language

i18n
	// load translation using http -> see /public/locales
	.use(HttpApi)
	// detect user language
	// learn more: https://github.com/i18next/i18next-browser-languageDetector
	// .use(LanguageDetector) // Uncomment if you want browser language detection
	// pass the i18n instance to react-i18next.
	.use(initReactI18next)
	// init i18next
	// for all options read: https://www.i18next.com/overview/configuration-options
	.init({
		fallbackLng: "en",
		debug: import.meta.env.DEV, // Enable debug logs in development
		interpolation: {
			escapeValue: false, // React already safes from xss
		},
		backend: {
			loadPath: "/locales/{{lng}}/translation.json", // Path to translation files
		},
		// react: { // Optional: React specific options
		//   useSuspense: false // Set to true if using React Suspense for loading translations
		// }
	});

export default i18n;
