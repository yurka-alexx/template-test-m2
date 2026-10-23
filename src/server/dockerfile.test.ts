// Docker-Dateien ohne Docker prüfen: Build, Compose und Healthcheck selbst belegt der CI-Job "docker".
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (file: string) => Bun.file(`${root}${file}`).text();

const dockerfile = await read("Dockerfile");
const dockerignore = (await read(".dockerignore"))
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));

/** Wie Docker: die letzte passende Zeile entscheidet, ein Muster gilt auch für alles darunter. */
function isIgnored(path: string): boolean {
  const parts = path.split("/");
  let ignored = false;
  for (const line of dockerignore) {
    const negated = line.startsWith("!");
    const glob = new Bun.Glob(negated ? line.slice(1) : line);
    const matches = parts.some((_, index) => glob.match(parts.slice(0, index + 1).join("/")));
    if (matches) ignored = !negated;
  }
  return ignored;
}

type Service = Record<string, unknown> & { environment?: Record<string, string>; ports?: string[] };
const compose = Bun.YAML.parse(await read("compose.yaml")) as { services: Record<string, Service> };

type Step = { run?: string; if?: string };
const ci = Bun.YAML.parse(await read(".github/workflows/ci.yml")) as {
  jobs: Record<string, { needs?: unknown; env?: Record<string, string>; steps: Step[] }>;
};

describe("Dockerfile", () => {
  test("Bun-Version stimmt mit packageManager in package.json überein", async () => {
    const { packageManager } = (await Bun.file(`${root}package.json`).json()) as {
      packageManager: string;
    };
    const expected = packageManager.replace(/^bun@/, "");
    expect(dockerfile.match(/^ARG BUN_VERSION=(\S+)$/m)?.[1]).toBe(expected);

    const images = [...dockerfile.matchAll(/^FROM (\S+)/gm)].map((match) => match[1]);
    expect(images.length).toBeGreaterThanOrEqual(2);
    // Alle Stufen auf demselben slim-Image, Version nur über das ARG.
    for (const image of images) expect(image).toBe(`oven/bun:\${BUN_VERSION}-slim`);
  });

  test("Laufzeitstufe läuft als Benutzer bun, nicht als root", () => {
    const runtime = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));
    const users = [...runtime.matchAll(/^USER (\S+)$/gm)].map((match) => match[1]);
    expect(users).toEqual(["bun"]);
  });

  test("Laufzeitstufe setzt Produktion, Port 3000, Healthcheck und startet bun run start", () => {
    const runtime = dockerfile.slice(dockerfile.lastIndexOf("\nFROM "));
    expect(runtime).toMatch(/^ENV NODE_ENV=production$/m);
    expect(runtime).toMatch(/^ENV PORT=3000$/m);
    expect(runtime).toMatch(/^EXPOSE 3000$/m);
    expect(runtime).toMatch(/^HEALTHCHECK [^\n]*(\\\n[^\n]*)*\/healthz/m);
    expect(runtime).toMatch(/^CMD \["bun", "run", "start"\]$/m);
  });

  test("Abhängigkeiten aus dem Lockfile", () => {
    expect(dockerfile).toContain("RUN bun install --frozen-lockfile\n");
    expect(dockerfile).toContain("RUN bun install --frozen-lockfile --production\n");
  });
});

describe(".dockerignore", () => {
  test("schließt Geheimnisse und lokale Abhängigkeiten aus", () => {
    for (const path of [
      ".env",
      ".env.local",
      ".env.production",
      "node_modules/hono/package.json",
      ".git/config",
      "dist/client/index.html",
      "e2e/test-results/trace.zip",
      "e2e/playwright-report/index.html",
    ]) {
      expect({ path, ignored: isIgnored(path) }).toEqual({ path, ignored: true });
    }
  });

  test("lässt .env.example und den Quellcode im Build-Kontext", () => {
    for (const path of [
      ".env.example",
      "package.json",
      "bun.lock",
      "src/server/index.ts",
      "drizzle/0000_init.sql",
    ]) {
      expect({ path, ignored: isIgnored(path) }).toEqual({ path, ignored: false });
    }
  });
});

describe("compose.yaml", () => {
  test("Dienst app wird gebaut, wartet auf db und zeigt auf db:5432", () => {
    const app = compose.services.app;
    expect(app?.build).toBe(".");
    expect(app?.depends_on).toEqual({ db: { condition: "service_healthy" } });
    expect(new URL(app?.environment?.DATABASE_URL ?? "").host).toBe("db:5432");
    expect(app?.ports).toEqual(["3000:3000"]);
  });

  test("APP_URL, Basic Auth, Admin- und Seed-Passwörter kommen ohne Standardwert aus der Umgebung", () => {
    const env = compose.services.app?.environment ?? {};
    for (const key of [
      "APP_URL",
      "BASIC_AUTH_USER",
      "BASIC_AUTH_PASSWORD",
      "ADMIN_EMAIL",
      "ADMIN_PASSWORD",
      "SEED_ADMIN_PASSWORD",
      "SEED_USER_PASSWORD",
    ]) {
      expect(env[key]).toBe(`\${${key}:-}`);
    }
  });

  test("bun run dev startet weiterhin nur den Dienst db", async () => {
    const dev = await read("scripts/dev.ts");
    expect(dev).toContain('["docker", "compose", "up", "-d", "--wait", "db"]');
    expect(compose.services.db?.ports).toEqual(["5432:5432"]);
  });
});

describe("CI-Job docker", () => {
  test("ist unabhängig vom Job check und räumt immer auf", () => {
    const job = ci.jobs.docker;
    expect(job).toBeDefined();
    expect(job?.needs).toBeUndefined();
    const runs = job?.steps.map((step) => step.run ?? "").join("\n") ?? "";
    for (const command of [
      "docker build",
      "id -u",
      "docker compose up -d --build",
      "/healthz",
      "seq 1 60",
      "to_regclass('public.users')",
      "/api/auth/login",
      "docker compose exec -T app bun run seed",
      'test "$count" = "30"',
    ]) {
      expect(runs).toContain(command);
    }
    expect(job?.steps.find((step) => step.run === "docker compose logs")?.if).toBe("failure()");
    expect(job?.steps.find((step) => step.run === "docker compose down -v")?.if).toBe("always()");
  });

  test("setzt APP_URL für compose.yaml (dort ohne Standardwert)", () => {
    expect(ci.jobs.docker?.env?.APP_URL).toBe("http://localhost:3000");
  });
});
