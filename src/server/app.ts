import { Hono } from "hono";
import { stagingBasicAuth } from "./auth/basic-auth.ts";
import { csrfProtection } from "./auth/csrf.ts";
import { type AuthEnv, loadSession, requireRole } from "./auth/middleware.ts";
import { authRoutes } from "./auth/routes.ts";
import { type Db, pingDb } from "./db/index.ts";
import type { Env } from "./env.ts";
import { notFound, onError } from "./errors.ts";
import { runProbe } from "./probe.ts";
import { serveClient } from "./static.ts";
import { taskRoutes } from "./tasks/routes.ts";

export type AppDeps = {
  db: Db;
  env: Pick<Env, "APP_URL" | "NODE_ENV" | "BASIC_AUTH_USER" | "BASIC_AUTH_PASSWORD">;
  /** Ordner der gebauten Oberfläche (`dist/client`). Ohne Angabe nur API. */
  clientDir?: string;
};

export function createApp({ db, env, clientDir }: AppDeps) {
  const cookie = { secure: env.NODE_ENV === "production" };

  const app = new Hono<AuthEnv>()
    // Zuerst: Staging-Schutz vor CSRF, Sitzung, API, /probe und Oberfläche (aus ohne Variablen).
    .use("*", stagingBasicAuth(env))
    .use("*", csrfProtection(env.APP_URL))
    .use("/api/*", loadSession(db, cookie))
    .use("/probe", loadSession(db, cookie))
    .get("/healthz", async (c) => {
      try {
        await pingDb(db);
        return c.json({ status: "ok" as const }, 200);
      } catch (error) {
        console.error("healthz: Datenbank antwortet nicht:", error);
        return c.json({ error: "Datenbank nicht erreichbar" }, 503);
      }
    })
    // Prüft nach dem Deploy die Fremddienste (Checks in probe.ts), nur für Admins.
    .get("/probe", requireRole("admin"), async (c) => c.json(await runProbe(), 200))
    .route("/api/auth", authRoutes(db, cookie))
    .route("/api/tasks", taskRoutes(db));

  // Nach den Routen: alles, was keine API ist, geht an die Oberfläche (SPA-Fallback).
  if (clientDir) app.use("*", serveClient(clientDir));

  app.onError(onError);
  app.notFound(notFound);
  return app;
}

/** Typ der API für den Hono-RPC-Client (`hc<AppType>`). */
export type AppType = ReturnType<typeof createApp>;
