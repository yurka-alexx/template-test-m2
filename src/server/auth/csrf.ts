import { csrf } from "hono/csrf";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

const SAFE_METHODS = /^(GET|HEAD|OPTIONS)$/;

/**
 * Schutz gegen gefälschte Anfragen: ändernde Anfragen müssen von `APP_URL` kommen.
 *
 * Hono `csrf()` prüft nur Anfragen mit Formular-Content-Type (Browser schicken die ohne Preflight)
 * und lässt sie durch, wenn `Origin` zu `APP_URL` passt oder `Sec-Fetch-Site: same-origin` ist.
 * Zusätzlich wird jeder andere Content-Type (etwa JSON) abgelehnt, sobald ein fremder `Origin`
 * mitkommt. JSON ohne `Origin` (curl, Skripte) kommt durch, braucht aber trotzdem eine Sitzung.
 */
export function csrfProtection(appUrl: string) {
  const origin = new URL(appUrl).origin;
  const honoCsrf = csrf({ origin });
  const reject = () =>
    new HTTPException(403, { message: "Anfrage von fremder Herkunft abgelehnt" });

  return createMiddleware(async (c, next) => {
    if (!SAFE_METHODS.test(c.req.method)) {
      const requestOrigin = c.req.header("origin");
      const sameOrigin = c.req.header("sec-fetch-site") === "same-origin";
      if (requestOrigin !== undefined && requestOrigin !== origin && !sameOrigin) throw reject();
      try {
        // Nur prüfen, `next` ruft diese Middleware selbst auf.
        await honoCsrf(c, async () => {});
      } catch (error) {
        if (error instanceof HTTPException && error.status === 403) throw reject();
        throw error;
      }
    }
    await next();
  });
}
