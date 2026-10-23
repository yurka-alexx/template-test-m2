// AK5, AK10: Ein Benutzer ohne Admin-Rolle sieht keinen Löschen-Knopf, und die API lehnt das
// Löschen mit seiner Sitzung auch direkt mit 403 ab.
import { expect, test } from "@playwright/test";
import { seedTaskId, seedTasks } from "../src/server/db/seed.ts";
import { callApi, login, tasksTable } from "./helpers.ts";

test("Benutzer ohne Admin-Rolle: kein Löschen-Knopf, DELETE an die API gibt 403", async ({
  page,
}) => {
  await login(page, "benutzer");
  await expect(page.getByText("Rolle: Benutzer")).toBeVisible();
  await page.goto("/aufgaben");

  const table = tasksTable(page);
  await expect(table.locator("tbody tr")).toHaveCount(10);
  await expect(table.getByRole("button", { name: /^Bearbeiten: / })).toHaveCount(10);
  await expect(page.getByRole("button", { name: /^Löschen/ })).toHaveCount(0);

  // Dieselbe Sitzung (Cookie aus dem Browser), Aufruf direkt an die API.
  const id = seedTaskId(0);
  const res = await callApi(page, "DELETE", `/api/tasks/${id}`);
  expect(res.status).toBe(403);
  expect(res.body).toEqual({ error: expect.any(String) });

  // Die Aufgabe ist noch da.
  const stillThere = await callApi(page, "GET", `/api/tasks/${id}`);
  expect(stillThere.status).toBe(200);
  expect(stillThere.body).toMatchObject({ task: { title: seedTasks[0]?.title } });
});
