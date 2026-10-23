import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "../db/index.ts";
import { sessions } from "../db/schema.ts";
import { createTestUser, migratedTestDb, resetAuthTables } from "../test-helpers.ts";
import { deleteExpiredSessions, SESSION_CLEANUP_PATTERN, startSessionCleanup } from "./cleanup.ts";

const { db, client } = await migratedTestDb();
afterAll(() => client.end({ timeout: 1 }));
beforeEach(() => resetAuthTables(db));

const now = new Date("2026-10-23T03:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

async function insertSessions(userId: string, entries: Record<string, number>) {
  await db.insert(sessions).values(
    Object.entries(entries).map(([id, offsetMs]) => ({
      id,
      userId,
      expiresAt: new Date(now.getTime() + offsetMs),
    })),
  );
}

const sessionIds = async () =>
  (await db.select({ id: sessions.id }).from(sessions)).map((row) => row.id).sort();

describe("deleteExpiredSessions", () => {
  test("löscht Sitzungen mit expires_at vor now und lässt gültige stehen", async () => {
    const user = await createTestUser(db, "benutzer");
    await insertSessions(user.id, {
      "vor-einer-woche": -7 * 24 * HOUR_MS,
      "vor-einer-sekunde": -1000,
      "genau-jetzt": 0,
      "in-einer-stunde": HOUR_MS,
      "in-sieben-tagen": 7 * 24 * HOUR_MS,
    });

    expect(await deleteExpiredSessions(db, now)).toBe(2);
    expect(await sessionIds()).toEqual(["genau-jetzt", "in-einer-stunde", "in-sieben-tagen"]);
  });

  test("gibt 0 zurück, wenn nichts abgelaufen ist, auch bei leerer Tabelle", async () => {
    expect(await deleteExpiredSessions(db, now)).toBe(0);

    const user = await createTestUser(db, "benutzer");
    await insertSessions(user.id, { gueltig: HOUR_MS });
    expect(await deleteExpiredSessions(db, now)).toBe(0);
    expect(await sessionIds()).toEqual(["gueltig"]);
  });

  test("ohne now gilt die aktuelle Uhrzeit", async () => {
    const user = await createTestUser(db, "benutzer");
    await db.insert(sessions).values([
      { id: "abgelaufen", userId: user.id, expiresAt: new Date(Date.now() - HOUR_MS) },
      { id: "gueltig", userId: user.id, expiresAt: new Date(Date.now() + HOUR_MS) },
    ]);

    expect(await deleteExpiredSessions(db)).toBe(1);
    expect(await sessionIds()).toEqual(["gueltig"]);
  });
});

describe("startSessionCleanup", () => {
  const silent = { log: () => {}, logError: () => {} };

  test("plant täglich um 3 Uhr, der nächste Lauf liegt in der Zukunft, stop() beendet den Zeitplan", () => {
    expect(SESSION_CLEANUP_PATTERN).toBe("0 3 * * *");
    const job = startSessionCleanup(db, silent);
    try {
      const next = job.nextRun();
      expect(next).toBeInstanceOf(Date);
      expect(next?.getTime() ?? 0).toBeGreaterThan(Date.now());
      expect(next?.getTime() ?? 0).toBeLessThanOrEqual(Date.now() + 24 * HOUR_MS);
      expect([next?.getHours(), next?.getMinutes(), next?.getSeconds()]).toEqual([3, 0, 0]);
      expect(job.isRunning()).toBe(true);
    } finally {
      job.stop();
    }
    expect(job.isStopped()).toBe(true);
    expect(job.nextRun()).toBeNull();
  });

  test("ein Lauf löscht abgelaufene Sitzungen und loggt die Zahl", async () => {
    const user = await createTestUser(db, "benutzer");
    await db.insert(sessions).values([
      { id: "abgelaufen", userId: user.id, expiresAt: new Date(Date.now() - HOUR_MS) },
      { id: "gueltig", userId: user.id, expiresAt: new Date(Date.now() + HOUR_MS) },
    ]);
    const logged: string[] = [];
    const job = startSessionCleanup(db, { ...silent, log: (message) => logged.push(message) });
    try {
      await job.trigger();
    } finally {
      job.stop();
    }
    expect(logged).toEqual(["Sitzungen aufgeräumt: 1 abgelaufene gelöscht."]);
    expect(await sessionIds()).toEqual(["gueltig"]);
  });

  test("ein Fehler im Job wird geloggt und abgefangen, der Zeitplan läuft weiter", async () => {
    const broken = {
      delete: () => {
        throw new Error("Verbindung verloren");
      },
    } as unknown as Db;
    const errors: string[] = [];
    const job = startSessionCleanup(broken, { ...silent, logError: (m) => errors.push(m) });
    try {
      // Würde der Fehler durchschlagen, wäre das eine Ablehnung hier bzw. ein unbehandelter Fehler im Prozess.
      await expect(job.trigger()).resolves.toBeUndefined();
      await job.trigger();
      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain("Aufräumen der Sitzungen fehlgeschlagen");
      expect(errors[0]).toContain("Verbindung verloren");
      expect(job.isStopped()).toBe(false);
      expect(job.nextRun()?.getTime() ?? 0).toBeGreaterThan(Date.now());
    } finally {
      job.stop();
    }
  });

  test("ein zweiter Aufruf im selben Prozess wirft nicht und plant unabhängig", () => {
    const first = startSessionCleanup(db, silent);
    try {
      const second = startSessionCleanup(db, silent);
      try {
        expect(second).not.toBe(first);
        expect([first.isRunning(), second.isRunning()]).toEqual([true, true]);
      } finally {
        second.stop();
      }
      // Das Stoppen des zweiten Zeitplans lässt den ersten weiterlaufen.
      expect(first.isRunning()).toBe(true);
    } finally {
      first.stop();
    }
  });

  test("ein anderes Muster ist möglich", () => {
    const job = startSessionCleanup(db, { ...silent, pattern: "*/5 * * * *" });
    try {
      expect(job.getPattern()).toBe("*/5 * * * *");
    } finally {
      job.stop();
    }
  });
});
