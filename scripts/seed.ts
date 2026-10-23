// bun run seed: 30 synthetische Aufgaben, Test-Konten nur mit SEED_ADMIN_PASSWORD/SEED_USER_PASSWORD.
// Mehrfach ausführbar: Die Seed-Aufgaben werden auf ihren Ausgangsstand gesetzt, nicht verdoppelt.
import { z } from "zod";
import { createDb } from "../src/server/db/index.ts";
import { runMigrations } from "../src/server/db/migrate.ts";
import { seed } from "../src/server/db/seed.ts";
import { loadEnv } from "../src/server/env.ts";
import { passwordSchema } from "../src/shared/schemas/user.ts";

// Leerer Wert gilt als nicht gesetzt. Ohne Wert kein Konto, es gibt keinen festen Standardzugang.
// Gesetzte Werte folgen der Passwortregel (mindestens 12 Zeichen), sonst Abbruch vor dem Seed.
const optionalPassword = z.preprocess(
  (value) => (value === "" ? undefined : value),
  passwordSchema.optional(),
);

// Eigenes Schema statt Server-Env: Der Server braucht die Seed-Passwörter zur Laufzeit nicht.
const seedEnvSchema = z.object({
  SEED_ADMIN_PASSWORD: optionalPassword,
  SEED_USER_PASSWORD: optionalPassword,
});

const env = loadEnv();
const seedEnv = seedEnvSchema.safeParse(process.env);
if (!seedEnv.success) {
  const lines = seedEnv.error.issues.map(
    (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
  );
  console.error(`Ungültige Umgebungsvariablen:\n${lines.join("\n")}`);
  process.exit(1);
}

const { db, client } = createDb(env.DATABASE_URL);
try {
  // Legt bei leerer Datenbank die Tabellen an, auch wenn der Server noch nie lief.
  await runMigrations(db);
  await seed(db, {
    adminPassword: seedEnv.data.SEED_ADMIN_PASSWORD,
    userPassword: seedEnv.data.SEED_USER_PASSWORD,
  });
} finally {
  await client.end({ timeout: 5 });
}
