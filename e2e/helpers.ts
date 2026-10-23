// Gemeinsame Helfer der Playwright-Specs: Adresse, Test-Konten aus dem Seed, Anmelden, API-Aufrufe.
import { expect, type Page } from "@playwright/test";
import { seedAccounts } from "../src/server/db/seed.ts";
import type { TaskList } from "../src/shared/schemas/task.ts";
import type { Role } from "../src/shared/schemas/user.ts";

/** Adresse der App wie im Server (`APP_URL`), Standard wie in `.env.example`. */
export const baseURL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Titel-Präfix aller Aufgaben, die Specs anlegen. `deleteE2eTasks` räumt sie weg. */
export const E2E_PREFIX = "E2E";

const passwordVariables: Record<Role, "SEED_ADMIN_PASSWORD" | "SEED_USER_PASSWORD"> = {
  admin: "SEED_ADMIN_PASSWORD",
  benutzer: "SEED_USER_PASSWORD",
};

/** Zugangsdaten des Test-Kontos. Die Passwörter kommen nur aus der Umgebung, nie aus dem Repo. */
export function account(role: Role) {
  const variable = passwordVariables[role];
  const password = process.env[variable];
  if (!password) {
    throw new Error(
      `${variable} fehlt: Playwright braucht die Passwörter der Test-Konten (lokal in .env, ` +
        "je mindestens 12 Zeichen, siehe README.md, Abschnitt Playwright).",
    );
  }
  return { ...seedAccounts[role], password };
}

/**
 * Löscht alle Aufgaben mit Titel-Präfix `E2E_PREFIX` über die API (als Test-Admin, ohne Browser).
 * Läuft in global-setup.ts und nach Specs, die Aufgaben anlegen, damit ein abgebrochener Test
 * keine Reste hinterlässt, die die Erwartungen der Liste (30 Einträge) verschieben.
 */
export async function deleteE2eTasks() {
  const admin = account("admin");
  // `Origin` wie aus dem Browser, sonst lehnt der CSRF-Schutz das DELETE ohne Body ab.
  const headers = { Origin: baseURL, "Content-Type": "application/json" };
  const login = await fetch(`${baseURL}/api/auth/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: admin.email, password: admin.password }),
  });
  if (login.status !== 200) {
    throw new Error(
      `Anmeldung ${admin.email} fehlgeschlagen (${login.status}). Gibt es das Konto schon mit ` +
        "einem anderen Passwort? Der Seed ändert bestehende Konten nicht.",
    );
  }
  const cookie = login.headers.getSetCookie()[0]?.split(";")[0] ?? "";

  try {
    const list = await fetch(`${baseURL}/api/tasks?q=${E2E_PREFIX}&pageSize=100`, {
      headers: { cookie },
    });
    if (!list.ok) throw new Error(`Aufräumen: GET /api/tasks antwortet ${list.status}`);
    const { items } = (await list.json()) as TaskList;
    for (const task of items.filter((t) => t.title.startsWith(E2E_PREFIX))) {
      const res = await fetch(`${baseURL}/api/tasks/${task.id}`, {
        method: "DELETE",
        headers: { ...headers, cookie },
      });
      if (res.status !== 204) throw new Error(`Aufräumen: ${task.title} antwortet ${res.status}`);
    }
  } finally {
    await fetch(`${baseURL}/api/auth/logout`, { method: "POST", headers: { ...headers, cookie } });
  }
}

/** Meldet über die Anmeldeseite an und wartet auf die Startseite. */
export async function login(page: Page, role: Role) {
  const { email, password, name } = account(role);
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page.getByText(`Hallo ${name}`)).toBeVisible();
}

export type ApiResult = { status: number; body: unknown };

/**
 * Ruft die API direkt aus der Seite auf, also mit der Sitzung (Cookie) des angemeldeten Kontos,
 * aber ohne die Oberfläche. Der Browser setzt `Origin` selbst, wie bei jedem echten Aufruf.
 * Bewusst nicht `page.request`: das scheitert, wenn Playwright unter Bun statt Node läuft.
 */
export function callApi(page: Page, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ method, path, body }): Promise<ApiResult> => {
      const res = await fetch(path, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    { method, path, body },
  );
}

/** Tabelle „Aufgaben“ auf `/aufgaben`. */
export const tasksTable = (page: Page) => page.getByRole("table", { name: "Aufgaben" });

/** Titel der angezeigten Zeilen in Tabellen-Reihenfolge (erste Spalte). */
export const titleCells = (page: Page) => tasksTable(page).locator("tbody tr td:first-child");
