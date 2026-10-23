// Farbschema: Wahl "hell", "dunkel" oder "system" lesen, speichern und auf <html> anwenden.
// Dunkel heißt: <html> trägt die Klasse `dark`, dann gilt der Block `.dark` in styles/tokens.css.
// Das Skript in index.html setzt die Klasse schon vor dem ersten Rendern nach denselben Regeln
// (Schlüssel, Werte, Klasse), `theme.test.ts` prüft, dass beide gleich entscheiden.

export const themes = ["hell", "dunkel", "system"] as const;
export type Theme = (typeof themes)[number];

export const themeLabels: Record<Theme, string> = {
  hell: "Hell",
  dunkel: "Dunkel",
  system: "System",
};

/** Schlüssel in `localStorage`. */
export const THEME_STORAGE_KEY = "theme";
export const DARK_CLASS = "dark";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;
type MatchMedia = (query: string) => Pick<MediaQueryList, "matches">;
type WatchableMatchMedia = (
  query: string,
) => Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">;

/** Gültige Wahl oder `system` (fehlender, leerer oder unbekannter Wert). */
export function parseTheme(value: unknown): Theme {
  return themes.includes(value as Theme) ? (value as Theme) : "system";
}

/** Gespeicherte Wahl, Standard `system`. Gesperrter Speicher (etwa privater Modus) zählt als leer. */
export function readTheme(storage: ThemeStorage | undefined = globalThis.localStorage): Theme {
  try {
    return parseTheme(storage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

/** Speichert die Wahl. Ist der Speicher gesperrt, gilt sie nur bis zum Neuladen. */
export function saveTheme(
  theme: Theme,
  storage: ThemeStorage | undefined = globalThis.localStorage,
) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Kein Speicher: Die Wahl wirkt trotzdem, nur nicht über das Neuladen hinaus.
  }
}

/** Ob der Browser bzw. das Betriebssystem auf dunkel steht. */
export function systemPrefersDark(matchMedia: MatchMedia | undefined = globalThis.matchMedia) {
  return typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;
}

/** Ob die Wahl dunkel ergibt: `dunkel` immer, `system` nur, wenn der Browser dunkel will. */
export function isDark(theme: Theme, prefersDark: boolean) {
  return theme === "dunkel" || (theme === "system" && prefersDark);
}

/** Setzt oder entfernt die Klasse `dark` an `root` (Standard `<html>`). */
export function applyTheme(
  theme: Theme,
  root: Pick<Element, "classList"> = document.documentElement,
  prefersDark = systemPrefersDark(),
) {
  root.classList.toggle(DARK_CLASS, isDark(theme, prefersDark));
}

/** Ruft `onChange` auf, sobald der Browser zwischen hell und dunkel wechselt. Gibt das Abmelden zurück. */
export function watchSystemTheme(
  onChange: (prefersDark: boolean) => void,
  matchMedia: WatchableMatchMedia | undefined = globalThis.matchMedia,
) {
  if (typeof matchMedia !== "function") return () => {};
  const query = matchMedia(DARK_QUERY);
  const listener = (event: Pick<MediaQueryListEvent, "matches">) => onChange(event.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
