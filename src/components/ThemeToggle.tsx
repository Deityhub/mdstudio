import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleTheme } from "@/lib/ui/theme";

/** Both icons render and CSS shows the right one, so server and client markup always match. */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Toggle dark mode"
      onClick={() => toggleTheme()}
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}
