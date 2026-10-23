import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { ApiErrorBody } from "../../shared/api-error.ts";
import type { Task, TaskList } from "../../shared/schemas/task.ts";
import type { PublicUser } from "../../shared/schemas/user.ts";
import { createApp } from "../app.ts";
import { tasks } from "../db/schema.ts";
import { addDays, seed, seedTaskId, seedTasks } from "../db/seed.ts";
import {
  createTestUser,
  loginToken,
  migratedTestDb,
  resetAuthTables,
  resetTaskTables,
  testAppEnv,
} from "../test-helpers.ts";

const { db, client } = await migratedTestDb();
afterAll(() => client.end({ timeout: 1 }));

const app = createApp({ db, env: testAppEnv });
const unknownId = "11111111-1111-4111-8111-111111111111";

let admin: PublicUser;
let benutzer: PublicUser;
let adminToken: string;
let userToken: string;

beforeEach(async () => {
  await resetTaskTables(db);
  await resetAuthTables(db);
  admin = await createTestUser(db, "admin");
  benutzer = await createTestUser(db, "benutzer");
  adminToken = await loginToken(app, admin.email);
  userToken = await loginToken(app, benutzer.email);
});

/** Anfrage an die API wie aus dem Browser: Sitzungs-Cookie, Origin gleich APP_URL, JSON. */
function api(token: string | null, path: string, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { Origin: testAppEnv.APP_URL };
  if (token) headers.Cookie = `sid=${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(path, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function createTask(token: string, body: unknown): Promise<Task> {
  const res = await api(token, "/api/tasks", { method: "POST", body });
  expect(res.status).toBe(201);
  return ((await res.json()) as { task: Task }).task;
}

async function list(query: string, token = adminToken): Promise<TaskList> {
  const res = await api(token, `/api/tasks${query}`);
  expect(res.status).toBe(200);
  return (await res.json()) as TaskList;
}

const titles = (result: TaskList) => result.items.map((t) => t.title);

describe("ohne Anmeldung", () => {
  const cases = [
    ["GET", "/api/tasks"],
    ["GET", `/api/tasks/${unknownId}`],
    ["POST", "/api/tasks"],
    ["PATCH", `/api/tasks/${unknownId}`],
    ["DELETE", `/api/tasks/${unknownId}`],
  ] as const;

  for (const [method, path] of cases) {
    test(`${method} ${path.replace(unknownId, ":id")}: 401 im Fehlerformat`, async () => {
      const body = method === "POST" || method === "PATCH" ? { title: "x" } : undefined;
      const res = await api(null, path, { method, body });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
    });
  }

  test("POST legt nichts an", async () => {
    await api(null, "/api/tasks", { method: "POST", body: { title: "Ohne Sitzung" } });
    expect((await list("")).total).toBe(0);
  });
});

describe("als Admin: anlegen, lesen, ändern, löschen", () => {
  test("POST legt an (201) mit Standardwerten und dem Admin als Ersteller", async () => {
    const task = await createTask(adminToken, { title: "  Erste Aufgabe  " });
    expect(task).toMatchObject({
      title: "Erste Aufgabe",
      description: null,
      status: "offen",
      priority: "mittel",
      dueDate: null,
      createdBy: admin.id,
    });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(task.createdAt)).not.toBeNaN();
  });

  test("POST übernimmt alle Felder", async () => {
    const body = {
      title: "Mit allem",
      description: "Beschreibung",
      status: "in_arbeit",
      priority: "hoch",
      dueDate: "2026-12-24",
    };
    expect(await createTask(adminToken, body)).toMatchObject(body);
  });

  test("GET /:id liefert die Aufgabe", async () => {
    const created = await createTask(adminToken, { title: "Lesen" });
    const res = await api(adminToken, `/api/tasks/${created.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { task: Task }).task).toEqual(created);
  });

  test("PATCH ändert nur die gesendeten Felder und setzt updated_at neu", async () => {
    const created = await createTask(adminToken, {
      title: "Vorher",
      description: "bleibt",
      dueDate: "2026-11-01",
    });
    const before = new Date(Date.now() - 60_000);
    await db.update(tasks).set({ updatedAt: before }).where(eq(tasks.id, created.id));
    const res = await api(adminToken, `/api/tasks/${created.id}`, {
      method: "PATCH",
      body: { title: "Nachher", status: "erledigt" },
    });
    expect(res.status).toBe(200);
    const { task } = (await res.json()) as { task: Task };
    expect(task).toMatchObject({
      id: created.id,
      title: "Nachher",
      status: "erledigt",
      description: "bleibt",
      priority: "mittel",
      dueDate: "2026-11-01",
      createdAt: created.createdAt,
    });
    expect(Date.parse(task.updatedAt)).toBeGreaterThan(before.getTime() + 30_000);
  });

  test("PATCH mit null oder leerem Text entfernt Fälligkeit und Beschreibung", async () => {
    const created = await createTask(adminToken, {
      title: "Leeren",
      description: "weg",
      dueDate: "2026-11-01",
    });
    const res = await api(adminToken, `/api/tasks/${created.id}`, {
      method: "PATCH",
      body: { description: "", dueDate: null },
    });
    expect(((await res.json()) as { task: Task }).task).toMatchObject({
      description: null,
      dueDate: null,
    });
  });

  test("DELETE löscht (204), danach 404", async () => {
    const created = await createTask(adminToken, { title: "Weg damit" });
    const res = await api(adminToken, `/api/tasks/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect((await api(adminToken, `/api/tasks/${created.id}`)).status).toBe(404);
    expect((await api(adminToken, `/api/tasks/${created.id}`, { method: "DELETE" })).status).toBe(
      404,
    );
  });
});

describe("als Benutzer", () => {
  test("darf lesen, anlegen und bearbeiten", async () => {
    const created = await createTask(userToken, { title: "Vom Benutzer" });
    expect(created.createdBy).toBe(benutzer.id);

    const fromAdmin = await createTask(adminToken, { title: "Vom Admin" });
    const read = await api(userToken, `/api/tasks/${fromAdmin.id}`);
    expect(read.status).toBe(200);
    expect(titles(await list("?sort=title", userToken))).toEqual(["Vom Admin", "Vom Benutzer"]);

    const patched = await api(userToken, `/api/tasks/${fromAdmin.id}`, {
      method: "PATCH",
      body: { priority: "hoch" },
    });
    expect(patched.status).toBe(200);
    expect(((await patched.json()) as { task: Task }).task.priority).toBe("hoch");
  });

  test("DELETE direkt an die API: 403 im Fehlerformat, die Aufgabe bleibt (AK10)", async () => {
    const created = await createTask(adminToken, { title: "Bleibt" });
    const res = await api(userToken, `/api/tasks/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
    expect((await api(adminToken, `/api/tasks/${created.id}`)).status).toBe(200);
  });

  test("DELETE auf eine unbekannte Aufgabe: ebenfalls 403, die Rolle wird zuerst geprüft", async () => {
    const res = await api(userToken, `/api/tasks/${unknownId}`, { method: "DELETE" });
    expect(res.status).toBe(403);
  });
});

