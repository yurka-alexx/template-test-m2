import type { MiddlewareHandler } from "hono";
import { basicAuth } from "hono/basic-auth";
import { createMiddleware } from "hono/factory";
import type { ApiErrorBody } from "../../shared/api-error.ts";
import type { Env } from "../env.ts";

export type BasicAuthCredentials = Pick<Env, "BASIC_AUTH_USER" | "BASIC_AUTH_PASSWORD">;

/**
 * Staging-Schutz: Sind `BASIC_AUTH_USER` und `BASIC_AUTH_PASSWORD` gesetzt, verlangt jede Anfrage
 * Basic Auth, außer `GET /healthz` (Healthcheck von Docker und Coolify). Sonst ist sie aus.
 *
 * Hono vergleicht Benutzer und Passwort zeitkonstant (SHA-256 beider Seiten, dann `timingSafeEqual`).
 */
export function stagingBasicAuth({
  BASIC_AUTH_USER: username,
  BASIC_AUTH_PASSWORD: password,
}: BasicAuthCredentials): MiddlewareHandler {
  if (!username || !password) return createMiddleware(async (_c, next) => next());

  const check = basicAuth({
    username,
    password,
    realm: "Staging",
    invalidUserMessage: { error: "Zugang nur mit Basic Auth" } satisfies ApiErrorBody,
  });
  return createMiddleware(async (c, next) => {
    if (c.req.method === "GET" && c.req.path === "/healthz") return next();
    return check(c, next);
  });
}
