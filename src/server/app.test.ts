import { afterAll, describe, expect, test } from "bun:test";
import { z } from "zod";
import type { ApiErrorBody } from "../shared/api-error.ts";
import { createApp } from "./app.ts";
import { createDb } from "./db/index.ts";
import { testAppEnv, testDatabaseUrl, unreachableDatabaseUrl } from "./test-helpers.ts";
import { validator } from "./validator.ts";

const live = createDb(testDatabaseUrl());
const dead = createDb(unreachableDatabaseUrl);

afterAll(async () => {
  await live.client.end({ timeout: 1 });
  await dead.client.end({ timeout: 1 });
});

// Eine Beispielroute nur für den Test: echte Routen kommen mit späteren Tickets.
function appWithTestRoutes() {
  const app = createApp({ db: live.db, env: testAppEnv });
  app.post(
    "/test/echo",
    validator(
      "json",
      z.object({ title: z.string().min(1), priority: z.enum(["niedrig", "hoch"]) }),
    ),
    (c) => c.json(c.req.valid("json"), 201),
  );
  app.get("/test/boom", () => {
    throw new Error("geheimes Detail");
  });
  return app;
}

function postJson(body: string) {
  return appWithTestRoutes().request("/test/echo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("Fehlerformat", () => {
  test("unbekannte Route liefert 404 mit {error}", async () => {
    const res = await appWithTestRoutes().request("/gibt-es-nicht");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Nicht gefunden" });
  });

  test("ungültige Eingabe an eine Route mit validator liefert 400 mit {error, fields}", async () => {
    const res = await postJson(JSON.stringify({ title: "", priority: "egal" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error).toBe("Ungültige Eingabe");
    expect(Object.keys(body.fields ?? {}).sort()).toEqual(["priority", "title"]);
    expect(body.fields?.title?.[0]).toBeString();
  });

  test("fehlendes Pflichtfeld erscheint in fields", async () => {
    const res = await postJson(JSON.stringify({ priority: "hoch" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.fields).toHaveProperty("title");
  });

  test("gültige Eingabe kommt beim Handler an", async () => {
    const res = await postJson(JSON.stringify({ title: "Test", priority: "hoch" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ title: "Test", priority: "hoch" });
  });

  test("kaputtes JSON liefert 400 mit {error} ohne fields", async () => {
    const res = await postJson("{kein json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error).toBeString();
    expect(body.fields).toBeUndefined();
  });

  test("unerwarteter Fehler liefert 500 mit {error} und ohne interne Details", async () => {
    const res = await appWithTestRoutes().request("/test/boom");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Interner Fehler" });
  });
});

describe("GET /healthz", () => {
  test("200, wenn Postgres auf select 1 antwortet", async () => {
    const res = await createApp({ db: live.db, env: testAppEnv }).request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("200 ohne Anmeldung auch mit Staging-Schutz (BASIC_AUTH_*)", async () => {
    const env = { ...testAppEnv, BASIC_AUTH_USER: "staging", BASIC_AUTH_PASSWORD: "geheim-genug" };
    const res = await createApp({ db: live.db, env }).request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  test("503, wenn die Datenbank nicht erreichbar ist", async () => {
    const res = await createApp({ db: dead.db, env: testAppEnv }).request("/healthz");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Datenbank nicht erreichbar" });
  });
});
