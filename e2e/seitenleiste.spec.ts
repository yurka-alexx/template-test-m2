// Ticket 13: App-Hülle mit Seitenleiste nach shadcn/ui-Block "sidebar-07" (AK1 bis AK4).
// Breit (Desktop Chrome, 1280 Pixel): Leiste offen, auf Symbole einklappbar. Schmal (390 Pixel):
// Leiste zu, öffnet als Schublade (Dialog „Seitenleiste“).
import { expect, type Page, test } from "@playwright/test";
import { account, login } from "./helpers.ts";

const menu = (page: Page) => page.getByRole("navigation", { name: "Hauptmenü" });
const sidebar = (page: Page) => page.locator('[data-slot="sidebar"]');
const trigger = (page: Page) => page.getByRole("button", { name: "Seitenleiste umschalten" });

test.describe("breiter Bildschirm", () => {
  test("AK1: Menü mit Start und Aufgaben, Klick öffnet /aufgaben, aktiver Eintrag markiert", async ({
    page,
  }) => {
    await login(page, "admin");
    const start = menu(page).getByRole("link", { name: "Start" });
    const aufgaben = menu(page).getByRole("link", { name: "Aufgaben" });
    await expect(start).toBeVisible();
    await expect(aufgaben).toBeVisible();
    await expect(start).toHaveAttribute("aria-current", "page");
    await expect(start).toHaveAttribute("data-active", "true");
    await expect(aufgaben).not.toHaveAttribute("aria-current", "page");

    await aufgaben.click();
    await expect(page).toHaveURL(/\/aufgaben$/);
    await expect(page.getByRole("heading", { name: "Aufgaben" })).toBeVisible();
    await expect(aufgaben).toHaveAttribute("aria-current", "page");
    await expect(aufgaben).toHaveAttribute("data-active", "true");
    await expect(start).not.toHaveAttribute("aria-current", "page");
    await expect(start).toHaveAttribute("data-active", "false");
    // Die Markierung ist auch zu sehen: anderer Hintergrund als der nicht aktive Eintrag.
    const background = (link: typeof start) =>
      link.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await background(aufgaben)).not.toBe(await background(start));

    // Mit Suchparametern bleibt der Eintrag markiert.
    await page.goto("/aufgaben?page=2");
    await expect(aufgaben).toHaveAttribute("aria-current", "page");
  });

  test("AK2: Auslöser klappt die Leiste auf Symbole ein und wieder aus", async ({ page }) => {
    await login(page, "admin");
    const width = async () => (await menu(page).boundingBox())?.width ?? 0;
    await expect(sidebar(page)).toHaveAttribute("data-state", "expanded");
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(width).toBeGreaterThan(200);

    await trigger(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "collapsed");
    await expect(sidebar(page)).toHaveAttribute("data-collapsible", "icon");
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
    await expect.poll(width).toBeLessThan(60);
    // Eingeklappt bleiben Menü, Abmelden und Farbschema als Symbole erreichbar.
    await expect(menu(page).getByRole("link", { name: "Aufgaben" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Farbschema wechseln" })).toBeVisible();

    await trigger(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "expanded");
    await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
    await expect.poll(width).toBeGreaterThan(200);
  });

  test("AK3: Fuß mit Name und Rolle, Farbschema-Umschalter erreichbar, Abmelden führt zur Anmeldung", async ({
    page,
  }) => {
    await login(page, "admin");
    const { name } = account("admin");
    await expect(sidebar(page).getByText(name, { exact: true })).toBeVisible();
    await expect(sidebar(page).getByText("Admin", { exact: true })).toBeVisible();

    await sidebar(page).getByRole("button", { name: "Farbschema wechseln" }).click();
    await page.getByRole("menuitemradio", { name: "Dunkel" }).click();
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);

    await sidebar(page).getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
  });

  test("Abmelden schlägt fehl bei eingeklappter Leiste: Leiste klappt auf und zeigt die Meldung", async ({
    page,
  }) => {
    await login(page, "benutzer");
    await trigger(page).click();
    await expect(sidebar(page)).toHaveAttribute("data-state", "collapsed");

    // Server nicht erreichbar: Die Anfrage zum Abmelden bricht ab.
    await page.route("**/api/auth/logout", (route) => route.abort());
    await sidebar(page).getByRole("button", { name: "Abmelden" }).click();

    await expect(sidebar(page)).toHaveAttribute("data-state", "expanded");
    await expect(sidebar(page).getByRole("alert")).toContainText("Abmelden fehlgeschlagen");
    await expect(sidebar(page).getByRole("alert")).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });
});

test.describe("schmaler Bildschirm", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AK4: Leiste ist zu und öffnet per Auslöser als Schublade", async ({ page }) => {
    await login(page, "benutzer");
    const drawer = page.getByRole("dialog", { name: "Seitenleiste" });
    await expect(menu(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Abmelden" })).toBeHidden();
    await expect(drawer).toHaveCount(0);

    await trigger(page).click();
    await expect(drawer).toBeVisible();
    // Die Schublade ist modal: Der Rest der Seite (auch der Auslöser) ist dann für Screenreader
    // ausgeblendet, deshalb hier keine Prüfung von aria-expanded.
    await expect(drawer.getByRole("link", { name: "Start" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Abmelden" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Farbschema wechseln" })).toBeVisible();

    // Ein Eintrag führt zur Seite und schließt die Schublade.
    await drawer.getByRole("link", { name: "Aufgaben" }).click();
    await expect(page).toHaveURL(/\/aufgaben$/);
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { name: "Aufgaben" })).toBeVisible();

    // Escape schließt die Schublade auch.
    await trigger(page).click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });
});
