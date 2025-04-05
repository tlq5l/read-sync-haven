import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import {
	createRoutesFromChildren,
	matchRoutes,
	useLocation,
	useNavigationType,
} from "react-router-dom";

Sentry.init({
	dsn: "https://b61feefc1447b106540d9918f3727342@o4509033972498432.ingest.us.sentry.io/4509033975119872",
	integrations: [
		// See docs for support of different versions of variation of react router
		// https://docs.sentry.io/platforms/javascript/guides/react/configuration/integrations/react-router/
		Sentry.reactRouterV6BrowserTracingIntegration({
			useEffect,
			useLocation,
			useNavigationType,
			createRoutesFromChildren,
			matchRoutes,
		}),
		Sentry.replayIntegration(),
	],

	// Set tracesSampleRate to 1.0 to capture 100%
	// of transactions for tracing.
	tracesSampleRate: 1.0,

	// Set `tracePropagationTargets` to control for which URLs trace propagation should be enabled
	tracePropagationTargets: [/^\//, /^https:\/\/yourserver\.io\/api/],

	// Capture Replay for 10% of all sessions,
	// plus for 100% of sessions with an error
	replaysSessionSampleRate: 0.1,
	replaysOnErrorSampleRate: 1.0,

	// Add release information to connect errors with source maps
	release: "read-sync-haven@1.0.0", // You can use your actual version or a git commit hash here
});
