import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { PublicUser, Role } from "../../shared/schemas/user.ts";
import type { Db } from "../db/index.ts";
import type { SessionRow } from "../db/schema.ts";
import { validateSessionToken } from "./session.ts";
import { toPublicUser } from "./users.ts";

export const SESSION_COOKIE = "sid";

/** Hono-Umgebung der App: `loadSession` setzt `user` und `session` (ohne Sitzung `null`). */
export type AuthEnv = {
  Variables: { user: PublicUser | null; session: SessionRow | null };
};

export type CookieOptions = { secure: boolean };

export function setSessionCookie(
  c: Context,
  token: string,
  expiresAt: Date,
  { secure }: CookieOptions,
) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure,
    expires: expiresAt,
  });
}

export function deleteSessionCookie(c: Context, { secure }: CookieOptions) {
  deleteCookie(c, SESSION_COOKIE, { httpOnly: true, sameSite: "Lax", path: "/", secure });
}

/** Lädt die Sitzung aus dem Cookie `sid`. Ungültige oder abgelaufene Cookies werden gelöscht. */
export function loadSession(db: Db, cookie: CookieOptions) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    c.set("user", null);
    c.set("session", null);
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const result = await validateSessionToken(db, token);
      if (result) {
        c.set("user", toPublicUser(result.user));
        c.set("session", result.session);
        if (result.renewed) setSessionCookie(c, token, result.session.expiresAt, cookie);
      } else {
        deleteSessionCookie(c, cookie);
      }
    }
    await next();
  });
}

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  if (!c.get("user")) throw new HTTPException(401, { message: "Nicht angemeldet" });
  await next();
});

/** Nur für die genannte Rolle: ohne Sitzung 401, mit anderer Rolle 403. */
export function requireRole(role: Role) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (!user) throw new HTTPException(401, { message: "Nicht angemeldet" });
    if (user.role !== role) throw new HTTPException(403, { message: "Keine Berechtigung" });
    await next();
  });
}
