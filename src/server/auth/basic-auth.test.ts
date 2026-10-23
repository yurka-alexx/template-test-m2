// Staging-Schutz ohne Datenbank: /healthz antwortet hier mit 503, wichtig ist nur, dass es nicht 401 ist.
// /healthz mit 200 ohne Anmeldung prüft app.test.ts gegen Postgres.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../app.ts";
import { createDb } from "../db/index.ts";
import { testAppEnv, unreachableDatabaseUrl } from "../test-helpers.ts";

const dead = createDb(unreachableDatabaseUrl);
let clientDir: string;

const indexHtml = '<!doctype html><div id="root"></div>';
const credentials = { BASIC_AUTH_USER: "staging", BASIC_AUTH_PASSWORD: "staging-passwort" };

beforeAll(async () => {
  clientDir = await mkdtemp(join(tmpdir(), "basic-auth-test-"));
  await writeFile(join(clientDir, "index.html"), indexHtml);
});

afterAll(async () => {
  await rm(clientDir, { recursive: true, force: true });
  await dead.client.end({ timeout: 1 });
});

const protectedApp = () =>
  createApp({ db: dead.db, env: { ...testAppEnv, ...credentials }, clientDir });
const openApp = (env = {}) => createApp({ db: dead.db, env: { ...testAppEnv, ...env }, clientDir });

const basic = (user: string, password: string) => ({
  Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
});
const valid = basic(credentials.BASIC_AUTH_USER, credentials.BASIC_AUTH_PASSWORD);

async function expectChallenge(res: Response) {
  expect(res.status).toBe(401);
  expect(res.headers.get("www-authenticate")).toBe('Basic realm="Staging"');
  expect(await res.json()).toEqual({ error: "Zugang nur mit Basic Auth" });
}

describe("mit BASIC_AUTH_USER und BASIC_AUTH_PASSWORD", () => {
  test("GET / ohne Anmeldung: 401 mit WWW-Authenticate, kein index.html", async () => {
    await expectChallenge(await protectedApp().request("/"));
  });

  test("GET / mit richtiger Anmeldung: 200 und index.html", async () => {
    const res = await protectedApp().request("/", { headers: valid });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(indexHtml);
  });

  test("falscher Benutzer, falsches Passwort oder kaputter Header: 401", async () => {
    for (const headers of [
      basic("fremd", credentials.BASIC_AUTH_PASSWORD),
      basic(credentials.BASIC_AUTH_USER, "falsches-passwort"),
      basic(credentials.BASIC_AUTH_USER, ""),
      { Authorization: "Basic kein-base64!" },
      { Authorization: `Bearer ${credentials.BASIC_AUTH_PASSWORD}` },
    ]) {
      await expectChallenge(await protectedApp().request("/", { headers }));
    }
  });

  test("GET /healthz kommt ohne Anmeldung zum Healthcheck", async () => {
    const res = await protectedApp().request("/healthz");
    expect(res.status).not.toBe(401);
    expect(res.headers.get("www-authenticate")).toBeNull();
    expect(await res.json()).toEqual({ error: "Datenbank nicht erreichbar" });
  });

  test("ausgenommen ist nur genau GET /healthz", async () => {
    await expectChallenge(await protectedApp().request("/healthz", { method: "POST" }));
    await expectChallenge(await protectedApp().request("/healthz/"));
  });

  test("schützt auch /api/*, /probe und Client-Routen, noch vor der App-Anmeldung", async () => {
    for (const path of ["/api/auth/me", "/api/tasks", "/probe", "/login", "/gibt-es-nicht"]) {
      await expectChallenge(await protectedApp().request(path));
    }
    await expectChallenge(
      await protectedApp().request("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: testAppEnv.APP_URL },
        body: JSON.stringify({ email: "a@example.test", password: "egal-egal-egal" }),
      }),
    );
  });

  test("mit Basic Auth geht es zur App-Anmeldung weiter (Sitzung fehlt: 401 ohne WWW-Authenticate)", async () => {
    for (const path of ["/api/auth/me", "/probe"]) {
      const res = await protectedApp().request(path, { headers: valid });
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBeNull();
      expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
    }
  });

  test("CSRF-Prüfung greift weiterhin hinter Basic Auth", async () => {
    const res = await protectedApp().request("/api/auth/logout", {
      method: "POST",
      headers: { ...valid, "Content-Type": "application/json", Origin: "https://fremd.example" },
    });
    expect(res.status).toBe(403);
  });
});

describe("ohne BASIC_AUTH_USER und BASIC_AUTH_PASSWORD", () => {
  test("GET / liefert index.html ohne Anmeldung wie bisher", async () => {
    for (const env of [{}, { BASIC_AUTH_USER: undefined, BASIC_AUTH_PASSWORD: undefined }]) {
      const res = await openApp(env).request("/");
      expect(res.status).toBe(200);
      expect(res.headers.get("www-authenticate")).toBeNull();
      expect(await res.text()).toBe(indexHtml);
    }
  });

  test("API und /probe antworten wie bisher mit der App-Anmeldung", async () => {
    for (const path of ["/api/auth/me", "/probe"]) {
      const res = await openApp().request(path);
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toBeNull();
      expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
    }
  });

  test("ein mitgeschickter Authorization-Header stört nicht", async () => {
    const res = await openApp().request("/", { headers: basic("egal", "egal") });
    expect(res.status).toBe(200);
  });

  test("nur eine der beiden Variablen schaltet den Schutz nicht ein", async () => {
    // Das Env-Schema lässt das beim Start gar nicht zu, die Middleware bleibt trotzdem aus.
    for (const env of [
      { BASIC_AUTH_USER: credentials.BASIC_AUTH_USER },
      { BASIC_AUTH_PASSWORD: credentials.BASIC_AUTH_PASSWORD },
    ]) {
      expect((await openApp(env).request("/")).status).toBe(200);
    }
  });
});
