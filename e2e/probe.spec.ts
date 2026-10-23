// AE6: /probe antwortet als Admin mit {ok: true, checks: []} und ohne Anmeldung mit 401.
import { expect, test } from "@playwright/test";
import { callApi, login } from "./helpers.ts";

test("als Admin liefert /probe {ok: true, checks: []}", async ({ page }) => {
  await login(page, "admin");
  const res = await callApi(page, "GET", "/probe");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true, checks: [] });
});

test("ohne Anmeldung liefert /probe 401 im Fehlerformat", async ({ page }) => {
  // Eine Seite der App öffnen, damit der Aufruf von derselben Adresse kommt, aber ohne Sitzung.
  await page.goto("/login");
  const res = await callApi(page, "GET", "/probe");
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: expect.any(String) });
});
