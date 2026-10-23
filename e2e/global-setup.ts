// Läuft einmal vor allen Specs, nachdem Playwright den Server gestartet hat (webServer).
// Testdaten: Migrationen und `bun run seed` mit SEED_ADMIN_PASSWORD/SEED_USER_PASSWORD, danach
// Reste früherer Läufe (Aufgaben mit E2E-Präfix) löschen, damit die Liste genau 30 Seed-Aufgaben hat.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { account, deleteE2eTasks } from "./helpers.ts";

export default async function globalSetup() {
  // Bricht mit klarer Meldung ab, bevor der Seed ohne Konten läuft.
  account("admin");
  account("benutzer");

  // scripts/seed.ts spielt vorher die Migrationen ein und setzt die 30 Aufgaben zurück.
  const root = fileURLToPath(new URL("..", import.meta.url));
  execFileSync("bun", ["run", "seed"], { cwd: root, stdio: "inherit" });

  await deleteE2eTasks();
}
