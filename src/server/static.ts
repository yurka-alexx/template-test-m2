import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/bun";
import type { MiddlewareHandler } from "hono";

/** Ausgabe von `bun run build` (vite.config.ts, build.outDir). */
export const defaultClientDir = fileURLToPath(new URL("../../dist/client", import.meta.url));

export const hasClientBuild = (dir: string) => existsSync(`${dir}/index.html`);

// Hier antwortet immer die API, auch mit 404 als JSON, nie die Oberfläche. Schrägstriche am Ende
// zählen nicht: `/probe/` und `/healthz/` bekommen auch kein `index.html`.
const isServerPath = (path: string) => {
  const trimmed = path.replace(/\/+$/, "");
  return (
    trimmed === "/api" ||
    trimmed.startsWith("/api/") ||
    trimmed === "/healthz" ||
    trimmed === "/probe"
  );
};

/**
 * Liefert die gebaute Oberfläche aus `dir` aus: vorhandene Dateien direkt, jeder andere
 * GET-Pfad bekommt `index.html` (SPA-Fallback, der Router im Browser übernimmt).
 * Ausgenommen sind `/api/*`, `/healthz` und `/probe`, auch mit Schrägstrich am Ende.
 */
export function serveClient(dir: string): MiddlewareHandler {
  const file = serveStatic({ root: dir });
  const indexHtml = serveStatic({ root: dir, path: "index.html" });
  const skip = async () => {};

  return async (c, next) => {
    if ((c.req.method !== "GET" && c.req.method !== "HEAD") || isServerPath(c.req.path)) {
      return next();
    }
    const res = (await file(c, skip)) ?? (await indexHtml(c, skip));
    if (res) return res;
    await next();
  };
}
