import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyTheme,
  isDark,
  parseTheme,
  readTheme,
  saveTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  themes,
  watchSystemTheme,
} from "./theme.ts";

/** `localStorage` im Speicher. */
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

/** Gesperrter Speicher wie im privaten Modus mancher Browser: jeder Zugriff wirft. */
const lockedStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

/** `matchMedia` mit fester Antwort für `prefers-color-scheme: dark`. */
const media = (dark: boolean) => (query: string) => ({
  matches: query === "(prefers-color-scheme: dark)" && dark,
});

/** Element mit `classList` wie `<html>`. */
function fakeRoot(...classes: string[]) {
  const set = new Set(classes);
  return {
    set,
    classList: {
      toggle: (name: string, force?: boolean) => {
        const on = force ?? !set.has(name);
        if (on) set.add(name);
        else set.delete(name);
        return on;
      },
    } as unknown as DOMTokenList,
  };
}

describe("Wahl speichern und lesen", () => {
  test("jede Wahl wird unter dem Schlüssel theme gespeichert und wieder gelesen", () => {
    for (const theme of themes) {
      const storage = memoryStorage();
      saveTheme(theme, storage);
      expect(storage.values.get(THEME_STORAGE_KEY)).toBe(theme);
      expect(readTheme(storage)).toBe(theme);
    }
  });

  test("ohne gespeicherte Wahl gilt system", () => {
    expect(readTheme(memoryStorage())).toBe("system");
    expect(readTheme(undefined)).toBe("system");
  });

  test("ungültige gespeicherte Werte fallen auf system zurück", () => {
    for (const value of ["", "dark", "light", "Dunkel", " hell", "null", "{}"]) {
      expect(readTheme(memoryStorage({ [THEME_STORAGE_KEY]: value }))).toBe("system");
    }
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme(1)).toBe("system");
  });

  test("gesperrter Speicher: Lesen gibt system, Speichern wirft nicht", () => {
    expect(readTheme(lockedStorage)).toBe("system");
    expect(() => saveTheme("dunkel", lockedStorage)).not.toThrow();
  });
});

describe("system folgt prefers-color-scheme", () => {
  test("systemPrefersDark liest die Media-Query", () => {
    expect(systemPrefersDark(media(true))).toBe(true);
    expect(systemPrefersDark(media(false))).toBe(false);
    expect(systemPrefersDark(undefined)).toBe(false);
  });

  test("system ist dunkel genau dann, wenn der Browser dunkel will; hell und dunkel sind fest", () => {
    expect(isDark("system", true)).toBe(true);
    expect(isDark("system", false)).toBe(false);
    expect(isDark("dunkel", false)).toBe(true);
    expect(isDark("dunkel", true)).toBe(true);
    expect(isDark("hell", true)).toBe(false);
    expect(isDark("hell", false)).toBe(false);
  });

  test("applyTheme setzt und entfernt die Klasse dark", () => {
    const root = fakeRoot("andere");
    applyTheme("system", root, true);
    expect([...root.set].sort()).toEqual(["andere", "dark"]);
    applyTheme("system", root, false);
    expect([...root.set]).toEqual(["andere"]);
    applyTheme("dunkel", root, false);
    expect(root.set.has("dark")).toBe(true);
    applyTheme("hell", root, true);
    expect(root.set.has("dark")).toBe(false);
  });

  test("watchSystemTheme meldet Wechsel und lässt sich abmelden", () => {
    const listeners = new Set<(event: { matches: boolean }) => void>();
    const query = {
      matches: false,
      addEventListener: (_: string, l: (event: { matches: boolean }) => void) => listeners.add(l),
      removeEventListener: (_: string, l: (event: { matches: boolean }) => void) =>
        listeners.delete(l),
    } as unknown as MediaQueryList;
    const seen: boolean[] = [];
    const stop = watchSystemTheme(
      (dark) => seen.push(dark),
      () => query,
    );
    for (const l of listeners) l({ matches: true });
    expect(seen).toEqual([true]);
    stop();
    expect(listeners.size).toBe(0);
    expect(() => watchSystemTheme(() => {}, undefined)()).not.toThrow();
  });
});

describe("Skript in index.html", () => {
  const html = readFileSync(fileURLToPath(new URL("../../../index.html", import.meta.url)), "utf8");
  const head = html.slice(0, html.indexOf("</head>"));
  const script = head.match(/<script>([\s\S]*?)<\/script>/)?.[1];

  test("steht im <head> vor dem Einstieg der App", () => {
    expect(script).toBeDefined();
    expect(html.indexOf("<script>")).toBeLessThan(html.indexOf('src="/src/client/main.tsx"'));
  });

  /** Führt das Skript mit Speicher, Media-Query und `<html>` aus und gibt zurück, ob `dark` gesetzt ist. */
  function runScript(stored: string | undefined, dark: boolean, locked = false) {
    const root = fakeRoot();
    const storage = locked
      ? lockedStorage
      : memoryStorage(stored === undefined ? {} : { [THEME_STORAGE_KEY]: stored });
    new Function("localStorage", "matchMedia", "document", script ?? "")(storage, media(dark), {
      documentElement: root,
    });
    return root.set.has("dark");
  }

  test("entscheidet für jeden gespeicherten Wert wie theme.ts", () => {
    const stored = [undefined, ...themes, "", "dark", "Dunkel", "unsinn"];
    for (const value of stored) {
      for (const dark of [true, false]) {
        const storage = memoryStorage(value === undefined ? {} : { [THEME_STORAGE_KEY]: value });
        const expected = isDark(readTheme(storage), dark);
        expect({ value, dark, result: runScript(value, dark) }).toEqual({
          value,
          dark,
          result: expected,
        });
      }
    }
  });

  test("gesperrter Speicher: Skript folgt dem Browser und wirft nicht", () => {
    expect(runScript(undefined, true, true)).toBe(true);
    expect(runScript(undefined, false, true)).toBe(false);
  });
});
