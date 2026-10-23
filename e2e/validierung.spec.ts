// AE3: Aufgabe ohne Titel. Das Formular zeigt den Fehler am Feld „Titel“, die API antwortet mit
// 400 und `fields.title`, beide mit derselben Meldung aus dem gemeinsamen zod-Schema.
import { expect, test } from "@playwright/test";
import type { ApiErrorBody } from "../src/shared/api-error.ts";
import { callApi, login } from "./helpers.ts";

test("Aufgabe ohne Titel: Feldfehler im Formular und 400 mit fields.title von der API", async ({
  page,
}) => {
  await login(page, "admin");
  await page.goto("/aufgaben");
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Aufgabe" });
  await dialog.getByRole("button", { name: "Speichern" }).click();

  const title = dialog.getByLabel("Titel");
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toHaveAccessibleDescription("fehlt");
  // Nicht gespeichert: Dialog bleibt offen.
  await expect(dialog).toBeVisible();

  // Dieselbe Eingabe direkt an die API, mit der Sitzung aus dem Browser.
  const res = await callApi(page, "POST", "/api/tasks", { title: "" });
  expect(res.status).toBe(400);
  expect((res.body as ApiErrorBody).fields?.title).toEqual(["fehlt"]);

  // Nur Leerzeichen gilt ebenfalls als leer (Titel wird getrimmt).
  const blank = await callApi(page, "POST", "/api/tasks", { title: "   " });
  expect(blank.status).toBe(400);
  expect((blank.body as ApiErrorBody).fields?.title).toEqual(["fehlt"]);
});
