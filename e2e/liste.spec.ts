// AE2: Liste mit den 30 Seed-Aufgaben. Sortierung nach Fälligkeit, Filter nach Status und Seite 2
// zeigen jeweils die erwarteten Einträge. Die Erwartungen kommen aus den Seed-Daten selbst.
import { expect, type Page, test } from "@playwright/test";
import { seedTasks } from "../src/server/db/seed.ts";
import type { TaskStatus } from "../src/shared/schemas/task.ts";
import { login, tasksTable, titleCells } from "./helpers.ts";

const PAGE_SIZE = 10;

/** Seed-Aufgaben nach Fälligkeit aufsteigend, ohne Fälligkeit am Ende, dann nach ID (= Index). */
function byDueDate(status?: TaskStatus) {
  return seedTasks
    .map((task, index) => ({ ...task, index }))
    .filter((task) => !status || task.status === status)
    .sort((a, b) => {
      if (a.dueInDays === null || b.dueInDays === null) {
        return Number(a.dueInDays === null) - Number(b.dueInDays === null) || a.index - b.index;
      }
      return a.dueInDays - b.dueInDays || a.index - b.index;
    })
    .map((task) => task.title);
}

const pageInfo = (page: Page) => page.getByText(/^Seite \d+ von \d+$/);

test.beforeEach(async ({ page }) => {
  await login(page, "admin");
  await page.goto("/aufgaben");
  await expect(page.getByText("30 Einträge")).toBeVisible();
  await expect(pageInfo(page)).toHaveText("Seite 1 von 3");
});

test("Sortierung nach Fälligkeit zeigt die zehn frühesten Fälligkeiten", async ({ page }) => {
  const header = tasksTable(page).getByRole("columnheader", { name: "Fällig" });
  await header.getByRole("button", { name: "Fällig" }).click();

  await expect(page).toHaveURL(/[?&]sort=dueDate/);
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await expect(titleCells(page)).toHaveText(byDueDate().slice(0, PAGE_SIZE));
});

test("Wechsel auf Seite 2 zeigt die Einträge 11 bis 20", async ({ page }) => {
  await tasksTable(page).getByRole("button", { name: "Fällig" }).click();
  await expect(titleCells(page)).toHaveText(byDueDate().slice(0, PAGE_SIZE));

  await page.getByRole("button", { name: "Nächste Seite" }).click();

  await expect(page).toHaveURL(/[?&]page=2/);
  await expect(pageInfo(page)).toHaveText("Seite 2 von 3");
  await expect(titleCells(page)).toHaveText(byDueDate().slice(PAGE_SIZE, 2 * PAGE_SIZE));
});

test("Filter nach Status „Erledigt“ zeigt genau die erledigten Aufgaben", async ({ page }) => {
  await tasksTable(page).getByRole("button", { name: "Fällig" }).click();
  // Der Filterknopf „Status“ steht in der Werkzeugleiste neben dem Suchfeld, nicht im Spaltenkopf.
  const toolbar = page.getByRole("searchbox", { name: "Aufgaben durchsuchen" }).locator("..");
  await toolbar.getByRole("button", { name: "Status" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Erledigt" }).click();
  await page.keyboard.press("Escape");

  const expected = byDueDate("erledigt");
  await expect(page).toHaveURL(/[?&]status=[^&]*erledigt/);
  await expect(page.getByText(`${expected.length} Einträge`)).toBeVisible();
  await expect(pageInfo(page)).toHaveText("Seite 1 von 1");
  await expect(titleCells(page)).toHaveText(expected);
  await expect(tasksTable(page).locator("tbody tr td:nth-child(2)")).toHaveText(
    expected.map(() => "Erledigt"),
  );
});
