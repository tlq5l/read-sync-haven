import * as React from "react";

// Constants
export const SIDEBAR_COOKIE_NAME = "sidebar:state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 1 week
// Export width constants
export const SIDEBAR_WIDTH = "16rem";
export const SIDEBAR_WIDTH_MOBILE = "18rem";
export const SIDEBAR_WIDTH_ICON = "3rem";
export const SIDEBAR_KEYBOARD_SHORTCUT = "b";

// Context Type
export type SidebarContextType = {
	state: "expanded" | "collapsed";
	open: boolean;
	setOpen: (open: boolean) => void;
	openMobile: boolean;
	setOpenMobile: (open: boolean) => void;
	isMobile: boolean;
	toggleSidebar: () => void;
};

// Context Creation
export const SidebarContext = React.createContext<SidebarContextType | null>(
	null,
);

// Hook to use the context
export function useSidebar() {
	const context = React.useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider.");
	}
	return context;
}

// Provider Component Props
type SidebarProviderProps = React.ComponentProps<"div"> & {
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	isMobile: boolean; // Pass isMobile as a prop
};

// Provider Component Implementation
export const SidebarProvider = React.forwardRef<
	HTMLDivElement,
	SidebarProviderProps
>(
	(
		{
			defaultOpen = true,
			open: openProp,
			onOpenChange: setOpenProp,
			isMobile, // Receive isMobile prop
			children,
			...props // Pass rest of the props to the div
		},
		ref, // Forward the ref
	) => {
		const [openMobile, setOpenMobile] = React.useState(false);
		const [_open, _setOpen] = React.useState(defaultOpen);
		const open = openProp ?? _open;

		const setOpen = React.useCallback(
			(value: boolean | ((value: boolean) => boolean)) => {
				const openState = typeof value === "function" ? value(open) : value;
				if (setOpenProp) {
					setOpenProp(openState);
				} else {
					_setOpen(openState);
				}
				document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
			},
			[setOpenProp, open],
		);

		const toggleSidebar = React.useCallback(() => {
			return isMobile
				? setOpenMobile((currentOpen) => !currentOpen)
				: setOpen((currentOpen) => !currentOpen);
		}, [isMobile, setOpen]);

		React.useEffect(() => {
			const handleKeyDown = (event: KeyboardEvent) => {
				if (
					event.key === SIDEBAR_KEYBOARD_SHORTCUT && // Fix: Use && instead of &amp;&amp;
					(event.metaKey || event.ctrlKey)
				) {
					event.preventDefault();
					toggleSidebar();
				}
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, [toggleSidebar]); // Keep toggleSidebar dependency
		const state = open ? "expanded" : "collapsed";

		const contextValue = React.useMemo<SidebarContextType>(
			() => ({
				state,
				open,
				setOpen,
				isMobile,
				openMobile,
				setOpenMobile,
				toggleSidebar,
			}),
			[state, open, setOpen, isMobile, openMobile, toggleSidebar], // Remove setOpenMobile dependency
		);

		// Pass ref and props to the underlying div
		return (
			<SidebarContext.Provider value={contextValue}>
				<div ref={ref} {...props}>
					{children}
				</div>
			</SidebarContext.Provider>
		);
	},
);
SidebarProvider.displayName = "SidebarProvider";