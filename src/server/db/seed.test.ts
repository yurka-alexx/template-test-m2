import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import {
  migratedTestDb,
  resetAuthTables,
  resetTaskTables,
  testDatabaseUrl,
} from "../test-helpers.ts";
import { tasks, users } from "./schema.ts";
import { addDays, seed, seedAccounts, seedTaskId, seedTasks } from "./seed.ts";

// Prozessstart und Datenbankzugriffe können auf langsamen CI-Runnern länger als Buns 5 Sekunden dauern.
const DB_TIMEOUT_MS = 20_000;

const { db, client } = await migratedTestDb();
afterAll(() => client.end({ timeout: 1 }), DB_TIMEOUT_MS);
beforeEach(async () => {
  await resetTaskTables(db);
  await resetAuthTables(db);
}, DB_TIMEOUT_MS);

const script = fileURLToPath(new URL("../../../scripts/seed.ts", import.meta.url));
const quiet = () => {};

/** `bun run seed` als eigener Prozess, ohne lokale .env, nur mit den übergebenen Variablen. */
async function runSeedScript(env: Record<string, string> = {}) {
  const proc = Bun.spawn(["bun", "--no-env-file", script], {
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE_URL: testDatabaseUrl(),
      APP_URL: "http://localhost:3000",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

describe("bun run seed", () => {
  test(
    "ohne Passwortvariablen: 30 Aufgaben, keine Konten",
    async () => {
      const { code, stdout } = await runSeedScript();
      expect(code).toBe(0);
      expect(stdout).toContain("keine Konten angelegt");
      expect(await db.$count(tasks)).toBe(30);
      expect(await db.$count(users)).toBe(0);
    },
    DB_TIMEOUT_MS,
  );

  test(
    "zweimal ausgeführt: weiterhin genau 30 Aufgaben",
    async () => {
      expect((await runSeedScript()).code).toBe(0);
      expect((await runSeedScript()).code).toBe(0);
      expect(await db.$count(tasks)).toBe(30);
    },
    DB_TIMEOUT_MS,
  );

  test(
    "mit SEED_ADMIN_PASSWORD: nur der Test-Admin wird angelegt",
    async () => {
      const { code } = await runSeedScript({ SEED_ADMIN_PASSWORD: "seed-admin-passwort" });
      expect(code).toBe(0);
      const rows = await db.select().from(users);
      expect(rows.map((u) => [u.email, u.role])).toEqual([[seedAccounts.admin.email, "admin"]]);
      expect(await Bun.password.verify("seed-admin-passwort", rows[0]?.passwordHash ?? "")).toBe(
        true,
      );
      // Seed-Aufgaben gehören dem Test-Admin.
      const [first] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, seedTaskId(0)));
      expect(first?.createdBy).toBe(rows[0]?.id ?? "");
    },
    DB_TIMEOUT_MS,
  );

  test(
    "mit beiden Passwortvariablen: Test-Admin und Test-Benutzer",
    async () => {
      const { code } = await runSeedScript({
        SEED_ADMIN_PASSWORD: "seed-admin-passwort",
        SEED_USER_PASSWORD: "seed-benutzer-passwort",
      });
      expect(code).toBe(0);
      const rows = await db.select().from(users).orderBy(users.email);
      expect(rows.map((u) => [u.email, u.role])).toEqual([
        [seedAccounts.admin.email, "admin"],
        [seedAccounts.benutzer.email, "benutzer"],
      ]);
      expect(await db.$count(tasks)).toBe(30);
    },
    DB_TIMEOUT_MS,
  );

  test(
    "leere Passwortvariablen gelten als nicht gesetzt: keine Konten",
    async () => {
      const { code, stdout } = await runSeedScript({
        SEED_ADMIN_PASSWORD: "",
        SEED_USER_PASSWORD: "",
      });
      expect(code).toBe(0);
      expect(stdout).toContain("keine Konten angelegt");
      expect(await db.$count(users)).toBe(0);
      expect(await db.$count(tasks)).toBe(30);
    },
    DB_TIMEOUT_MS,
  );

  test(
    "zu kurzes Passwort: Abbruch mit Meldung, nichts angelegt",
    async () => {
      const { code, stderr } = await runSeedScript({ SEED_USER_PASSWORD: "zu-kurz" });
      expect(code).toBe(1);
      expect(stderr).toContain("SEED_USER_PASSWORD: muss mindestens 12 Zeichen lang sein");
      // Abbruch vor dem Datenbankzugriff: weder Konten noch Aufgaben.
      expect(await db.$count(users)).toBe(0);
      expect(await db.$count(tasks)).toBe(0);
    },
    DB_TIMEOUT_MS,
  );
});

describe("seed()", () => {
  test(
    "ohne Passwörter: 30 Aufgaben ohne Ersteller, keine Konten",
    async () => {
      const result = await seed(db, { log: quiet });
      expect(result).toEqual({ tasks: 30, accountsCreated: [] });
      expect(await db.$count(users)).toBe(0);
      const rows = await db.select().from(tasks);
      expect(rows).toHaveLength(30);
      expect(rows.every((r) => r.createdBy === null)).toBeTrue();
    },
    DB_TIMEOUT_MS,
  );

  test(
    "mit beiden Passwörtern: Test-Admin und Test-Benutzer, beim zweiten Lauf keine Doppelten",
    async () => {
      const options = {
        adminPassword: "seed-admin-passwort",
        userPassword: "seed-benutzer-passwort",
        log: quiet,
      };
      const first = await seed(db, options);
      expect(first.accountsCreated).toEqual([
        seedAccounts.admin.email,
        seedAccounts.benutzer.email,
      ]);
      const second = await seed(db, options);
      expect(second.accountsCreated).toEqual([]);

      const rows = await db.select().from(users).orderBy(users.email);
      expect(rows.map((u) => [u.email, u.role])).toEqual([
        [seedAccounts.admin.email, "admin"],
        [seedAccounts.benutzer.email, "benutzer"],
      ]);
      expect(await db.$count(tasks)).toBe(30);
    },
    DB_TIMEOUT_MS,
  );

  test(
    "setzt geänderte Seed-Aufgaben zurück, eigene Aufgaben bleiben",
    async () => {
      await seed(db, { log: quiet });
      await db
        .update(tasks)
        .set({ title: "Geändert" })
        .where(eq(tasks.id, seedTaskId(0)));
      await db.delete(tasks).where(eq(tasks.id, seedTaskId(1)));
      await db.insert(tasks).values({ title: "Eigene Aufgabe" });

      await seed(db, { log: quiet });
      const [first] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, seedTaskId(0)));
      expect(first?.title).toBe(seedTasks[0]?.title ?? "");
      expect(await db.$count(tasks)).toBe(31);
      expect(await db.$count(tasks, eq(tasks.title, "Eigene Aufgabe"))).toBe(1);
    },
    DB_TIMEOUT_MS,
  );

  test(
    "zweiter Lauf setzt auch Ersteller und Anlagezeit zurück, ein Lauf ohne Passwort behält den Test-Admin",
    async () => {
      await seed(db, { log: quiet });
      const [before] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, seedTaskId(0)));
      expect(before?.createdBy).toBeNull();
      await db
        .update(tasks)
        .set({ createdAt: new Date("2020-01-01T00:00:00Z") })
        .where(eq(tasks.id, seedTaskId(0)));

      await seed(db, { adminPassword: "seed-admin-passwort", log: quiet });
      const [admin] = await db
        .select()
        .from(users)
        .where(eq(users.email, seedAccounts.admin.email));
      const creators = async () => (await db.select().from(tasks)).map((t) => t.createdBy);
      expect(await creators()).toEqual(Array(30).fill(admin?.id));
      const [after] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, seedTaskId(0)));
      expect(after?.createdAt.getUTCFullYear()).not.toBe(2020);

      await seed(db, { log: quiet });
      expect(await creators()).toEqual(Array(30).fill(admin?.id));
    },
    DB_TIMEOUT_MS,
  );

  test(
    "Fälligkeiten relativ zum Bezugstag",
    async () => {
      const today = new Date("2026-10-22T23:30:00Z");
      await seed(db, { today, log: quiet });
      const [first] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, seedTaskId(0)));
      expect(first?.dueDate).toBe("2026-10-25");
      expect(addDays(today, 0)).toBe("2026-10-22");
      expect(addDays(new Date("2026-12-31T00:00:00Z"), 1)).toBe("2027-01-01");
    },
    DB_TIMEOUT_MS,
  );
});

