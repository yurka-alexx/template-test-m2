import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ApiErrorBody } from "../../shared/api-error.ts";
import { loginSchema } from "../../shared/schemas/auth.ts";
import type { PublicUser } from "../../shared/schemas/user.ts";
import type { Db } from "../db/index.ts";
import { validator } from "../validator.ts";
import {
  type AuthEnv,
  type CookieOptions,
  deleteSessionCookie,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
} from "./middleware.ts";
import { createSession, invalidateSessionToken } from "./session.ts";
import { findUserByEmail, hashPassword, toPublicUser } from "./users.ts";

// Unbekannte E-Mail prüft gegen diesen Hash, damit die Antwortzeit nichts über Konten verrät.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => {
  dummyHash ??= hashPassword(crypto.randomUUID());
  return dummyHash;
};

/** Routen unter `/api/auth`. `loadSession` muss davor laufen. */
export function authRoutes(db: Db, cookie: CookieOptions) {
  return new Hono<AuthEnv>()
    .post("/login", validator("json", loginSchema), async (c) => {
      const { email, password } = c.req.valid("json");
      const user = await findUserByEmail(db, email);
      const valid = await Bun.password.verify(
        password,
        user?.passwordHash ?? (await getDummyHash()),
      );
      if (!user || !valid) {
        return c.json<ApiErrorBody, 401>({ error: "E-Mail oder Passwort falsch" }, 401);
      }

      const { token, session } = await createSession(db, user.id);
      setSessionCookie(c, token, session.expiresAt, cookie);
      return c.json<{ user: PublicUser }, 200>({ user: toPublicUser(user) }, 200);
    })
    .post("/logout", async (c) => {
      const token = getCookie(c, SESSION_COOKIE);
      if (token) await invalidateSessionToken(db, token);
      deleteSessionCookie(c, cookie);
      return c.body(null, 204);
    })
    .get("/me", requireAuth, (c) => {
      // requireAuth stellt sicher, dass user gesetzt ist.
      const user = c.get("user") as PublicUser;
      return c.json<{ user: PublicUser }, 200>({ user }, 200);
    });
}
