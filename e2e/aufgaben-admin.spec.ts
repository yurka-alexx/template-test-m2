// AK4: Als Admin eine Aufgabe anlegen, in der Liste finden, bearbeiten und mit Bestätigung löschen.
import { expect, test } from "@playwright/test";
import { deleteE2eTasks, E2E_PREFIX, login, tasksTable } from "./helpers.ts";

// Auch wenn der Test vorher abbricht: Die angelegte Aufgabe darf nicht stehen bleiben, sonst
// fehlen in liste.spec.ts die erwarteten 30 Einträge (auch beim Retry in CI).
test.afterEach(async () => {
  await deleteE2eTasks();
});

test("Admin legt eine Aufgabe an, findet, bearbeitet und löscht sie", async ({ page }) => {
  const title = `${E2E_PREFIX} Aufgabe ${Date.now()}`;
  const changed = `${title} geändert`;

  await login(page, "admin");
  await page.getByRole("link", { name: "Aufgaben" }).click();
  await expect(page).toHaveURL(/\/aufgaben/);
  const table = tasksTable(page);

  // Anlegen
  await page.getByRole("button", { name: "Neue Aufgabe" }).click();
  const createDialog = page.getByRole("dialog", { name: "Neue Aufgabe" });
  await createDialog.getByLabel("Titel").fill(title);
  await createDialog.getByLabel("Priorität").selectOption({ label: "Hoch" });
  await createDialog.getByRole("button", { name: "Speichern" }).click();
  await expect(createDialog).toBeHidden();

  // In der Liste finden (Suche über Titel und Beschreibung)
  await page.getByRole("searchbox", { name: "Aufgaben durchsuchen" }).fill(title);
  await expect(page).toHaveURL(/[?&]q=/);
  const row = table.getByRole("row").filter({ hasText: title });
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(row).toContainText("Offen");
  await expect(row).toContainText("Hoch");

  // Bearbeiten
  await page.getByRole("button", { name: `Bearbeiten: ${title}` }).click();
  const editDialog = page.getByRole("dialog", { name: "Aufgabe bearbeiten" });
  await expect(editDialog.getByLabel("Titel")).toHaveValue(title);
  await editDialog.getByLabel("Titel").fill(changed);
  await editDialog.getByLabel("Status").selectOption({ label: "In Arbeit" });
  await editDialog.getByRole("button", { name: "Speichern" }).click();
  await expect(editDialog).toBeHidden();
  const changedRow = table.getByRole("row").filter({ hasText: changed });
  await expect(changedRow).toContainText("In Arbeit");
  await expect(table.locator("tbody tr")).toHaveCount(1);

  // Löschen fragt nach: „Abbrechen“ lässt die Aufgabe stehen.
  await page.getByRole("button", { name: `Löschen: ${changed}` }).click();
  const confirm = page.getByRole("alertdialog", { name: "Aufgabe löschen?" });
  await expect(confirm).toContainText(changed);
  await confirm.getByRole("button", { name: "Abbrechen" }).click();
  await expect(confirm).toBeHidden();
  await expect(changedRow).toBeVisible();

  // Erst „Löschen“ im Dialog löscht.
  await page.getByRole("button", { name: `Löschen: ${changed}` }).click();
  await confirm.getByRole("button", { name: "Löschen" }).click();
  await expect(confirm).toBeHidden();
  await expect(changedRow).toHaveCount(0);
  await expect(table.getByRole("status")).toHaveText("Keine Aufgaben zu diesen Filtern.");
});
