import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { EnvError, envSchema, parseEnv } from "./env.ts";
import { spawnServer, unreachableDatabaseUrl } from "./test-helpers.ts";

const valid = {
  DATABASE_URL: "postgres://app:app@localhost:5432/app",
  APP_URL: "http://localhost:3000",
  NODE_ENV: "production",
  PORT: "8080",
};

describe("parseEnv", () => {
  test("liest gültige Werte und wandelt PORT in eine Zahl", () => {
    expect(parseEnv(valid)).toEqual({ ...valid, NODE_ENV: "production", PORT: 8080 });
  });

  test("setzt Standardwerte für NODE_ENV und PORT", () => {
    const env = parseEnv({ DATABASE_URL: valid.DATABASE_URL, APP_URL: valid.APP_URL });
    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(3000);
  });

  test("bricht bei fehlender DATABASE_URL mit klarer Meldung ab", () => {
    const { DATABASE_URL: _, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(EnvError);
    expect(() => parseEnv(rest)).toThrow(/DATABASE_URL: fehlt/);
  });

  test("lehnt eine Nicht-Postgres-URL ab und nennt das erwartete Format", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://localhost/app" })).toThrow(
      /DATABASE_URL: muss eine Postgres-URL sein/,
    );
  });

  test("nennt alle fehlerhaften Variablen auf einmal", () => {
    let message = "";
    try {
      parseEnv({ PORT: "abc" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL: fehlt");
    expect(message).toContain("APP_URL: fehlt");
    expect(message).toContain("PORT:");
    expect(message).toContain(".env.example");
  });
});

describe("ADMIN_EMAIL und ADMIN_PASSWORD", () => {
  const admin = { ADMIN_EMAIL: "Chefin@Example.test", ADMIN_PASSWORD: "start-passwort-123" };

  test("sind optional, leere Werte aus .env.example gelten als nicht gesetzt", () => {
    const env = parseEnv({ ...valid, ADMIN_EMAIL: "", ADMIN_PASSWORD: "" });
    expect(env.ADMIN_EMAIL).toBeUndefined();
    expect(env.ADMIN_PASSWORD).toBeUndefined();
  });

  test("werden gelesen, die E-Mail klein geschrieben", () => {
    const env = parseEnv({ ...valid, ...admin });
    expect(env.ADMIN_EMAIL).toBe("chefin@example.test");
    expect(env.ADMIN_PASSWORD).toBe(admin.ADMIN_PASSWORD);
  });

  test("ein Passwort unter 12 Zeichen wird abgelehnt", () => {
    expect(() => parseEnv({ ...valid, ...admin, ADMIN_PASSWORD: "elf-zeichen" })).toThrow(
      /ADMIN_PASSWORD: muss mindestens 12 Zeichen lang sein/,
    );
  });

  test("nur eine der beiden Variablen gesetzt wird abgelehnt", () => {
    expect(() => parseEnv({ ...valid, ADMIN_EMAIL: admin.ADMIN_EMAIL })).toThrow(
      /ADMIN_PASSWORD: ADMIN_EMAIL und ADMIN_PASSWORD nur gemeinsam setzen/,
    );
    expect(() => parseEnv({ ...valid, ADMIN_PASSWORD: admin.ADMIN_PASSWORD })).toThrow(
      /ADMIN_EMAIL: ADMIN_EMAIL und ADMIN_PASSWORD nur gemeinsam setzen/,
    );
  });
});

describe("BASIC_AUTH_USER und BASIC_AUTH_PASSWORD", () => {
  const basic = { BASIC_AUTH_USER: "staging", BASIC_AUTH_PASSWORD: "staging-passwort" };

  test("sind optional, leere Werte aus .env.example gelten als nicht gesetzt", () => {
    for (const source of [valid, { ...valid, BASIC_AUTH_USER: "", BASIC_AUTH_PASSWORD: "" }]) {
      const env = parseEnv(source);
      expect(env.BASIC_AUTH_USER).toBeUndefined();
      expect(env.BASIC_AUTH_PASSWORD).toBeUndefined();
    }
  });

  test("werden gelesen, wenn beide gesetzt sind", () => {
    expect(parseEnv({ ...valid, ...basic })).toMatchObject(basic);
  });

  test("nur eine der beiden Variablen gesetzt wird abgelehnt", () => {
    expect(() => parseEnv({ ...valid, BASIC_AUTH_USER: basic.BASIC_AUTH_USER })).toThrow(
      /BASIC_AUTH_PASSWORD: BASIC_AUTH_USER und BASIC_AUTH_PASSWORD nur gemeinsam setzen/,
    );
    expect(() =>
      parseEnv({ ...valid, BASIC_AUTH_USER: "", BASIC_AUTH_PASSWORD: basic.BASIC_AUTH_PASSWORD }),
    ).toThrow(/BASIC_AUTH_USER: BASIC_AUTH_USER und BASIC_AUTH_PASSWORD nur gemeinsam setzen/);
  });

  test("ein Benutzer mit Doppelpunkt wird abgelehnt (Basic Auth trennt daran)", () => {
    expect(() => parseEnv({ ...valid, ...basic, BASIC_AUTH_USER: "a:b" })).toThrow(
      /BASIC_AUTH_USER: darf keinen Doppelpunkt enthalten/,
    );
  });
});

describe("Start ohne gültige Umgebung", () => {
  test("bricht mit Exit-Code 1 und Meldung zur fehlenden Variable ab", async () => {
    const proc = spawnServer({ APP_URL: valid.APP_URL });
    expect(await proc.exited).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("Ungültige Umgebungsvariablen");
    expect(stderr).toContain("DATABASE_URL: fehlt");
  });

  test("bricht ab, wenn nur BASIC_AUTH_USER gesetzt ist", async () => {
    // Die Umgebung wird vor der Datenbank geprüft, deshalb reicht eine unerreichbare URL.
    const proc = spawnServer({
      DATABASE_URL: unreachableDatabaseUrl,
      APP_URL: valid.APP_URL,
      BASIC_AUTH_USER: "staging",
    });
    expect(await proc.exited).toBe(1);
    const stderr = await new Response(proc.stderr).text();
    expect(stderr).toContain("Ungültige Umgebungsvariablen");
    expect(stderr).toContain(
      "BASIC_AUTH_PASSWORD: BASIC_AUTH_USER und BASIC_AUTH_PASSWORD nur gemeinsam setzen",
    );
  });
});

/**
 * Variablen in .env.example, die nicht der Server liest, sondern nur ein Skript mit eigenem
 * Schema (`seedEnvSchema` in scripts/seed.ts, Playwright über e2e/helpers.ts).
 */
const SCRIPT_ONLY_KEYS = ["SEED_ADMIN_PASSWORD", "SEED_USER_PASSWORD"] as const;

/** Schlüssel einer Beispieldatei im Format von .env.example (Kommentare und Leerzeilen zählen nicht). */
function exampleKeys(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0]?.trim() ?? "");
}

