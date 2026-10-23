import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { users } from "./db/schema.ts";
import {
  migratedTestDb,
  resetAuthTables,
  spawnServer,
  testDatabaseUrl,
  unreachableDatabaseUrl,
  waitForAddress,
} from "./test-helpers.ts";

const baseEnv = { APP_URL: "http://localhost:3000", NODE_ENV: "test" };
// Bun-Start plus Migration kann auf langsamen CI-Runnern dauern, Buns Standard sind 5 Sekunden.
const START_TIMEOUT_MS = 20_000;

/** Startet den Server, wartet auf den offenen Port, beendet ihn wieder und gibt die Ausgabe zurück. */
async function startAndStop(env: Record<string, string>) {
  const proc = spawnServer({ ...baseEnv, DATABASE_URL: testDatabaseUrl(), PORT: "0", ...env });
  try {
    return await waitForAddress(proc.stdout);
  } finally {
    proc.kill();
    await proc.exited;
  }
}

describe("Serverstart", () => {
  test(
    "spielt Migrationen ein, öffnet danach den Port, /healthz antwortet 200",
    async () => {
      const { db, client } = await migratedTestDb();
      const proc = spawnServer({ ...baseEnv, DATABASE_URL: testDatabaseUrl(), PORT: "0" });
      try {
        const { address } = await waitForAddress(proc.stdout);
        const res = await fetch(`${address}/healthz`);
        expect(res.status).toBe(200);

        const rows = await db.execute(sql`select hash from drizzle.__drizzle_migrations`);
        expect(rows.length).toBeGreaterThanOrEqual(2);
      } finally {
        proc.kill();
        await proc.exited;
        await client.end({ timeout: 1 });
      }
    },
    START_TIMEOUT_MS,
  );

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    test(
      `beendet sich bei ${signal} mit Exit-Code 0 (Zeitplan, Port und Datenbank geschlossen)`,
      async () => {
        await migratedTestDb().then(({ client }) => client.end({ timeout: 1 }));
        const proc = spawnServer({ ...baseEnv, DATABASE_URL: testDatabaseUrl(), PORT: "0" });
        try {
          await waitForAddress(proc.stdout);
        } finally {
          proc.kill(signal);
        }
        expect(await proc.exited).toBe(0);
        expect(await new Response(proc.stderr).text()).toBe("");
      },
      START_TIMEOUT_MS,
    );
  }

  test("bricht ab, wenn die Datenbank nicht erreichbar ist, und nennt die Ursache", async () => {
    const proc = spawnServer({ ...baseEnv, DATABASE_URL: unreachableDatabaseUrl, PORT: "0" });
    expect(await proc.exited).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("Start abgebrochen");
    expect(stderr).toContain("ECONNREFUSED");
    expect(stderr).not.toContain("app:app@");
  });
});

describe("Serverstart: erster Admin aus ADMIN_EMAIL/ADMIN_PASSWORD", () => {
  const conn = migratedTestDb();
  afterAll(async () => (await conn).client.end({ timeout: 1 }));
  beforeEach(async () => resetAuthTables((await conn).db));

  const adminEnv = { ADMIN_EMAIL: "chefin@example.test", ADMIN_PASSWORD: "start-passwort-123" };
  const userRows = async () => (await conn).db.select().from(users);

  test(
    "ohne die Variablen legt der Start bei leerer Datenbank keinen Benutzer an",
    async () => {
      await startAndStop({});
      expect(await userRows()).toHaveLength(0);
    },
    START_TIMEOUT_MS,
  );

  test(
    "legt den Admin vor dem Öffnen des Ports an, nur beim ersten Start",
    async () => {
      const first = await startAndStop(adminEnv);
      // Der Hinweis steht in der Ausgabe vor „API läuft auf“, also vor dem Öffnen des Ports.
      expect(first.output).toContain("Erster Admin chefin@example.test");
      expect(first.output).toContain("aus der Umgebung entfernen");
      expect((await userRows()).map((u) => [u.email, u.role])).toEqual([
        ["chefin@example.test", "admin"],
      ]);

      const second = await startAndStop({ ...adminEnv, ADMIN_EMAIL: "zweite@example.test" });
      expect(second.output).toContain("schon einen Admin");
      expect((await userRows()).map((u) => u.email)).toEqual(["chefin@example.test"]);
    },
    START_TIMEOUT_MS,
  );

  test(
    "lehnt ein ADMIN_PASSWORD unter 12 Zeichen ab und startet nicht",
    async () => {
      const proc = spawnServer({
        ...baseEnv,
        ...adminEnv,
        ADMIN_PASSWORD: "elf-zeichen",
        DATABASE_URL: testDatabaseUrl(),
        PORT: "0",
      });
      expect(await proc.exited).toBe(1);
      const stderr = await new Response(proc.stderr).text();
      expect(stderr).toContain("ADMIN_PASSWORD: muss mindestens 12 Zeichen lang sein");
      expect(stderr).not.toContain("elf-zeichen");
      expect(await userRows()).toHaveLength(0);
    },
    START_TIMEOUT_MS,
  );
});
