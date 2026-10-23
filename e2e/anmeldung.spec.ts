// AK5: Anmeldung als Admin funktioniert, falsche Zugangsdaten zeigen eine Fehlermeldung.
import { expect, test } from "@playwright/test";
import { account, callApi, login } from "./helpers.ts";

test("Anmeldung als Admin führt auf die Startseite mit Name und Rolle", async ({ page }) => {
  await page.goto("/");
  // Ohne Sitzung landet man auf der Anmeldeseite und kommt danach zurück.
  await expect(page).toHaveURL(/\/login\?redirect=%2F$/);

  await login(page, "admin");
  const { email } = account("admin");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(`Angemeldet als ${email}, Rolle: Admin`)).toBeVisible();

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("falsches Passwort zeigt eine Fehlermeldung und meldet nicht an", async ({ page }) => {
  const { email } = account("admin");
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill("falsches-passwort-123");
  await page.getByRole("button", { name: "Anmelden" }).click();

  await expect(page.getByRole("alert")).toHaveText("E-Mail oder Passwort falsch");
  await expect(page).toHaveURL(/\/login$/);
  expect((await callApi(page, "GET", "/api/auth/me")).status).toBe(401);
});
