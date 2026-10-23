import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { createApp } from "./app.ts";
import { createDb } from "./db/index.ts";
import { defaultClientDir, serveClient } from "./static.ts";
import { testAppEnv, unreachableDatabaseUrl } from "./test-helpers.ts";

// Ohne Datenbank: Die Auslieferung braucht keine, /healthz antwortet dann eben mit 503.
const dead = createDb(unreachableDatabaseUrl);
let base: string;
let clientDir: string;

const indexHtml = '<!doctype html><div id="root"></div><!-- index -->';

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), "static-test-"));
  clientDir = join(base, "client");
  await mkdir(join(clientDir, "assets"), { recursive: true });
  await writeFile(join(clientDir, "index.html"), indexHtml);
  await writeFile(join(clientDir, "assets", "app.js"), "console.log('app');");
  // Liegt neben dem Client-Ordner und darf nie ausgeliefert werden.
  await writeFile(join(base, "geheim.txt"), "GEHEIM");
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
  await dead.client.end({ timeout: 1 });
});

const app = () => createApp({ db: dead.db, env: testAppEnv, clientDir });

describe("Auslieferung der Oberfläche", () => {
  test("/ liefert index.html", async () => {
    const res = await app().request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("text/html");
    expect(await res.text()).toBe(indexHtml);
  });

  test("direkter Aufruf einer Client-Route lädt index.html (SPA-Fallback)", async () => {
    for (const path of ["/login", "/aufgaben/123/bearbeiten", "/login?redirect=%2F"]) {
      const res = await app().request(path);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(indexHtml);
    }
  });

  test("vorhandene Dateien kommen direkt mit passendem Typ", async () => {
    const res = await app().request("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
    expect(await res.text()).toBe("console.log('app');");
  });

  test("/api/* bleibt bei der API: unbekannte Route ist 404 als JSON", async () => {
    for (const path of ["/api", "/api/gibt-es-nicht", "/api/auth/gibt-es-nicht"]) {
      const res = await app().request(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Nicht gefunden" });
    }
  });

  test("/healthz bleibt beim Healthcheck", async () => {
    const res = await app().request("/healthz");
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toStartWith("application/json");
  });

  test("/probe bleibt beim Server: ohne Sitzung 401 als JSON, nie index.html", async () => {
    for (const method of ["GET", "HEAD"]) {
      const res = await app().request("/probe", { method });
      expect(res.status).toBe(401);
      expect(res.headers.get("content-type")).toStartWith("application/json");
    }
    expect(await (await app().request("/probe")).json()).toEqual({ error: "Nicht angemeldet" });
  });

  test("/probe/ und /healthz/ mit Schrägstrich am Ende bekommen nie index.html", async () => {
    for (const path of ["/probe/", "/probe//", "/healthz/", "/api/"]) {
      for (const method of ["GET", "HEAD"]) {
        const res = await app().request(path, { method });
        expect({ path, method, type: res.headers.get("content-type") }).toEqual({
          path,
          method,
          type: expect.stringMatching(/^application\/json/),
        });
      }
      expect(await (await app().request(path)).text()).not.toBe(indexHtml);
    }
  });

  test("serveClient selbst lässt /probe aus, auch ohne Route davor", async () => {
    // Ohne die Probe-Route fiele /probe sonst in den SPA-Fallback.
    const bare = new Hono().use("*", serveClient(clientDir));
    for (const path of ["/probe", "/probe/", "/healthz", "/healthz/", "/api/tasks"]) {
      const res = await bare.request(path);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toBe(indexHtml);
    }
  });

  test("ändernde Anfragen außerhalb von /api bekommen nicht index.html", async () => {
    const res = await app().request("/login", {
      method: "POST",
      headers: { Origin: testAppEnv.APP_URL },
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Nicht gefunden" });
  });

  test("Pfade aus dem Ordner heraus liefern keine fremden Dateien", async () => {
    for (const path of ["/../geheim.txt", "/%2e%2e/geheim.txt", "/assets/..%2f..%2fgeheim.txt"]) {
      const res = await app().request(path);
      expect(await res.text()).not.toContain("GEHEIM");
    }
  });

  test("ohne gebaute Oberfläche antwortet die App mit 404 als JSON", async () => {
    const res = await createApp({
      db: dead.db,
      env: testAppEnv,
      clientDir: join(base, "fehlt"),
    }).request("/login");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Nicht gefunden" });
  });

  test("der Server nutzt dist/client, das Ziel von bun run build", () => {
    expect(defaultClientDir).toEndWith(join("dist", "client"));
  });
});
