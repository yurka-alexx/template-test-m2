import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import type { ApiErrorBody } from "../../shared/api-error.ts";
import { type AppDeps, createApp } from "../app.ts";
import { sessions, users } from "../db/schema.ts";
import {
  createTestUser,
  migratedTestDb,
  resetAuthTables,
  setCookieHeader,
  testAppEnv,
  testPassword,
} from "../test-helpers.ts";
import { requireRole } from "./middleware.ts";
import { hashSessionToken, SESSION_DURATION_MS } from "./session.ts";

const { db, client } = await migratedTestDb();
afterAll(() => client.end({ timeout: 1 }));
beforeEach(() => resetAuthTables(db));

const foreignOrigin = "https://boese.example";
const DAY_MS = 24 * 60 * 60 * 1000;

function testApp(env: Partial<AppDeps["env"]> = {}) {
  const app = createApp({ db, env: { ...testAppEnv, ...env } });
  // Testroute für requireRole, echte Admin-Routen kommen mit Ticket 3.
  app.get("/api/test/admin", requireRole("admin"), (c) => c.json({ ok: true }, 200));
  return app;
}

function login(
  app: ReturnType<typeof testApp>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Meldet an und gibt das Token aus dem Cookie zurück. */
async function loginToken(app: ReturnType<typeof testApp>, email: string) {
  const res = await login(app, { email, password: testPassword });
  expect(res.status).toBe(200);
  const header = setCookieHeader(res, "sid") ?? "";
  return header.split(";")[0]?.slice("sid=".length) ?? "";
}

const withSession = (token: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...(init.headers as Record<string, string>), Cookie: `sid=${token}` },
});

async function sessionRows() {
  return db.select().from(sessions);
}

