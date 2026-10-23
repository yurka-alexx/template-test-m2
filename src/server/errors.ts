import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import type { ApiErrorBody } from "../shared/api-error.ts";

/** Ungültige Eingabe: wird von `onError` als 400 mit Feldfehlern ausgegeben. */
export class ValidationError extends Error {
  override name = "ValidationError";

  constructor(readonly fields: Record<string, string[]>) {
    super("Ungültige Eingabe");
  }

  static fromZod(error: z.core.$ZodError): ValidationError {
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.map(String).join(".") || "_root";
      fields[key] ??= [];
      fields[key].push(issue.message);
    }
    return new ValidationError(fields);
  }
}

export const onError: ErrorHandler = (err, c) => {
  if (err instanceof ValidationError) {
    return c.json<ApiErrorBody>({ error: err.message, fields: err.fields }, 400);
  }
  if (err instanceof HTTPException) {
    // Fertige Antwort aus der Middleware (Basic Auth: 401 mit WWW-Authenticate) unverändert ausgeben.
    if (err.res) return err.getResponse();
    return c.json<ApiErrorBody>({ error: err.message || "Anfrage fehlgeschlagen" }, err.status);
  }
  console.error(err);
  return c.json<ApiErrorBody>({ error: "Interner Fehler" }, 500);
};

export const notFound: NotFoundHandler = (c) =>
  c.json<ApiErrorBody>({ error: "Nicht gefunden" }, 404);
