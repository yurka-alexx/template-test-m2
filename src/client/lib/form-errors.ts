import { ApiError } from "./api.ts";

export type FormErrors<F extends string> = {
  /** Erste Meldung je bekanntem Feld, für `setError(feld, …)`. */
  fields: Partial<Record<F, string>>;
  /** Allgemeine Meldung über dem Formular, wenn kein Feld passt (z. B. falsche Zugangsdaten). */
  root?: string;
};

/**
 * Verteilt einen API-Fehler auf die Felder eines Formulars. Feldfehler (`fields` der 400)
 * landen am Feld, alles andere als allgemeine Meldung mit dem `error` der API.
 */
export function formErrorsFrom<F extends string>(
  error: unknown,
  knownFields: readonly F[],
): FormErrors<F> {
  if (!(error instanceof ApiError)) return { fields: {}, root: "Unerwarteter Fehler" };

  const fields: Partial<Record<F, string>> = {};
  let unmatched = false;
  for (const [key, messages] of Object.entries(error.fields ?? {})) {
    const message = messages[0];
    if (message && (knownFields as readonly string[]).includes(key)) fields[key as F] = message;
    else unmatched = true;
  }

  const hasFieldErrors = Object.keys(fields).length > 0;
  return { fields, root: hasFieldErrors && !unmatched ? undefined : error.message };
}
