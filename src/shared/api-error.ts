/** Einheitliches Fehlerformat aller API-Antworten. `fields` gibt es nur bei Validierungsfehlern. */
export type ApiErrorBody = {
  error: string;
  fields?: Record<string, string[]>;
};
