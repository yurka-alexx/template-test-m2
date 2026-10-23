// Täglicher Zeitplan im Server-Prozess: löscht abgelaufene Sitzungen (kein Worker, kein externer Cron).
import { Cron } from "croner";
import { lt } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { sessions } from "../db/schema.ts";

/** Täglich um 3 Uhr in der Zeitzone des Servers (im Image UTC). */
export const SESSION_CLEANUP_PATTERN = "0 3 * * *";

/** Löscht alle Sitzungen mit `expires_at` vor `now` und gibt die Zahl der gelöschten Zeilen zurück. */
export async function deleteExpiredSessions(db: Db, now = new Date()): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  return deleted.length;
}

export type SessionCleanupOptions = {
  pattern?: string;
  log?: (message: string) => void;
  logError?: (message: string) => void;
};

/**
 * Plant `deleteExpiredSessions` täglich ein. Ein Fehler wird geloggt und abgefangen, der Server
 * läuft weiter und der nächste Lauf bleibt geplant. Gedacht nur für eine Instanz. Ein zweiter Aufruf
 * im selben Prozess wirft nicht, plant den Job aber ein zweites Mal ein.
 * Rückgabe ist der Zeitplan von croner (`stop()`, `nextRun()`, `trigger()`).
 */
export function startSessionCleanup(
  db: Db,
  {
    pattern = SESSION_CLEANUP_PATTERN,
    log = console.log,
    logError = console.error,
  }: SessionCleanupOptions = {},
): Cron {
  // Ohne `name`: croner führt benannte Jobs prozessweit in `scheduledJobs`, ein zweiter Aufruf
  // ohne `stop()` würfe dann „name already taken“. `protect` verhindert überlappende Läufe.
  return new Cron(pattern, { protect: true }, async () => {
    try {
      const count = await deleteExpiredSessions(db);
      log(`Sitzungen aufgeräumt: ${count} abgelaufene gelöscht.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logError(`Aufräumen der Sitzungen fehlgeschlagen, nächster Versuch nach Zeitplan: ${reason}`);
    }
  });
}
