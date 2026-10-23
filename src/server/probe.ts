/** Ergebnis eines einzelnen Checks in `GET /probe`. */
export type ProbeCheck = { name: string; ok: boolean; detail?: string };

/** Ein Check, den `/probe` bei jedem Aufruf ausführt. */
export type ProbeCheckDefinition = {
  name: string;
  run: () => Promise<Omit<ProbeCheck, "name">>;
};

export type ProbeResult = { ok: boolean; checks: ProbeCheck[] };

/**
 * Checks für `GET /probe` (nach jedem Deploy, nur als Admin). Der Starter hat keine Fremddienste,
 * deshalb ist die Liste leer. Ein Projekt, das einen Fremddienst anbindet, trägt hier je Dienst
 * einen Check ein, zum Beispiel:
 *
 *   { name: "mail", run: async () => ({ ok: await mailClient.ping() }) }
 *
 * Dazu gehört ein Test im Replay-Modus (aufgezeichnete Antworten statt echter Aufrufe).
 */
export const probeChecks: ProbeCheckDefinition[] = [];

/** Führt alle Checks aus. `ok` ist wahr, wenn alle ok sind (bei leerer Liste wahr). */
export async function runProbe(checks: ProbeCheckDefinition[] = probeChecks): Promise<ProbeResult> {
  const results = await Promise.all(
    checks.map(async ({ name, run }): Promise<ProbeCheck> => {
      try {
        return { name, ...(await run()) };
      } catch (error) {
        // Ein Check, der wirft, ist fehlgeschlagen und reißt die übrigen nicht mit.
        console.error(`probe: Check ${name} fehlgeschlagen:`, error);
        return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
      }
    }),
  );
  return { ok: results.every((check) => check.ok), checks: results };
}
