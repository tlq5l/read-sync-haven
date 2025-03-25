import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ThemeToggleProps {
  showLabel?: boolean;
}

export function ThemeToggle({ showLabel = true }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  
  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="theme-toggle"
        checked={theme === "dark"}
        onCheckedChange={toggleTheme}
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
