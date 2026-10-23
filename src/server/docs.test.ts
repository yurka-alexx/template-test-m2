// Doku, Dependabot und Template-Tauglichkeit ohne Dienste prüfen (AK7, Voraussetzungen für AK8).
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { envSchema } from "./env.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file: string) => Bun.file(`${root}${file}`).text();

/** Überschriften einer Markdown-Datei auf einer Ebene, ohne Codeblöcke. */
function headings(markdown: string, level: number): string[] {
  const prefix = `${"#".repeat(level)} `;
  let inCode = false;
  const result: string[] = [];
  for (const line of markdown.split("\n")) {
    if (line.startsWith("```")) inCode = !inCode;
    else if (!inCode && line.startsWith(prefix)) result.push(line.slice(prefix.length).trim());
  }
  return result;
}

/** Text eines Abschnitts `## titel` bis zur nächsten Überschrift derselben Ebene. */
function section(markdown: string, title: string): string {
  const start = markdown.indexOf(`\n## ${title}\n`);
  if (start === -1) return "";
  const rest = markdown.slice(start + title.length + 5);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("Doku-Dateien", () => {
  test("ARCHITEKTUR.md, BETRIEB.md, ENTSCHEIDUNGEN.md und CLAUDE.md sind vorhanden", async () => {
    for (const file of [
      "docs/ARCHITEKTUR.md",
      "docs/BETRIEB.md",
      "docs/ENTSCHEIDUNGEN.md",
      "CLAUDE.md",
    ]) {
      expect({ file, exists: await Bun.file(`${root}${file}`).exists() }).toEqual({
        file,
        exists: true,
      });
    }
  });

  test("ARCHITEKTUR.md hat die zwölf Abschnitte in dieser Reihenfolge", async () => {
    expect(headings(await read("docs/ARCHITEKTUR.md"), 2)).toEqual([
      "Überblick",
      "Stack und Gerüst",
      "Laufzeit und Prozesse",
      "Datenmodell",
      "Schnittstellen",
      "Sicherheit und Datenschutz",
      "Staging",
      "Produktion",
      "Meilensteine",
      "Risiken",
      "Offene Punkte",
      "Entscheidungen",
    ]);
  });

  test("ARCHITEKTUR.md enthält keine überholten Verweise auf Meilenstein 2", async () => {
    expect(await read("docs/ARCHITEKTUR.md")).not.toMatch(/folgt (erst )?in Meilenstein 2/);
  });

  test("BETRIEB.md hat die Abschnitte für lokal, Compose, Coolify, Caddy und Grenzen", async () => {
    expect(headings(await read("docs/BETRIEB.md"), 2)).toEqual([
      "Lokal entwickeln",
      "Lokal mit Docker Compose",
      "Coolify",
      "Compose plus Caddy für Kundenprojekte",
      "Grenzen",
    ]);
  });

  test("BETRIEB.md nennt jede Variable des Env-Schemas", async () => {
    const betrieb = await read("docs/BETRIEB.md");
    const keys = Object.keys(envSchema.shape);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !betrieb.includes(`\`${key}\``))).toEqual([]);
  });

  test("BETRIEB.md beschreibt Coolify mit Dockerfile, Port, Healthcheck, Admin, Seed und Probe", async () => {
    const coolify = section(await read("docs/BETRIEB.md"), "Coolify");
    for (const text of [
      "Dockerfile",
      "3000",
      "HEALTHCHECK",
      "curl",
      "Auto Deploy",
      "`main`",
      "PostgreSQL",
      "Nach dem ersten Start beide Variablen entfernen",
      "bun run seed",
      "/probe",
    ]) {
      expect({ text, found: coolify.includes(text) }).toEqual({ text, found: true });
    }
  });

  test("BETRIEB.md enthält ein Beispiel-Caddyfile mit reverse_proxy auf Port 3000", async () => {
    const caddy = section(await read("docs/BETRIEB.md"), "Compose plus Caddy für Kundenprojekte");
    expect(caddy).toMatch(/reverse_proxy app:3000/);
  });

  test("BETRIEB.md und CLAUDE.md beschreiben den Aufräum-Job der Sitzungen mit Paket und Grenze", async () => {
    const { dependencies } = (await Bun.file(`${root}package.json`).json()) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(dependencies)).toContain("croner");
    const grenzen = section(await read("docs/BETRIEB.md"), "Grenzen");
    for (const text of ["`croner`", "3 Uhr", "`sessions`", "nur für eine Instanz"]) {
      expect({ text, found: grenzen.includes(text) }).toEqual({ text, found: true });
    }
    const claude = await read("CLAUDE.md");
    for (const text of ["`croner`", "src/server/auth/cleanup.ts", "`0 3 * * *`", "eine Instanz"]) {
      expect({ text, found: claude.includes(text) }).toEqual({ text, found: true });
    }
  });

  test("CLAUDE.md nennt jeden Eintrag aus scripts in package.json in der Befehlstabelle", async () => {
    const befehle = section(await read("CLAUDE.md"), "Befehle");
    const { scripts } = (await Bun.file(`${root}package.json`).json()) as {
      scripts: Record<string, string>;
    };
    const names = Object.keys(scripts);
    expect(names.length).toBeGreaterThan(0);
    // `bun test` ist der eingebaute Testläufer, `bun run test` ruft genau ihn auf.
    const missing = names.filter(
      (name) => !befehle.includes(`\`bun run ${name}`) && !befehle.includes(`\`bun ${name}\``),
    );
    expect(missing).toEqual([]);
  });

  test("CLAUDE.md nennt Docker, /probe, BETRIEB.md und Dependabot", async () => {
    const claude = await read("CLAUDE.md");
    for (const text of [
      "docker compose up --build",
      "/probe",
      "docs/BETRIEB.md",
      ".github/dependabot.yml",
    ]) {
      expect({ text, found: claude.includes(text) }).toEqual({ text, found: true });
    }
  });

  test("README.md erklärt ein neues Projekt aus dem Template", async () => {
    const readme = await read("README.md");
    expect(headings(readme, 2)).toContain("Neues Projekt aus dem Template");
    expect(section(readme, "Neues Projekt aus dem Template")).toContain("Use this template");
  });

  // Im Starter pflegt der Ops-Layer docs/ENTSCHEIDUNGEN.md, ein neues Projekt leert sie nach der README.
  test("README erklärt das Leeren von ENTSCHEIDUNGEN.md", async () => {
    const template = section(await read("README.md"), "Neues Projekt aus dem Template");
    for (const text of [
      "docs/ENTSCHEIDUNGEN.md",
      "## Entscheidungen",
      "## Offene Bedenken",
      "## Offene Review-Befunde",
      "Noch keine Einträge.",
    ]) {
      expect({ text, found: template.includes(text) }).toEqual({ text, found: true });
    }
  });

  // Sonst leert eine Agent-Session, die CLAUDE.md liest, die Datei des Ops-Layers wieder.
  test("CLAUDE.md sagt, dass ENTSCHEIDUNGEN.md im Starter dem Ops-Layer gehört", async () => {
    const claude = await read("CLAUDE.md");
    expect(claude).toContain("`docs/ENTSCHEIDUNGEN.md` pflegt im Starter der Ops-Layer");
    // Die alten Aussagen von vor dem geänderten Abnahmekriterium 4 (Ticket 10).
    expect(claude).not.toMatch(/ENTSCHEIDUNGEN\.md`?[^\n]{0,40}im Starter leer/);
    expect(claude).not.toContain("`ENTSCHEIDUNGEN.md` ist das leere Gerüst");
  });
});

type Update = {
  "package-ecosystem": string;
  directory: string;
  schedule?: { interval?: string };
  groups?: Record<string, { patterns?: string[] }>;
};

describe(".github/dependabot.yml", () => {
  const load = async () =>
    Bun.YAML.parse(await read(".github/dependabot.yml")) as { version: number; updates: Update[] };

  test("ist gültiges YAML in Version 2 für bun, github-actions und docker", async () => {
    const config = await load();
    expect(config.version).toBe(2);
    expect(config.updates.map((update) => update["package-ecosystem"]).sort()).toEqual([
      "bun",
      "docker",
      "github-actions",
    ]);
    for (const update of config.updates) expect(update.directory).toBe("/");
  });

  test("jedes Ökosystem läuft monatlich und bündelt alles in einer Gruppe", async () => {
    for (const update of (await load()).updates) {
      const ecosystem = update["package-ecosystem"];
      expect({ ecosystem, interval: update.schedule?.interval }).toEqual({
        ecosystem,
        interval: "monthly",
      });
      const groups = Object.values(update.groups ?? {});
      expect({ ecosystem, groups: groups.length }).toEqual({ ecosystem, groups: 1 });
      expect(groups[0]?.patterns).toEqual(["*"]);
    }
  });
});

describe("Template-Tauglichkeit", () => {
  // Zusammengesetzt, damit diese Datei sich nicht selbst findet.
  const forbidden = [["starter", "react", "shadcn"].join("-"), ["yurka", "alexx"].join("-")];

  /** Workflows, Dependabot, Compose- und Docker-Dateien laut git. */
  function configFiles(): string[] {
    const listed = Bun.spawnSync(
      ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
      {
        cwd: root,
      },
    );
    expect(listed.exitCode).toBe(0);
    return listed.stdout
      .toString()
      .split("\n")
      .filter(
        (file) =>
          file.startsWith(".github/") ||
          /(^|\/)(compose|docker-compose)[^/]*\.ya?ml$/.test(file) ||
          /(^|\/)Dockerfile[^/]*$/.test(file) ||
          /(^|\/)\.dockerignore$/.test(file),
      );
  }

  test("kein Workflow, keine Compose- oder Docker-Datei nennt den Repo-Namen oder den Besitzer", async () => {
    const files = configFiles();
    for (const file of [".github/workflows/ci.yml", "compose.yaml", "Dockerfile"]) {
      expect(files).toContain(file);
    }
    const hits: string[] = [];
    for (const file of files) {
      const text = (await read(file)).toLowerCase();
      for (const name of forbidden) if (text.includes(name)) hits.push(`${file}: ${name}`);
    }
    expect(hits).toEqual([]);
  });

  test("Workflows starten bei Push, Pull Request und workflow_dispatch, ohne Geheimnisse", async () => {
    const workflows = configFiles().filter((file) => /^\.github\/workflows\/.+\.ya?ml$/.test(file));
    expect(workflows.length).toBeGreaterThan(0);
    for (const file of workflows) {
      const text = await read(file);
      const workflow = Bun.YAML.parse(text) as { on?: Record<string, unknown> };
      expect({ file, on: Object.keys(workflow.on ?? {}).sort() }).toEqual({
        file,
        on: ["pull_request", "push", "workflow_dispatch"],
      });
      expect({ file, secrets: /\bsecrets\./.test(text) }).toEqual({ file, secrets: false });
    }
  });
});
