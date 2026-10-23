// Ticket 12: Dunkles Farbschema mit Umschalter „Farbschema wechseln“ (Hell, Dunkel, System).
// Die Wahl steht in localStorage unter `theme`, dunkel heißt Klasse `dark` auf <html>.
import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers.ts";

const html = (page: Page) => page.locator("html");
const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const storedTheme = (page: Page) => page.evaluate(() => localStorage.getItem("theme"));

async function chooseTheme(page: Page, label: "Hell" | "Dunkel" | "System") {
  await page.getByRole("button", { name: "Farbschema wechseln" }).click();
  await page.getByRole("menuitemradio", { name: label }).click();
}

test.describe("Browser hell", () => {
  test.use({ colorScheme: "light" });

  test("Wahl Dunkel setzt die Klasse dark, ändert den Hintergrund und bleibt nach Neuladen", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
    await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
    const light = await bodyBackground(page);

    await chooseTheme(page, "Dunkel");
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect.poll(() => bodyBackground(page)).not.toBe(light);
    const dark = await bodyBackground(page);
    expect(await storedTheme(page)).toBe("dunkel");

    await page.reload();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
    expect(await bodyBackground(page)).toBe(dark);

    // Das Menü zeigt die gespeicherte Wahl, Hell schaltet zurück.
    await page.getByRole("button", { name: "Farbschema wechseln" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Dunkel" })).toBeChecked();
    await page.getByRole("menuitemradio", { name: "Hell" }).click();
    await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect.poll(() => bodyBackground(page)).toBe(light);
    expect(await storedTheme(page)).toBe("hell");
  });

  test("Umschalter steht auch im geschützten Bereich", async ({ page }) => {
    await login(page, "admin");
    await chooseTheme(page, "Dunkel");
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);

    await page.getByRole("link", { name: "Aufgaben" }).click();
    await expect(page.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Farbschema wechseln" })).toBeVisible();
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
  });

  test("System folgt einem Wechsel des Browsers ohne Neuladen", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
    expect(await storedTheme(page)).toBeNull();
    await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
  });
});

test.describe("Browser dunkel", () => {
  test.use({ colorScheme: "dark" });

  test("bei Wahl System startet die Seite dunkel", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
    expect(await storedTheme(page)).toBeNull();
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);

    // Gespeichertes Hell geht vor, gespeichertes System folgt wieder dem Browser.
    const dark = await bodyBackground(page);
    await chooseTheme(page, "Hell");
    await expect(html(page)).not.toHaveClass(/(^|\s)dark(\s|$)/);
    await expect.poll(() => bodyBackground(page)).not.toBe(dark);
    await chooseTheme(page, "System");
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
    expect(await storedTheme(page)).toBe("system");
  });

  test("die Klasse steht schon vor der App: Skript in index.html, ohne JavaScript-Bundle", async ({
    page,
  }) => {
    // Ohne das Bundle rendert React nichts. Dunkel ist die Seite trotzdem, also vor dem ersten Rendern.
    await page.route("**/assets/*.js", (route) => route.abort());
    await page.goto("/login");
    await expect(html(page)).toHaveClass(/(^|\s)dark(\s|$)/);
    await expect(page.getByRole("button", { name: "Anmelden" })).toHaveCount(0);
  });
});