describe("Seed-Daten", () => {
  test("30 Aufgaben mit gemischten Status, Prioritäten und Fälligkeiten", () => {
    expect(seedTasks).toHaveLength(30);
    const countBy = (key: "status" | "priority") =>
      Object.fromEntries(
        [...new Set(seedTasks.map((t) => t[key]))].map((v) => [
          v,
          seedTasks.filter((t) => t[key] === v).length,
        ]),
      );
    expect(countBy("status")).toEqual({ offen: 13, in_arbeit: 10, erledigt: 7 });
    expect(countBy("priority")).toEqual({ hoch: 8, mittel: 13, niedrig: 9 });

    const due = seedTasks.map((t) => t.dueInDays).filter((d) => d !== null);
    expect(due).toHaveLength(26);
    expect(new Set(due).size).toBe(26);
    expect(due.some((d) => d < 0)).toBeTrue();
  });

  test("erstes Wort der Titel: nur ASCII-Buchstaben, keines ist Anfang eines anderen", () => {
    // Dann sortieren C-, de_DE- und en_US-Collation die Titel gleich (siehe Kommentar in seed.ts).
    const words = seedTasks.map((t) => t.title.split(" ")[0] ?? "");
    for (const word of words) {
      expect(word).toMatch(/^[A-Z][a-z]+$/);
      expect(words.filter((other) => other.startsWith(word))).toEqual([word]);
    }
  });

  test("feste IDs sind gültige, verschiedene UUIDs", () => {
    const ids = seedTasks.map((_, i) => seedTaskId(i));
    expect(new Set(ids).size).toBe(30);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
