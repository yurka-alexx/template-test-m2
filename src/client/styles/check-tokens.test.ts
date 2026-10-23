import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkTokens, findColors, listFiles, TOKENS_FILE } from "../../../scripts/check-tokens.ts";

// Dieser Test enthält selbst keine Farbwerte, sonst schlägt `bun run lint` hier an.
// Die erwarteten Treffer stehen als Kommentar "Fund: …" in den Beispieldateien.
const root = resolve(import.meta.dir, "../../..");
const fixtures = "scripts/fixtures/check-tokens";
const withColors = `${fixtures}/mit-farben`;
const withoutColors = `${fixtures}/ohne-farben`;
const withColorsFiles = [`${withColors}/komponente.tsx`, `${withColors}/stil.css`];

const read = (file: string) => readFileSync(join(root, file), "utf8");

/** Erwartete Treffer je Zeile aus den Kommentaren "Fund: …" einer Beispieldatei. */
function expectedFindings(file: string): Map<number, string> {
  const expected = new Map<number, string>();
  read(file)
    .split("\n")
    .forEach((line, index) => {
      const marker = line.match(/Fund: (\S+) \*\//)?.[1];
      if (marker) expected.set(index + 1, marker);
    });
  return expected;
}

function runCli(...args: string[]) {
  return Bun.spawnSync(["bun", "scripts/check-tokens.ts", ...args], { cwd: root });
}

describe("check:tokens", () => {
  test("meldet in der Beispieldatei mit Farben genau die markierten Treffer", () => {
    const findings = checkTokens(root, [withColors]);
    for (const file of withColorsFiles) {
      const expected = expectedFindings(file);
      expect(expected.size).toBeGreaterThan(0);
      const found = new Map<number, Set<string>>();
      for (const f of findings.filter((f) => f.file === file)) {
        found.set(f.line, (found.get(f.line) ?? new Set()).add(f.match));
      }
      // Der Kommentar wiederholt den Treffer, deshalb je Zeile als Menge vergleichen.
      expect([...found.keys()]).toEqual([...expected.keys()]);
      for (const [line, match] of expected) expect([...(found.get(line) ?? [])]).toEqual([match]);
    }
  });

  test("deckt hex, Farbfunktionen (rgb, hsl, oklch) und Tailwind-Farbklassen ab", () => {
    const kinds = new Set(checkTokens(root, [withColors]).map((f) => f.kind));
    expect([...kinds].sort()).toEqual(["Farbfunktion", "Hex-Farbe", "Tailwind-Farbklasse"]);
    const functions = checkTokens(root, [withColors])
      .filter((f) => f.kind === "Farbfunktion")
      .map((f) => f.match.slice(0, -1));
    expect([...new Set(functions)].sort()).toEqual(["hsl", "oklch", "rgb"]);
  });

  test("Beispieldatei ohne Farben (Token-Klassen, Anker, Entities, color-mix) bleibt ohne Fund", () => {
    expect(checkTokens(root, [withoutColors])).toEqual([]);
  });

  test("gibt Datei, Zeile und Spalte an", () => {
    const file = `${withColors}/komponente.tsx`;
    const [line, match] = [...expectedFindings(file)][0] ?? [0, ""];
    const text = read(file);
    const column = (text.split("\n")[line - 1] ?? "").indexOf(match) + 1;
    expect(findColors(text, file)[0]).toEqual({
      file,
      line,
      column,
      kind: "Tailwind-Farbklasse",
      match,
    });
  });

  test("die Token-Datei selbst wird nie geprüft", () => {
    expect(findColors(read(TOKENS_FILE)).length).toBeGreaterThan(0);
    expect(checkTokens(root, [TOKENS_FILE])).toEqual([]);
    expect(listFiles(root, root, true)).not.toContain(TOKENS_FILE);
  });

  test("Lauf über das Repo prüft den Client, aber nicht node_modules und die Beispieldateien", () => {
    const files = listFiles(root, root, true);
    expect(files).toContain("src/client/components/ui/button.tsx");
    expect(files).toContain("src/client/styles/index.css");
    expect(files).toContain("index.html");
    expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
    expect(files.some((f) => f.startsWith(fixtures))).toBe(false);
    // Playwright: die Alternativ-Token-Datei ist ausgenommen, die Specs selbst werden geprüft.
    expect(files).not.toContain("e2e/fixtures/tokens-alt.css");
    expect(files).toContain("e2e/tokens.spec.ts");
  });

  test("die Alternativ-Token-Datei für Playwright enthält Farben, ist aber ausdrücklich prüfbar", () => {
    expect(checkTokens(root, ["e2e/fixtures/tokens-alt.css"]).length).toBeGreaterThan(0);
  });

  test("Befehl endet mit Exit-Code 1 und nennt jede Fundstelle", () => {
    const run = runCli(withColors);
    expect(run.exitCode).toBe(1);
    const stderr = run.stderr.toString();
    for (const file of withColorsFiles) {
      for (const [line, match] of expectedFindings(file)) {
        expect(stderr).toContain(`${file}:${line}:`);
        expect(stderr).toContain(match);
      }
    }
  });

  test("Befehl endet ohne Fund mit Exit-Code 0", () => {
    expect(runCli(withoutColors).exitCode).toBe(0);
  });
});
