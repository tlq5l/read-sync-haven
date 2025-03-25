import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/context/ThemeContext";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

interface ThemeToggleProps {
	showLabel?: boolean;
}

export function ThemeToggle({ showLabel = true }: ThemeToggleProps) {
	const { theme, setTheme } = useTheme();
	const { toast } = useToast();
	const [isChanging, setIsChanging] = useState(false);

	const toggleTheme = () => {
		const newTheme = theme === "dark" ? "light" : "dark";
		setIsChanging(true);
		
		// Show toast with visual feedback
		toast({
			title: `Theme Changed: ${newTheme === "dark" ? "Dark" : "Light"} Mode`,
			description: `${newTheme === "dark" ? "Dark" : "Light"} mode has been activated.`,
		});
		
		// Apply theme change
		setTheme(newTheme);
	};
	
	// Reset changing state after animation completes
	useEffect(() => {
		if (isChanging) {
			const timer = setTimeout(() => {
				setIsChanging(false);
			}, 600); // Match animation duration
			
			return () => clearTimeout(timer);
		}
	}, [isChanging]);

	return (
		<div className="flex items-center space-x-2 relative">
			{/* Add a visual pulse effect when toggling */}
			{isChanging && (
				<span className="absolute inset-0 rounded-md bg-primary/20 animate-pulse" />
			)}
			
			<Switch
				id="theme-toggle"
				checked={theme === "dark"}
				onCheckedChange={toggleTheme}
				className={isChanging ? "animate-wiggle" : ""}
			/>
			{showLabel && (
				<div className="flex items-center space-x-2">
					<Label htmlFor="theme-toggle">
						{theme === "dark" ? (
							<Moon className="h-4 w-4" />
						) : (
							<Sun className="h-4 w-4" />
						)}
					</Label>
					<Label htmlFor="theme-toggle">
						{theme === "dark" ? "Dark Mode" : "Light Mode"}
					</Label>
				</div>
			)}
		</div>
	);
}
