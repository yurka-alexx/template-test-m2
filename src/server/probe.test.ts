import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createApp } from "./app.ts";
import type { Db } from "./db/index.ts";
import { type ProbeCheckDefinition, probeChecks, runProbe } from "./probe.ts";
import {
  createTestUser,
  loginToken,
  migratedTestDb,
  resetAuthTables,
  testAppEnv,
} from "./test-helpers.ts";

describe("runProbe", () => {
  const check = (name: string, ok: boolean, detail?: string): ProbeCheckDefinition => ({
    name,
    run: async () => (detail === undefined ? { ok } : { ok, detail }),
  });

  test("der Starter hat keine Checks, das Ergebnis ist ok", async () => {
    expect(probeChecks).toEqual([]);
    expect(await runProbe()).toEqual({ ok: true, checks: [] });
  });

  test("alle Checks ok: ok ist wahr, Ergebnisse in Reihenfolge der Liste", async () => {
    expect(await runProbe([check("mail", true), check("speicher", true, "3 ms")])).toEqual({
      ok: true,
      checks: [
        { name: "mail", ok: true },
        { name: "speicher", ok: true, detail: "3 ms" },
      ],
    });
  });

  test("ein Check nicht ok: ok ist falsch", async () => {
    const result = await runProbe([check("mail", true), check("speicher", false, "Timeout")]);
    expect(result.ok).toBe(false);
    expect(result.checks[1]).toEqual({ name: "speicher", ok: false, detail: "Timeout" });
  });

  test("ein Check, der wirft, gilt als nicht ok und die übrigen laufen weiter", async () => {
    const boom: ProbeCheckDefinition = {
      name: "kaputt",
      run: async () => {
        throw new Error("Verbindung abgelehnt");
      },
    };
    const result = await runProbe([boom, check("mail", true)]);
    expect(result).toEqual({
      ok: false,
      checks: [
        { name: "kaputt", ok: false, detail: "Verbindung abgelehnt" },
        { name: "mail", ok: true },
      ],
    });
  });
});

describe("GET /probe", () => {
  let db: Db;
  let end: () => Promise<void>;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    const conn = await migratedTestDb();
    db = conn.db;
    end = () => conn.client.end({ timeout: 1 });
    app = createApp({ db, env: testAppEnv });
  });
  afterAll(() => end?.());
  beforeEach(() => resetAuthTables(db));

  const probe = (token?: string) =>
    app.request("/probe", { headers: token ? { Cookie: `sid=${token}` } : {} });

  test("als Admin: 200 mit genau {ok: true, checks: []}", async () => {
    const admin = await createTestUser(db, "admin");
    const res = await probe(await loginToken(app, admin.email));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toStartWith("application/json");
    expect(await res.json()).toEqual({ ok: true, checks: [] });
  });

  test("ohne Anmeldung: 401 im Fehlerformat", async () => {
    const res = await probe();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
  });

  test("mit unbekanntem Token: 401 im Fehlerformat", async () => {
    const res = await probe("gibt-es-nicht");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Nicht angemeldet" });
  });

  test("als benutzer: 403 im Fehlerformat", async () => {
    const benutzer = await createTestUser(db, "benutzer");
    const res = await probe(await loginToken(app, benutzer.email));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Keine Berechtigung" });
  });
});
