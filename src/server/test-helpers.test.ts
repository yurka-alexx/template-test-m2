import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createDb } from "./db/index.ts";
import { migratedTestDb, testDatabaseUrl } from "./test-helpers.ts";

// Eigene, leere Datenbank wie in CI, damit die Test-Datenbank aus DATABASE_URL unberührt bleibt.
const name = `migrate_test_${crypto.randomUUID().replaceAll("-", "")}`;
const freshUrl = Object.assign(new URL(testDatabaseUrl()), { pathname: `/${name}` }).toString();
const admin = createDb(testDatabaseUrl());
// Datenbank anlegen plus zwei Migrationen dauern auf langsamen CI-Runnern länger als Buns 5 Sekunden.
const TIMEOUT_MS = 20_000;

beforeAll(async () => {
  await admin.db.execute(sql.raw(`create database ${name}`));
}, TIMEOUT_MS);
afterAll(async () => {
  await admin.db.execute(sql.raw(`drop database if exists ${name} with (force)`));
  await admin.client.end({ timeout: 1 });
});

describe("migratedTestDb", () => {
  test(
    "parallele Aufrufe auf leerer Datenbank spielen die Migrationen ohne Konflikt ein",
    async () => {
      const conns = await Promise.all([migratedTestDb(freshUrl), migratedTestDb(freshUrl)]);
      try {
        const [first] = conns;
        const rows = await first.db.execute(sql`select hash from drizzle.__drizzle_migrations`);
        expect(rows.length).toBeGreaterThanOrEqual(2);
      } finally {
        await Promise.all(conns.map((c) => c.client.end({ timeout: 1 })));
      }
    },
    TIMEOUT_MS,
  );
});
