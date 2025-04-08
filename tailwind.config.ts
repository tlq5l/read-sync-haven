import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: {
				"2xl": "1400px",
			},
		},
		extend: {
			colors: {
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))",
				},
				secondary: {
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				sidebar: {
					DEFAULT: "hsl(var(--sidebar-background))",
					foreground: "hsl(var(--sidebar-foreground))",
					primary: "hsl(var(--sidebar-primary))",
					"primary-foreground": "hsl(var(--sidebar-primary-foreground))",
					accent: "hsl(var(--sidebar-accent))",
					"accent-foreground": "hsl(var(--sidebar-accent-foreground))",
					border: "hsl(var(--sidebar-border))",
					ring: "hsl(var(--sidebar-ring))",
				},
				thinkara: {
					50: "#f0f7ff",
					100: "#e0eefe",
					200: "#bae0fd",
					300: "#7cc9fc",
					400: "#36b0f4",
					500: "#0c97e2",
					600: "#0079c1",
					700: "#00619d",
					800: "#055181",
					900: "#0a456b",
					950: "#062a45",
				},
			},
			transitionTimingFunction: {
				"smooth-in": "cubic-bezier(0.4, 0, 0.2, 1)",
				"smooth-out": "cubic-bezier(0.0, 0, 0.2, 1)",
				"smooth-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
				accelerate: "cubic-bezier(0.4, 0.0, 1, 1)",
				decelerate: "cubic-bezier(0.0, 0.0, 0.2, 1)",
				bounce: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
			},
			transitionDuration: {
				"50": "50ms",
				"100": "100ms",
				"150": "150ms",
				"200": "200ms",
				"250": "250ms",
				"300": "300ms",
				"400": "400ms",
				"500": "500ms",
			},
			borderRadius: {
				lg: "var(--radius)",
				md: "calc(var(--radius) - 2px)",
				sm: "calc(var(--radius) - 4px)",
			},
			keyframes: {
				"accordion-down": {
					from: {
						height: "0",
						transform: "translateZ(0)",
					},
					to: {
						height: "var(--radix-accordion-content-height)",
						transform: "translateZ(0)",
					},
				},
				"accordion-up": {
					from: {
						height: "var(--radix-accordion-content-height)",
						transform: "translateZ(0)",
					},
					to: {
						height: "0",
						transform: "translateZ(0)",
					},
				},
				"fade-in": {
					from: {
						opacity: "0",
						transform: "translateZ(0)",
					},
					to: {
						opacity: "1",
						transform: "translateZ(0)",
					},
				},
				"fade-out": {
					from: {
						opacity: "1",
						transform: "translateZ(0)",
					},
					to: {
						opacity: "0",
						transform: "translateZ(0)",
					},
				},
				"slide-in-from-top": {
					from: {
						transform: "translateY(-100%) translateZ(0)",
					},
					to: {
						transform: "translateY(0) translateZ(0)",
					},
				},
				"slide-in-from-bottom": {
					from: {
						transform: "translateY(100%) translateZ(0)",
					},
					to: {
						transform: "translateY(0) translateZ(0)",
					},
				},
				"slide-in-from-left": {
					from: {
						transform: "translateX(-100%) translateZ(0)",
					},
					to: {
						transform: "translateX(0) translateZ(0)",
					},
				},
				"slide-in-from-right": {
					from: {
						transform: "translateX(100%) translateZ(0)",
					},
					to: {
						transform: "translateX(0) translateZ(0)",
					},
				},
				"scale-in": {
					from: {
						opacity: "0",
						transform: "scale(0.95) translateZ(0)",
					},
					to: {
						opacity: "1",
						transform: "scale(1) translateZ(0)",
					},
				},
				"scale-out": {
					from: {
						opacity: "1",
						transform: "scale(1) translateZ(0)",
					},
					to: {
						opacity: "0",
						transform: "scale(0.95) translateZ(0)",
					},
				},
			},
			animation: {
				"accordion-down":
					"accordion-down var(--animation-duration-normal) var(--animation-easing-standard)",
				"accordion-up":
					"accordion-up var(--animation-duration-normal) var(--animation-easing-standard)",
				"fade-in":
					"fade-in var(--animation-duration-normal) var(--animation-easing-standard)",
				"fade-out":
					"fade-out var(--animation-duration-normal) var(--animation-easing-standard)",
				"slide-in-from-top":
					"slide-in-from-top var(--animation-duration-slow) var(--animation-easing-standard)", // Keep slightly slower for slides
				"slide-in-from-bottom":
					"slide-in-from-bottom var(--animation-duration-slow) var(--animation-easing-standard)", // Keep slightly slower for slides
				"slide-in-from-left":
					"slide-in-from-left var(--animation-duration-slow) var(--animation-easing-standard)", // Keep slightly slower for slides
				"slide-in-from-right":
					"slide-in-from-right var(--animation-duration-slow) var(--animation-easing-standard)", // Keep slightly slower for slides
				"scale-in":
					"scale-in var(--animation-duration-normal) var(--animation-easing-standard)",
				"scale-out":
					"scale-out var(--animation-duration-normal) var(--animation-easing-standard)",
			},
		},
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
