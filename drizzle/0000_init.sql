-- Erste Migration ohne Fachtabellen: belegt, dass der Migrator beim Start läuft.
-- Tabellen kommen über `bun run db:generate` aus src/server/db/schema.ts.
SELECT 1;
