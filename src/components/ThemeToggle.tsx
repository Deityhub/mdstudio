import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nextTheme, setTheme, watchSystemTheme, type Theme } from "@/lib/ui/theme";
import { useThemeChoice } from "@/lib/ui/useThemeChoice";

const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark", system: "System" };
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;

/** One button that goes light, dark, system and round again; its icon and label show the current choice. */
export function ThemeToggle({ className }: { className?: string }) {
  const choice = useThemeChoice();
  useEffect(() => watchSystemTheme(), []);
  const Icon = ICON[choice];
  const next = nextTheme(choice);
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}`}
      title={`Theme: ${LABEL[choice]}`}
      onClick={() => setTheme(next)}
    >
      <Icon className="size-4" />
    </Button>
  );
}
