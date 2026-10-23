// AK6: Eine andere Token-Datei ändert Farben und Schrift überall, ohne eine Komponente anzufassen.
// Die Seite wird wie ausgeliefert geladen, dann kommt e2e/fixtures/tokens-alt.css über tokens.css.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

const altTokens = fileURLToPath(new URL("./fixtures/tokens-alt.css", import.meta.url));
const tokens = fileURLToPath(new URL("../src/client/styles/tokens.css", import.meta.url));

/** Namen der CSS-Variablen, die eine Token-Datei setzt. */
const variables = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]).sort();

/** Berechnete Werte an mehreren Stellen der Anmeldeseite (Knopf, Text, Karte). */
async function computed(page: Page) {
  const button = page.getByRole("button", { name: "Anmelden" });
  const title = page.getByText("Mit E-Mail-Adresse und Passwort anmelden");
  return {
    primary: await button.evaluate((el) => getComputedStyle(el).backgroundColor),
    buttonFont: await button.evaluate((el) => getComputedStyle(el).fontFamily),
    bodyFont: await page.evaluate(() => getComputedStyle(document.body).fontFamily),
    textFont: await title.evaluate((el) => getComputedStyle(el).fontFamily),
    radius: await button.evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
  };
}

test("tokens-alt.css setzt dieselben Variablen wie tokens.css", () => {
  expect(variables(altTokens)).toEqual(variables(tokens));
});

test("Austausch der Token-Datei ändert Primärfarbe und Schrift", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
  const before = await computed(page);
  expect(before.bodyFont).toContain("Open Sans Variable");
  expect(before.buttonFont).toBe(before.bodyFont);

  await page.addStyleTag({ path: altTokens });
  // Der Knopf hat `transition-all`: erst die Übergänge abwarten, sonst steht noch der alte Wert da.
  // `getAnimations()` rechnet die Stile vorher neu, die Übergänge sind dann schon gestartet.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const after = await computed(page);

  expect(after.primary).not.toBe(before.primary);
  for (const font of [after.bodyFont, after.buttonFont, after.textFont]) {
    expect(font).toContain("Georgia");
    expect(font).not.toContain("Open Sans");
  }
  expect(after.radius).not.toBe(before.radius);
});
