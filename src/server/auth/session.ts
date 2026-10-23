// Sitzungen nach „The Copenhagen Book“: zufälliges Token im Cookie, in der Datenbank nur sein SHA-256.
import { eq } from "drizzle-orm";
import type { Db } from "../db/index.ts";
import { type SessionRow, sessions, type UserRow, users } from "../db/schema.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_DURATION_MS = 7 * DAY_MS;
/** Restlaufzeit, unter der eine genutzte Sitzung wieder auf volle Laufzeit verlängert wird. */
export const SESSION_RENEW_BELOW_MS = SESSION_DURATION_MS / 2;

/** 32 Zufallsbytes, base64url: 256 Bit Entropie. */
export function generateSessionToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Db,
  userId: string,
): Promise<{ token: string; session: SessionRow }> {
  const token = generateSessionToken();
  const [session] = await db
    .insert(sessions)
    .values({
      id: hashSessionToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    })
    .returning();
  if (!session) throw new Error("Sitzung konnte nicht angelegt werden");
  return { token, session };
}

export type ValidatedSession = { session: SessionRow; user: UserRow; renewed: boolean };

/**
 * Sucht die Sitzung zum Token. Abgelaufene Sitzungen werden gelöscht. Liegt die Restlaufzeit
 * unter der Hälfte, wird `expires_at` auf volle Laufzeit gesetzt (`renewed`, Cookie neu setzen).
 */
export async function validateSessionToken(
  db: Db,
  token: string,
): Promise<ValidatedSession | null> {
  const id = hashSessionToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (row.session.expiresAt.getTime() - now < SESSION_RENEW_BELOW_MS) {
    const expiresAt = new Date(now + SESSION_DURATION_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    return { session: { ...row.session, expiresAt }, user: row.user, renewed: true };
  }
  return { session: row.session, user: row.user, renewed: false };
}

export async function invalidateSessionToken(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}
