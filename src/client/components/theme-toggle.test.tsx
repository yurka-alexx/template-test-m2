import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeToggle } from "./theme-toggle.tsx";

describe("ThemeToggle", () => {
  // Playwright und Ticket 6 (Seitenleiste) finden den Umschalter über diesen Namen.
  test("Knopf mit festem, zugänglichem Namen und beiden Symbolen", () => {
    const html = renderToStaticMarkup(<ThemeToggle />);
    expect(html).toContain('aria-label="Farbschema wechseln"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("lucide-sun");
    expect(html).toContain("lucide-moon");
  });
});
