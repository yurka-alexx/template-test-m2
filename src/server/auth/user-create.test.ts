// Prüft das Skript `bun run user:create` (scripts/user-create.ts) als eigenen Prozess.

import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { users } from "../db/schema.ts";
import {
  createTestUser,
  migratedTestDb,
  resetAuthTables,
  testDatabaseUrl,
} from "../test-helpers.ts";

const { db, client } = await migratedTestDb();
afterAll(() => client.end({ timeout: 1 }));
beforeEach(() => resetAuthTables(db));

const script = fileURLToPath(new URL("../../../scripts/user-create.ts", import.meta.url));

async function userCreate(args: string[], stdin: string) {
  const proc = Bun.spawn(["bun", "--no-env-file", script, ...args], {
    env: {
      PATH: process.env.PATH ?? "",
      DATABASE_URL: testDatabaseUrl(),
      APP_URL: "http://localhost:3000",
    },
    stdin: new Blob([stdin]),
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

const adminArgs = ["--email", "Erste@Example.test", "--name", "Erste Admin", "--role", "admin"];

describe("bun run user:create", () => {
  test("legt den ersten Admin an, Passwort aus stdin, E-Mail klein geschrieben", async () => {
    expect(await db.select().from(users)).toHaveLength(0);
    const { code, stdout } = await userCreate(adminArgs, "zwoelf-zeichen-plus\n");
    expect(code).toBe(0);
    expect(stdout).toContain("erste@example.test (admin) angelegt");

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "erste@example.test", role: "admin" });
    expect(rows[0]?.passwordHash).toStartWith("$argon2id$");
    expect(
      await Bun.password.verify("zwoelf-zeichen-plus", rows[0]?.passwordHash ?? ""),
    ).toBeTrue();
  }, 20_000);

  test("lehnt ein Passwort unter 12 Zeichen ab und legt nichts an", async () => {
    const { code, stderr } = await userCreate(adminArgs, "elf-zeichen\n");
    expect(code).toBe(1);
    expect(stderr).toContain("password: muss mindestens 12 Zeichen lang sein");
    expect(await db.select().from(users)).toHaveLength(0);
  }, 20_000);

  test("lehnt fehlende oder unbekannte Rolle ab", async () => {
    const missing = await userCreate(["--email", "a@example.test", "--name", "A"], "x".repeat(12));
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain("role:");
    const unknown = await userCreate(
      ["--email", "a@example.test", "--name", "A", "--role", "chef"],
      "x".repeat(12),
    );
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("role:");
    expect(await db.select().from(users)).toHaveLength(0);
  }, 20_000);

  test("meldet eine schon vergebene E-Mail", async () => {
    await createTestUser(db, "benutzer", "erste@example.test");
    const { code, stderr } = await userCreate(adminArgs, "zwoelf-zeichen-plus");
    expect(code).toBe(1);
    expect(stderr).toContain("existiert schon");
  }, 20_000);
});
