// bun run test:e2e: Playwright gegen die gebaute App (bun run build, bun run start) mit Postgres.
// Vorher spielt global-setup.ts Migrationen und Seed ein (30 Aufgaben, Test-Admin, Test-Benutzer).
import { defineConfig, devices } from "@playwright/test";
import { baseURL } from "./helpers.ts";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: "./global-setup.ts",
  // Pfade relativ zu e2e/, beide Ordner sind in .gitignore. In CI als Artefakt bei Fehlern.
  outputDir: "./test-results",
  // Ein Worker: Die Specs teilen sich die Seed-Daten, angelegte Aufgaben würden sonst die
  // Erwartungen der Liste (Sortierung, Filter, Seite 2) verschieben.
  workers: 1,
  fullyParallel: false,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci
    ? [["list"], ["html", { open: "never", outputFolder: "./playwright-report" }], ["github"]]
    : [["list"]],
  use: {
    baseURL,
    locale: "de-DE",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Immer frisch bauen und starten, nie einen laufenden Server (etwa bun run dev) mitbenutzen.
    command: "bun run build && bun run start",
    cwd: "..",
    url: `${baseURL}/healthz`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
