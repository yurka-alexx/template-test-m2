// Gemeinsame Helfer für Tests mit Datenbank (lokal Postgres aus compose.yaml, in CI der Service-Container).
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import type { Role } from "../shared/schemas/user.ts";
import type { AppDeps } from "./app.ts";
import { createUser } from "./auth/users.ts";
import { createDb, type Db } from "./db/index.ts";
import { runMigrations } from "./db/migrate.ts";

export function testDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL fehlt: Tests mit Datenbank brauchen Postgres (lokal: docker compose up -d db und .env aus .env.example).",
    );
  }
  return url;
}

/** Eine Postgres-URL, unter der garantiert niemand antwortet (Port 1). */
export const unreachableDatabaseUrl = "postgres://app:app@127.0.0.1:1/app";

export const serverEntry = fileURLToPath(new URL("./index.ts", import.meta.url));

/** Startet den Server als eigenen Prozess, ohne automatisch eine lokale .env zu laden. */
export function spawnServer(env: Record<string, string>) {
  return Bun.spawn(["bun", "--no-env-file", serverEntry], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
}

/** Liest stdout, bis der Server seine Adresse meldet. Gibt Adresse und Ausgabe bis dahin zurück. */
export async function waitForAddress(stream: ReadableStream<Uint8Array>, timeoutMs = 15_000) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
    const match = output.match(/API läuft auf (http:\/\/\S+)/);
    if (match?.[1]) {
      reader.releaseLock();
      return { address: match[1], output };
    }
  }
  throw new Error(`Server meldet keine Adresse. Ausgabe:\n${output}`);
}

/** Umgebung für `createApp` in Tests. */
export const testAppEnv: AppDeps["env"] = { APP_URL: "http://localhost:3000", NODE_ENV: "test" };

// Laufende oder fertige Migration je Datenbank-URL. Zwei gleichzeitige Migrationen auf leerer
// Datenbank kollidieren bei `CREATE SCHEMA "drizzle"`, deshalb läuft sie pro Testlauf nur einmal.
const migrations = new Map<string, Promise<void>>();

/** Verbindung zur Test-Datenbank mit eingespielten Migrationen. */
export async function migratedTestDb(url = testDatabaseUrl()) {
  const conn = createDb(url);
  let migration = migrations.get(url);
  if (!migration) {
    migration = runMigrations(conn.db);
    migrations.set(url, migration);
    // Bei Fehlschlag darf der nächste Aufruf es erneut versuchen.
    migration.catch(() => migrations.delete(url));
  }
  await migration;
  return conn;
}

/** Leert Benutzer und Sitzungen. Achtung: gilt für die Datenbank aus DATABASE_URL. */
export async function resetAuthTables(db: Db) {
  await db.execute(sql`truncate table sessions, users cascade`);
}

/** Leert die Aufgaben. Achtung: gilt für die Datenbank aus DATABASE_URL. */
export async function resetTaskTables(db: Db) {
  await db.execute(sql`truncate table tasks`);
}

/** Legt einen Benutzer mit bekanntem Passwort an. */
export function createTestUser(db: Db, role: Role, email = `${role}@example.test`) {
  return createUser(db, { email, name: `Test ${role}`, password: testPassword, role });
}

export const testPassword = "richtig-langes-passwort";

/** Vollständiger Set-Cookie-Header für dieses Cookie, sonst undefined. */
export function setCookieHeader(res: Response, name: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

/** Meldet über `POST /api/auth/login` an (Passwort `testPassword`) und gibt das Sitzungs-Token zurück. */
export async function loginToken(
  app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
  email: string,
): Promise<string> {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: testPassword }),
  });
  if (res.status !== 200) throw new Error(`Anmeldung ${email} fehlgeschlagen: ${res.status}`);
  const header = setCookieHeader(res, "sid") ?? "";
  return header.split(";")[0]?.slice("sid=".length) ?? "";
}
