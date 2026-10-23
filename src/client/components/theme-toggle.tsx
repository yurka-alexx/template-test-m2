import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  applyTheme,
  parseTheme,
  readTheme,
  saveTheme,
  type Theme,
  themeLabels,
  themes,
  watchSystemTheme,
} from "@/lib/theme";

/**
 * Umschalter für das Farbschema (Hell, Dunkel, System). Die Klasse auf <html> setzt beim Laden
 * schon das Skript in index.html, hier wird sie nach jeder Wahl und bei `system` nach jedem
 * Wechsel im Browser neu gesetzt. `className` geht an den Knopf (z. B. Größe in der Seitenleiste).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    return watchSystemTheme(() => applyTheme("system"));
  }, [theme]);

  function choose(value: string) {
    const next = parseTheme(value);
    saveTheme(next);
    setTheme(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label="Farbschema wechseln"
          title="Farbschema wechseln"
        >
          <Sun aria-hidden="true" className="dark:hidden" />
          <Moon aria-hidden="true" className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={theme} onValueChange={choose}>
          {themes.map((value) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {themeLabels[value]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
