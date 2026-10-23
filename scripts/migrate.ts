// bun run db:migrate: spielt die Migrationen aus drizzle/ ein, ohne den Server zu starten.
import { createDb } from "../src/server/db/index.ts";
import { runMigrations } from "../src/server/db/migrate.ts";
import { loadEnv } from "../src/server/env.ts";

const env = loadEnv();
const { db, client } = createDb(env.DATABASE_URL);
try {
  await runMigrations(db);
  console.log("Migrationen eingespielt.");
} finally {
  await client.end({ timeout: 5 });
}