/**
 * Gleicht die Schlüssel des Env-Schemas mit der Beispieldatei ab und meldet beide Richtungen:
 * was das Schema liest, aber in der Datei fehlt, und was in der Datei steht, aber weder das
 * Schema noch `scriptOnlyKeys` kennt.
 */
function compareEnvExample(
  schema: { shape: Record<string, unknown> },
  exampleText: string,
  scriptOnlyKeys: readonly string[] = SCRIPT_ONLY_KEYS,
) {
  const schemaKeys = new Set(Object.keys(schema.shape));
  const allowed = new Set([...schemaKeys, ...scriptOnlyKeys]);
  const actual = new Set(exampleKeys(exampleText));
  return {
    missingInExample: [...schemaKeys].filter((key) => !actual.has(key)).sort(),
    unknownInExample: [...actual].filter((key) => !allowed.has(key)).sort(),
  };
}

describe(".env und .env.example", () => {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const readExample = () => Bun.file(`${root}.env.example`).text();
  const inSync = { missingInExample: [], unknownInExample: [] };

  test(".env ist von git ignoriert, .env.example nicht", () => {
    const ignored = Bun.spawnSync(["git", "check-ignore", "-q", ".env"], { cwd: root });
    expect(ignored.exitCode).toBe(0);
    const example = Bun.spawnSync(["git", "check-ignore", "-q", ".env.example"], { cwd: root });
    expect(example.exitCode).toBe(1);
  });

  test(".env.example passt zum Env-Schema (zusätzlich erlaubt: SCRIPT_ONLY_KEYS)", async () => {
    expect(compareEnvExample(envSchema, await readExample())).toEqual(inSync);
  });

  test("SCRIPT_ONLY_KEYS sind genau die zwei Seed-Variablen und nicht im Server-Schema", () => {
    expect([...SCRIPT_ONLY_KEYS]).toEqual(["SEED_ADMIN_PASSWORD", "SEED_USER_PASSWORD"]);
    for (const key of SCRIPT_ONLY_KEYS) expect(Object.keys(envSchema.shape)).not.toContain(key);
  });

  test("schlägt fehl, wenn das Schema eine Variable liest, die in .env.example fehlt", async () => {
    const extended = z.object({ ...envSchema.shape, NEUE_VARIABLE: z.string() });
    const result = compareEnvExample(extended, await readExample());
    expect(result).not.toEqual(inSync);
    expect(result).toEqual({ missingInExample: ["NEUE_VARIABLE"], unknownInExample: [] });
  });

  test("schlägt fehl, wenn .env.example eine Variable enthält, die niemand liest", async () => {
    const text = `${await readExample()}# Kommentar\nVERWAIST=wert\n`;
    const result = compareEnvExample(envSchema, text);
    expect(result).not.toEqual(inSync);
    expect(result).toEqual({ missingInExample: [], unknownInExample: ["VERWAIST"] });
  });

  test("die Seed-Variablen sind nur erlaubt, solange sie in SCRIPT_ONLY_KEYS stehen", async () => {
    const text = `${await readExample()}SEED_ADMIN_PASSWORD=\nSEED_USER_PASSWORD=\n`;
    expect(compareEnvExample(envSchema, text)).toEqual(inSync);
    expect(compareEnvExample(envSchema, text, []).unknownInExample).toEqual([...SCRIPT_ONLY_KEYS]);
  });
});
