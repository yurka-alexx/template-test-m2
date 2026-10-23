// Dateipfade aus `import.meta.url` nur über `fileURLToPath`: `URL.pathname` ist prozent-kodiert,
// in einem Ordner mit Leerzeichen oder Umlaut („Meine Projekte“) zeigt der Pfad dann ins Leere.
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const pattern = /new URL\([^)]*import\.meta\.url\)\.pathname/;

describe("Pfade aus import.meta.url", () => {
  test("pathname ist prozent-kodiert, fileURLToPath nicht", () => {
    const base = "file:///Users/x/Meine%20Projekte/starter/vite.config.ts";
    expect(new URL("./src/client", base).pathname).toBe(
      "/Users/x/Meine%20Projekte/starter/src/client",
    );
    expect(fileURLToPath(new URL("./src/client", base))).toBe(
      "/Users/x/Meine Projekte/starter/src/client",
    );
  });

  test("kein `.pathname` auf einer URL aus import.meta.url im Repo", async () => {
    const hits: string[] = [];
    let scanned = 0;
    for (const glob of ["*.ts", "{src,scripts,e2e}/**/*.{ts,tsx}"]) {
      for await (const file of new Bun.Glob(glob).scan({ cwd: root })) {
        scanned++;
        const lines = (await Bun.file(`${root}${file}`).text()).split("\n");
        lines.forEach((line, index) => {
          if (pattern.test(line)) hits.push(`${file}:${index + 1}`);
        });
      }
    }
    expect(scanned).toBeGreaterThan(50);
    expect(hits).toEqual([]);
  });
});
