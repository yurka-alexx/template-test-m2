// bun run check:tokens [pfad …]: findet feste Farben außerhalb von src/client/styles/tokens.css.
// Ohne Pfad wird das ganze Repo geprüft. Fundstellen als datei:zeile:spalte, dann Exit-Code 1.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** Die einzige Datei, in der Farbwerte stehen dürfen. */
export const TOKENS_FILE = "src/client/styles/tokens.css";

const SCANNED_FILES = /\.(?:ts|tsx|js|jsx|mjs|cjs|css|html)$/;

// Beim Lauf über das Repo übersprungen. Die Beispieldateien der Tests (check:tokens, Token-Austausch
// in Playwright) enthalten absichtlich Farben, Berichte von Playwright sind erzeugt.
const IGNORED_DIR_NAMES = new Set(["node_modules", "dist", "coverage", ".git"]);
const IGNORED_PATHS = new Set([
  "scripts/fixtures",
  "e2e/fixtures",
  "e2e/test-results",
  "e2e/playwright-report",
]);

const PALETTE = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "mauve",
  "olive",
  "mist",
  "taupe",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];
const SHADES = "50|100|200|300|400|500|600|700|800|900|950";
// Tailwind-Utilities, die eine Farbe annehmen.
const COLOR_UTILITIES =
  "bg|text|border(?:-[xytrblse])?|divide|outline|ring(?:-offset)?|inset-ring|shadow|inset-shadow|drop-shadow|text-shadow|fill|stroke|from|via|to|decoration|accent|caret|placeholder";

const RULES: { kind: string; pattern: RegExp }[] = [
  // #rgb, #rgba, #rrggbb, #rrggbbaa, nicht in HTML-Entities (&#123;) oder Bezeichnern (#add-item).
  {
    kind: "Hex-Farbe",
    pattern: /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi,
  },
  {
    kind: "Farbfunktion",
    pattern: /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi,
  },
  {
    kind: "Tailwind-Farbklasse",
    pattern: new RegExp(
      `(?<![\\w-])-?(?:${COLOR_UTILITIES})-(?:(?:${PALETTE.join("|")})-(?:${SHADES})|black|white)(?:\\/(?:\\d+|\\[[^\\]\\s]+\\]))?(?![\\w-])`,
      "g",
    ),
  },
];

export type Finding = { file: string; line: number; column: number; kind: string; match: string };

/** Fundstellen in einem Text, Zeile und Spalte ab 1. */
export function findColors(text: string, file = ""): Finding[] {
  const findings: Finding[] = [];
  const lines = text.split("\n");
  lines.forEach((content, index) => {
    for (const { kind, pattern } of RULES) {
      for (const match of content.matchAll(pattern)) {
        findings.push({
          file,
          line: index + 1,
          column: match.index + 1,
          kind,
          match: match[0],
        });
      }
    }
  });
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

const toPosix = (path: string) => path.split("\\").join("/");

/** Dateien unter `dir` (rekursiv), die geprüft werden. Die Token-Datei ist nie dabei. */
export function listFiles(dir: string, root: string, skipIgnored: boolean): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = toPosix(relative(root, abs));
    if (entry.isDirectory()) {
      if (skipIgnored && (IGNORED_DIR_NAMES.has(entry.name) || IGNORED_PATHS.has(rel))) continue;
      files.push(...listFiles(abs, root, skipIgnored));
    } else if (entry.isFile() && SCANNED_FILES.test(entry.name) && rel !== TOKENS_FILE) {
      files.push(rel);
    }
  }
  return files.sort();
}

/**
 * Prüft die angegebenen Dateien oder Ordner (relativ zu `root`), ohne Angabe das ganze Repo.
 * Ausdrücklich genannte Pfade werden auch in sonst übersprungenen Ordnern geprüft.
 */
export function checkTokens(root: string, paths: string[] = []): Finding[] {
  const files =
    paths.length === 0
      ? listFiles(root, root, true)
      : paths.flatMap((path) => {
          const abs = resolve(root, path);
          if (statSync(abs).isDirectory()) return listFiles(abs, root, false);
          const rel = toPosix(relative(root, abs));
          return rel === TOKENS_FILE ? [] : [rel];
        });
  return files.flatMap((file) => findColors(readFileSync(join(root, file), "utf8"), file));
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const findings = checkTokens(root, process.argv.slice(2));
  if (findings.length > 0) {
    for (const f of findings) {
      console.error(`${f.file}:${f.line}:${f.column}  ${f.kind}: ${f.match}`);
    }
    console.error(
      `\ncheck:tokens: ${findings.length} feste Farbe(n) außerhalb von ${TOKENS_FILE}.\n` +
        "Farben gehören als Variable in die Token-Datei, Komponenten nutzen nur Token-Klassen " +
        "wie bg-primary oder text-muted-foreground.",
    );
    process.exit(1);
  }
  console.log(`check:tokens: keine festen Farben außerhalb von ${TOKENS_FILE}.`);
}