describe("Validierung (AE3, API-Teil)", () => {
  async function postFields(body: unknown) {
    const res = await api(adminToken, "/api/tasks", { method: "POST", body });
    expect(res.status).toBe(400);
    const json = (await res.json()) as ApiErrorBody;
    expect(json.error).toBe("Ungültige Eingabe");
    return json.fields ?? {};
  }

  test("ohne Titel: 400 mit Feldfehler fields.title, nichts angelegt", async () => {
    expect(await postFields({ priority: "hoch" })).toEqual({ title: ["fehlt"] });
    expect((await list("")).total).toBe(0);
  });

  test("leerer oder nur aus Leerzeichen bestehender Titel: 400 mit fields.title", async () => {
    expect(await postFields({ title: "" })).toEqual({ title: ["fehlt"] });
    expect(await postFields({ title: "   " })).toEqual({ title: ["fehlt"] });
  });

  test("Titel über 200 Zeichen: 400 mit fields.title, 200 Zeichen gehen", async () => {
    expect(await postFields({ title: "x".repeat(201) })).toEqual({
      title: ["darf höchstens 200 Zeichen lang sein"],
    });
    expect((await createTask(adminToken, { title: "x".repeat(200) })).title).toHaveLength(200);
  });

  test("unbekannter Status, unbekannte Priorität und falsches Datum: Feldfehler je Feld", async () => {
    const fields = await postFields({
      title: "ok",
      status: "fertig",
      priority: "dringend",
      dueDate: "24.12.2026",
    });
    expect(Object.keys(fields).sort()).toEqual(["dueDate", "priority", "status"]);
  });

  test("PATCH ohne Felder oder mit leerem Titel: 400", async () => {
    const created = await createTask(adminToken, { title: "Bleibt so" });
    const empty = await api(adminToken, `/api/tasks/${created.id}`, { method: "PATCH", body: {} });
    expect(empty.status).toBe(400);
    const noTitle = await api(adminToken, `/api/tasks/${created.id}`, {
      method: "PATCH",
      body: { title: "" },
    });
    expect(noTitle.status).toBe(400);
    expect(((await noTitle.json()) as ApiErrorBody).fields).toEqual({ title: ["fehlt"] });
    const after = await api(adminToken, `/api/tasks/${created.id}`);
    expect(((await after.json()) as { task: Task }).task).toEqual(created);
  });

  test("ungültige Listenabfrage: 400 mit Feldfehlern", async () => {
    const res = await api(adminToken, "/api/tasks?page=0&pageSize=500&sort=wichtig&status=x");
    expect(res.status).toBe(400);
    const { fields } = (await res.json()) as ApiErrorBody;
    expect(Object.keys(fields ?? {}).sort()).toEqual(["page", "pageSize", "sort", "status"]);
  });
});

