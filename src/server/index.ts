import { createApp } from "./app.ts";
import { bootstrapAdmin } from "./auth/bootstrap.ts";
import { startSessionCleanup } from "./auth/cleanup.ts";
import { createDb } from "./db/index.ts";
import { runMigrations } from "./db/migrate.ts";
import { loadEnv } from "./env.ts";
import { defaultClientDir, hasClientBuild } from "./static.ts";

// Start-Reihenfolge laut docs/ARCHITEKTUR.md: Env prüfen, Migrationen, erster Admin, Port öffnen,
// danach der tägliche Zeitplan für abgelaufene Sitzungen.
const env = loadEnv();
const { db, client } = createDb(env.DATABASE_URL);

try {
  await runMigrations(db);
} catch (error) {
  const host = new URL(env.DATABASE_URL).host;
  // Drizzle verpackt den Treiberfehler (z. B. ECONNREFUSED) in `cause`, der ist die eigentliche Ursache.
  const root = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const reason = root instanceof Error ? root.message || root.name : String(root);
  console.error(
    `Start abgebrochen: Migrationen konnten nicht eingespielt werden (Datenbank ${host}).\n` +
      `Läuft Postgres und stimmt DATABASE_URL? Ursache: ${reason}`,
  );
  await client.end({ timeout: 1 });
  process.exit(1);
}

try {
  await bootstrapAdmin(db, { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`Start abgebrochen: erster Admin aus ADMIN_EMAIL/ADMIN_PASSWORD. ${reason}`);
  await client.end({ timeout: 1 });
  process.exit(1);
}

if (!hasClientBuild(defaultClientDir)) {
  console.log(
    "Oberfläche nicht gebaut (dist/client fehlt), nur API. Bauen: bun run build. " +
      "Entwicklung: bun run dev, Oberfläche auf http://localhost:5173",
  );
}

const app = createApp({ db, env, clientDir: defaultClientDir });
const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
const sessionCleanup = startSessionCleanup(db);

// Vor der Meldung „API läuft auf“ registrieren, sonst beendet ein frühes Signal den Prozess hart.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    sessionCleanup.stop();
    await server.stop();
    await client.end({ timeout: 5 });
    process.exit(0);
  });
}

console.log(`API läuft auf http://localhost:${server.port}`);
