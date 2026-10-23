import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { users } from "../db/schema.ts";
import { ValidationError } from "../errors.ts";
import { createTestUser, migratedTestDb, resetAuthTables } from "../test-helpers.ts";
import { BOOTSTRAP_ADMIN_NAME, bootstrapAdmin } from "./bootstrap.ts";
import { EmailTakenError } from "./users.ts";

const { db, client } = await migratedTestDb();
afterAll(() => client.end({ timeout: 1 }));
beforeEach(() => resetAuthTables(db));

const admin = { email: "chefin@example.test", password: "start-passwort-123" };

function collectLog() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe("bootstrapAdmin", () => {
  test("ohne ADMIN_EMAIL/ADMIN_PASSWORD wird kein Benutzer angelegt", async () => {
    expect(await bootstrapAdmin(db, {}, () => {})).toBe("nicht-gesetzt");
    expect(await db.select().from(users)).toHaveLength(0);
  });

  test("legt bei leerer Datenbank den Admin an und gibt den Hinweis zum Entfernen aus", async () => {
    const { lines, log } = collectLog();
    expect(await bootstrapAdmin(db, admin, log)).toBe("angelegt");

    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: admin.email,
      name: BOOTSTRAP_ADMIN_NAME,
      role: "admin",
    });
    expect(rows[0]?.passwordHash).toStartWith("$argon2id$");
    expect(await Bun.password.verify(admin.password, rows[0]?.passwordHash ?? "")).toBeTrue();
    expect(lines.join("\n")).toContain("aus der Umgebung entfernen");
  });

  test("greift nur, solange kein Admin existiert: zweiter Lauf legt nichts an", async () => {
    await bootstrapAdmin(db, admin, () => {});
    const { lines, log } = collectLog();
    const second = { email: "zweite@example.test", password: "anderes-passwort-456" };
    expect(await bootstrapAdmin(db, second, log)).toBe("admin-existiert");

    const rows = await db.select().from(users);
    expect(rows.map((r) => r.email)).toEqual([admin.email]);
    expect(lines.join("\n")).toContain("schon einen Admin");
  });

  test("ein vorhandener Benutzer ohne Admin-Rolle verhindert den ersten Admin nicht", async () => {
    await createTestUser(db, "benutzer");
    expect(await bootstrapAdmin(db, admin, () => {})).toBe("angelegt");
  });

  test("lehnt ein Passwort unter 12 Zeichen ab und legt nichts an", async () => {
    const short = { email: admin.email, password: "elf-zeichen" };
    expect(short.password).toHaveLength(11);
    await expect(bootstrapAdmin(db, short, () => {})).rejects.toBeInstanceOf(ValidationError);
    expect(await db.select().from(users)).toHaveLength(0);
  });

  test("bricht ab, wenn die E-Mail schon einem Benutzer gehört", async () => {
    await createTestUser(db, "benutzer", admin.email);
    await expect(bootstrapAdmin(db, admin, () => {})).rejects.toBeInstanceOf(EmailTakenError);
  });
});
