// bun run dev: Postgres aus compose.yaml starten, auf "healthy" warten, dann parallel
// die API mit --watch (Port 3000) und Vite (Port 5173, leitet /api an die API weiter).
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";

const envFile = ".env";
if (!existsSync(envFile)) {
  await copyFile(".env.example", envFile);
  console.log(`${envFile} fehlte und wurde aus .env.example angelegt.`);
}

if (!Bun.which("docker")) {
  console.error("Docker fehlt: bun run dev startet Postgres über docker compose (compose.yaml).");
  process.exit(1);
}

const db = Bun.spawn(["docker", "compose", "up", "-d", "--wait", "db"], {
  stdio: ["inherit", "inherit", "inherit"],
});
if ((await db.exited) !== 0) {
  console.error("Postgres konnte nicht gestartet werden (läuft Docker?).");
  process.exit(1);
}

const children = [
  Bun.spawn(["bun", "--watch", "src/server/index.ts"], {
    stdio: ["inherit", "inherit", "inherit"],
  }),
  // --bun: Vite läuft mit Bun, Node muss nicht installiert sein.
  Bun.spawn(["bun", "--bun", "vite"], { stdio: ["inherit", "inherit", "inherit"] }),
];
console.log("Oberfläche: http://localhost:5173 (API: http://localhost:3000)");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
  });
}

// Endet einer der beiden Prozesse, wird auch der andere beendet.
const code = await Promise.race(children.map((child) => child.exited));
for (const child of children) child.kill();
await Promise.all(children.map((child) => child.exited));
process.exit(code);
