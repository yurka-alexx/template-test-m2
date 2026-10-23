import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Der Block `.dark` überschreibt alle Farb-Tokens aus `:root`, sonst bliebe im dunklen Schema eine
// helle Farbe stehen. Schrift, Radien und Abstände gelten für beide Schemata.
const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const indexCss = readFileSync(fileURLToPath(new URL("./index.css", import.meta.url)), "utf8");
const NOT_COLORS = ["--font-sans", "--radius", "--spacing"];

/** Inhalt eines Blocks (`:root` oder `.dark`) in tokens.css. */
function block(selector: string) {
  const start = css.search(new RegExp(`^${selector.replace(".", "\\.")} \\{`, "m"));
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

/** Namen der Variablen eines Blocks, sortiert. */
const variables = (selector: string) =>
  [...block(selector).matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1] as string).sort();

describe("tokens.css", () => {
  test(".dark setzt genau die Farb-Tokens aus :root, auch --overlay", () => {
    const colors = variables(":root").filter((name) => !NOT_COLORS.includes(name));
    expect(colors).toContain("--overlay");
    expect(variables(".dark")).toEqual(colors);
  });

  test("Primärfarbe und Fokusring kommen in beiden Schemata aus --navy", () => {
    for (const selector of [":root", ".dark"]) {
      expect(block(selector)).toContain("--primary: var(--navy);");
      expect(block(selector)).toContain("--primary-foreground: var(--navy-foreground);");
      expect(block(selector)).toContain("--ring: var(--navy);");
      expect(block(selector)).toContain("--sidebar-primary: var(--navy);");
      expect(block(selector)).toContain("--sidebar-ring: var(--navy);");
    }
  });

  // Die Seitenleiste (components/ui/sidebar.tsx) nutzt bg-sidebar, text-sidebar-foreground usw.
  test("index.css ordnet jede --sidebar*-Variable einer Tailwind-Farbe zu", () => {
    const sidebar = variables(":root").filter((name) => name.startsWith("--sidebar"));
    expect(sidebar).toEqual([
      "--sidebar",
      "--sidebar-accent",
      "--sidebar-accent-foreground",
      "--sidebar-border",
      "--sidebar-foreground",
      "--sidebar-primary",
      "--sidebar-primary-foreground",
      "--sidebar-ring",
    ]);
    for (const name of sidebar) {
      const mapping = `--color-${name.slice(2)}: var(${name});`;
      expect({ mapping, found: indexCss.includes(mapping) }).toEqual({ mapping, found: true });
    }
  });
});