describe("POST /api/auth/login", () => {
  beforeEach(() => createTestUser(db, "admin", "admin@example.test"));

  test("setzt Cookie sid mit HttpOnly, SameSite=Lax, Path=/ und speichert nur den Hash", async () => {
    const res = await login(testApp(), { email: "admin@example.test", password: testPassword });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user).toMatchObject({ email: "admin@example.test", role: "admin" });
    expect(body.user).not.toHaveProperty("passwordHash");

    const header = setCookieHeader(res, "sid") ?? "";
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Secure");

    const token = header.split(";")[0]?.slice("sid=".length) ?? "";
    expect(token.length).toBeGreaterThanOrEqual(43);
    const rows = await sessionRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(hashSessionToken(token));
    expect(rows[0]?.id).not.toContain(token);

    const expiresIn = (rows[0]?.expiresAt.getTime() ?? 0) - Date.now();
    expect(Math.abs(expiresIn - SESSION_DURATION_MS)).toBeLessThan(60_000);
  });

  test("setzt Secure bei NODE_ENV=production", async () => {
    const res = await login(testApp({ NODE_ENV: "production" }), {
      email: "admin@example.test",
      password: testPassword,
    });
    expect(setCookieHeader(res, "sid")).toContain("Secure");
  });

  test("findet die E-Mail unabhängig von Groß- und Kleinschreibung", async () => {
    const res = await login(testApp(), { email: " Admin@Example.TEST", password: testPassword });
    expect(res.status).toBe(200);
  });

  test("falsches Passwort: 401 im Fehlerformat, kein Cookie, keine Sitzung", async () => {
    const res = await login(testApp(), { email: "admin@example.test", password: "falsch-falsch" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "E-Mail oder Passwort falsch" });
    expect(setCookieHeader(res, "sid")).toBeUndefined();
    expect(await sessionRows()).toHaveLength(0);
  });

  test("unbekannte E-Mail: dieselbe 401 wie bei falschem Passwort", async () => {
    const res = await login(testApp(), { email: "niemand@example.test", password: testPassword });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "E-Mail oder Passwort falsch" });
  });

  test("ungültige Eingabe: 400 mit Feldfehlern", async () => {
    const res = await login(testApp(), { email: "keine-mail" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(Object.keys(body.fields ?? {}).sort()).toEqual(["email", "password"]);
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(() => createTestUser(db, "benutzer"));

  test("ohne Sitzung: 401 im Fehlerformat", async () => {
    const res = await testApp().request("/api/auth/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
  });

  test("mit Sitzung: liefert den Benutzer ohne Passwort-Hash", async () => {
    const app = testApp();
    const token = await loginToken(app, "benutzer@example.test");
    const res = await app.request("/api/auth/me", withSession(token));
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as { user: Record<string, unknown> };
    expect(Object.keys(user).sort()).toEqual(["email", "id", "name", "role"]);
    expect(user.role).toBe("benutzer");
  });

  test("unbekanntes Token: 401 und Cookie wird gelöscht", async () => {
    const res = await testApp().request("/api/auth/me", withSession("gibt-es-nicht"));
    expect(res.status).toBe(401);
    expect(setCookieHeader(res, "sid")).toContain("Max-Age=0");
  });

  test("abgelaufene Sitzung: 401, Eintrag wird gelöscht", async () => {
    const app = testApp();
    const token = await loginToken(app, "benutzer@example.test");
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });

    const res = await app.request("/api/auth/me", withSession(token));
    expect(res.status).toBe(401);
    expect(await sessionRows()).toHaveLength(0);
  });

  test("nach der halben Laufzeit wird die Sitzung auf 7 Tage verlängert und das Cookie neu gesetzt", async () => {
    const app = testApp();
    const token = await loginToken(app, "benutzer@example.test");
    await db.update(sessions).set({ expiresAt: new Date(Date.now() + 3 * DAY_MS) });

    const res = await app.request("/api/auth/me", withSession(token));
    expect(res.status).toBe(200);
    const [row] = await sessionRows();
    const expiresIn = (row?.expiresAt.getTime() ?? 0) - Date.now();
    expect(Math.abs(expiresIn - SESSION_DURATION_MS)).toBeLessThan(60_000);
    const header = setCookieHeader(res, "sid") ?? "";
    expect(header).toStartWith(`sid=${token};`);
    expect(header).toContain("HttpOnly");
  });

  test("vor der halben Laufzeit bleibt die Sitzung unverändert", async () => {
    const app = testApp();
    const token = await loginToken(app, "benutzer@example.test");
    const fourDays = new Date(Date.now() + 4 * DAY_MS);
    await db.update(sessions).set({ expiresAt: fourDays });

    const res = await app.request("/api/auth/me", withSession(token));
    expect(res.status).toBe(200);
    expect(setCookieHeader(res, "sid")).toBeUndefined();
    const [row] = await sessionRows();
    expect(row?.expiresAt.getTime()).toBe(fourDays.getTime());
  });

  test("Löschen des Benutzers löscht seine Sitzungen (on delete cascade)", async () => {
    const app = testApp();
    await loginToken(app, "benutzer@example.test");
    await db.delete(users).where(eq(users.email, "benutzer@example.test"));
    expect(await sessionRows()).toHaveLength(0);
  });
});

describe("POST /api/auth/logout", () => {
  // Browser schicken bei POST immer Origin mit. Ohne Body und Origin lehnt Hono csrf() ab (siehe CSRF).
  const sameOriginPost = { method: "POST", headers: { Origin: testAppEnv.APP_URL } };
  beforeEach(() => createTestUser(db, "benutzer"));

  test("löscht den Eintrag in sessions und das Cookie", async () => {
    const app = testApp();
    const token = await loginToken(app, "benutzer@example.test");
    expect(await sessionRows()).toHaveLength(1);

    const res = await app.request("/api/auth/logout", withSession(token, sameOriginPost));
    expect(res.status).toBe(204);
    expect(setCookieHeader(res, "sid")).toContain("Max-Age=0");
    expect(await sessionRows()).toHaveLength(0);

    const me = await app.request("/api/auth/me", withSession(token));
    expect(me.status).toBe(401);
  });

  test("ohne Sitzung: 204", async () => {
    const res = await testApp().request("/api/auth/logout", sameOriginPost);
    expect(res.status).toBe(204);
  });
});

describe("CSRF: Origin gegen APP_URL", () => {
  beforeEach(() => createTestUser(db, "benutzer"));
  const credentials = { email: "benutzer@example.test", password: testPassword };

  test("JSON-Anfrage mit fremdem Origin: 403 im Fehlerformat, keine Sitzung", async () => {
    const res = await login(testApp(), credentials, { Origin: foreignOrigin });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Anfrage von fremder Herkunft abgelehnt" });
    expect(await sessionRows()).toHaveLength(0);
  });

  test("Formular-Anfrage mit fremdem Origin: 403", async () => {
    const res = await testApp().request("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: foreignOrigin },
      body: "a=1",
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as ApiErrorBody).error).toBe(
      "Anfrage von fremder Herkunft abgelehnt",
    );
  });

  test("POST ohne Body und ohne Origin: 403 (Hono csrf wertet ihn als text/plain)", async () => {
    const res = await testApp().request("/api/auth/logout", { method: "POST" });
    expect(res.status).toBe(403);
  });

  test("Formular-Anfrage ohne Origin: 403 (Hono csrf)", async () => {
    const res = await testApp().request("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "x",
    });
    expect(res.status).toBe(403);
  });

  test("Logout mit fremdem Origin lässt die Sitzung bestehen", async () => {
    const app = testApp();
    const token = await loginToken(app, "benutzer@example.test");
    const res = await app.request(
      "/api/auth/logout",
      withSession(token, { method: "POST", headers: { Origin: foreignOrigin } }),
    );
    expect(res.status).toBe(403);
    expect(await sessionRows()).toHaveLength(1);
  });

  test("Origin gleich APP_URL wird durchgelassen", async () => {
    const res = await login(testApp(), credentials, { Origin: testAppEnv.APP_URL });
    expect(res.status).toBe(200);
  });

  test("Sec-Fetch-Site: same-origin wird durchgelassen (z. B. über den Vite-Proxy)", async () => {
    const res = await login(testApp(), credentials, {
      Origin: "http://localhost:5173",
      "Sec-Fetch-Site": "same-origin",
    });
    expect(res.status).toBe(200);
  });

  test("lesende Anfrage mit fremdem Origin wird nicht abgelehnt", async () => {
    const res = await testApp().request("/api/auth/me", { headers: { Origin: foreignOrigin } });
    expect(res.status).toBe(401);
  });
});

describe("requireRole('admin')", () => {
  let app: ReturnType<typeof testApp>;
  beforeAll(() => {
    app = testApp();
  });
  beforeEach(async () => {
    await createTestUser(db, "admin");
    await createTestUser(db, "benutzer");
  });

  test("Benutzer mit Rolle benutzer: 403 im Fehlerformat", async () => {
    const token = await loginToken(app, "benutzer@example.test");
    const res = await app.request("/api/test/admin", withSession(token));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
  });

  test("Admin: 200", async () => {
    const token = await loginToken(app, "admin@example.test");
    const res = await app.request("/api/test/admin", withSession(token));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("ohne Sitzung: 401", async () => {
    const res = await app.request("/api/test/admin");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
  });
});