describe("unbekannte Aufgabe", () => {
  test("GET, PATCH und DELETE mit unbekannter ID: 404 im Fehlerformat", async () => {
    for (const method of ["GET", "PATCH", "DELETE"]) {
      const body = method === "PATCH" ? { title: "x" } : undefined;
      const res = await api(adminToken, `/api/tasks/${unknownId}`, { method, body });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Aufgabe nicht gefunden" });
    }
  });

  test("ID ist keine UUID: 404 statt Datenbankfehler", async () => {
    const res = await api(adminToken, "/api/tasks/keine-uuid");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/tasks mit den 30 Seed-Aufgaben (AE2, API-Teil)", () => {
  const today = new Date("2026-10-22T09:00:00Z");
  beforeEach(() => seed(db, { today, log: () => {} }));

  // Erwartung direkt aus den Seed-Daten: nach Fälligkeit, ohne Fälligkeit am Ende, sonst nach ID.
  const byDue = seedTasks
    .map((task, index) => ({ ...task, id: seedTaskId(index) }))
    .sort((a, b) => {
      if (a.dueInDays === b.dueInDays) return a.id < b.id ? -1 : 1;
      if (a.dueInDays === null) return 1;
      if (b.dueInDays === null) return -1;
      return a.dueInDays - b.dueInDays;
    });

  test("ohne Parameter: Seite 1 mit 10 Einträgen und Gesamtzahl 30", async () => {
    const result = await list("");
    expect(result).toMatchObject({ total: 30, page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(10);
    // Standard: neueste zuerst. Der Seed staffelt created_at, die letzte Seed-Aufgabe ist die neueste.
    expect(result.items[0]?.title).toBe(seedTasks.at(-1)?.title);
  });

  test("sortiert nach Fälligkeit: Seite 1 und Seite 2 liefern die erwarteten Einträge", async () => {
    const page1 = await list("?sort=dueDate");
    expect(page1.total).toBe(30);
    expect(titles(page1)).toEqual(byDue.slice(0, 10).map((t) => t.title));
    expect(page1.items[0]?.dueDate).toBe(addDays(today, -20));

    const page2 = await list("?sort=dueDate&page=2");
    expect(page2).toMatchObject({ total: 30, page: 2 });
    expect(titles(page2)).toEqual(byDue.slice(10, 20).map((t) => t.title));

    const page3 = await list("?sort=dueDate&page=3");
    expect(titles(page3)).toEqual(byDue.slice(20, 30).map((t) => t.title));
    expect(page3.items.slice(-4).map((t) => t.dueDate)).toEqual([null, null, null, null]);
  });

  test("absteigend nach Fälligkeit: späteste zuerst, ohne Fälligkeit trotzdem am Ende", async () => {
    const all = await list("?sort=-dueDate&pageSize=30");
    const dates = all.items.map((t) => t.dueDate);
    expect(dates[0]).toBe(addDays(today, 40));
    expect(dates.slice(-4)).toEqual([null, null, null, null]);
    const withDate = dates.slice(0, 26) as string[];
    expect(withDate).toEqual([...withDate].sort().reverse());
  });

  test("gefiltert nach Status: nur passende Einträge, Gesamtzahl der Treffer, Seite 2", async () => {
    const done = await list("?status=erledigt&sort=title");
    const expectedDone = seedTasks.filter((t) => t.status === "erledigt").map((t) => t.title);
    expect(done.total).toBe(7);
    expect(done.items.every((t) => t.status === "erledigt")).toBeTrue();
    expect(titles(done).sort()).toEqual([...expectedDone].sort());

    const open = await list("?status=offen&sort=dueDate");
    expect(open.total).toBe(13);
    expect(open.items).toHaveLength(10);
    const openPage2 = await list("?status=offen&sort=dueDate&page=2");
    const expectedOpen = byDue.filter((t) => t.status === "offen").map((t) => t.title);
    expect(titles(openPage2)).toEqual(expectedOpen.slice(10));
    expect(openPage2).toMatchObject({ total: 13, page: 2 });

    expect((await list("?status=offen&status=erledigt")).total).toBe(20);
  });

  test("gefiltert nach Priorität und kombiniert mit Status", async () => {
    expect((await list("?priority=hoch")).total).toBe(8);
    const combined = await list("?priority=hoch&status=in_arbeit&pageSize=30");
    const expected = seedTasks.filter((t) => t.priority === "hoch" && t.status === "in_arbeit");
    expect(combined.total).toBe(expected.length);
    expect(titles(combined).sort()).toEqual(expected.map((t) => t.title).sort());
  });

  test("Suchtext findet in Titel und Beschreibung, ohne Groß- und Kleinschreibung", async () => {
    const result = await list("?q=TESTSYSTEM&sort=title");
    expect(titles(result)).toEqual(["Schulung Testsystem", "Serverkosten vergleichen"]);
    expect(result.total).toBe(2);
    expect((await list("?q=pr%C3%BCfen")).total).toBe(3);
  });

  test("Suchtext: % und _ gelten wörtlich, leerer Suchtext filtert nicht", async () => {
    expect((await list("?q=%25")).total).toBe(0);
    expect((await list("?q=_")).total).toBe(0);
    expect((await list("?q=")).total).toBe(30);
  });

  test("sortiert nach Titel auf- und absteigend", async () => {
    const expected = seedTasks.map((t) => t.title).sort((a, b) => a.localeCompare(b, "de"));
    expect(titles(await list("?sort=title&pageSize=30"))).toEqual(expected);
    expect(titles(await list("?sort=-title&pageSize=30"))).toEqual([...expected].reverse());
  });

  test("sortiert nach Priorität: hoch vor mittel vor niedrig", async () => {
    const all = await list("?sort=-priority&pageSize=30");
    const priorities = all.items.map((t) => t.priority);
    expect(priorities.slice(0, 8).every((p) => p === "hoch")).toBeTrue();
    expect(priorities.at(-1)).toBe("niedrig");
  });

  test("Seite hinter dem Ende: leere Liste, Gesamtzahl bleibt", async () => {
    const result = await list("?page=4");
    expect(result.items).toEqual([]);
    expect(result.total).toBe(30);
  });
});
