// bun run user:create --email … --name … --role admin|benutzer
// Passwort: im Terminal verdeckt abgefragt, sonst aus stdin gelesen (echo "…" | bun run user:create …).
import { parseArgs } from "node:util";
import { createUser, EmailTakenError } from "../src/server/auth/users.ts";
import { createDb } from "../src/server/db/index.ts";
import { runMigrations } from "../src/server/db/migrate.ts";
import { loadEnv } from "../src/server/env.ts";
import { ValidationError } from "../src/server/errors.ts";
import { userCreateSchema } from "../src/shared/schemas/user.ts";

const usage = "Aufruf: bun run user:create --email <E-Mail> --name <Name> --role admin|benutzer";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function printFieldErrors(fields: Record<string, string[]>): never {
  const lines = Object.entries(fields).map(
    ([key, messages]) => `  - ${key}: ${messages.join(", ")}`,
  );
  fail(`Ungültige Angaben:\n${lines.join("\n")}`);
}

/** Liest eine Zeile ohne Echo (Rohmodus des Terminals). */
function readHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  let input = "";
  return new Promise((resolve, reject) => {
    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          finish();
          resolve(input);
          return;
        }
        if (char === "\u0003") {
          finish();
          reject(new Error("Abgebrochen."));
          return;
        }
        if (char === "\u007f" || char === "\b") input = [...input].slice(0, -1).join("");
        else input += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    // Nur den abschließenden Zeilenumbruch entfernen, Leerzeichen gehören zum Passwort.
    return (await Bun.stdin.text()).replace(/\r?\n$/, "");
  }
  const password = await readHidden("Passwort (mindestens 12 Zeichen): ");
  const repeat = await readHidden("Passwort wiederholen: ");
  if (password !== repeat) fail("Die Passwörter stimmen nicht überein.");
  return password;
}

let args: { email?: string; name?: string; role?: string };
try {
  ({ values: args } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string" },
    },
  }));
} catch (error) {
  fail(`${(error as Error).message}\n${usage}`);
}

// Angaben ohne Passwort zuerst prüfen, damit niemand umsonst ein Passwort eintippt.
const head = userCreateSchema.omit({ password: true }).safeParse(args);
if (!head.success) {
  console.error(usage);
  printFieldErrors(ValidationError.fromZod(head.error).fields);
}

const password = await readPassword().catch((error: Error) => fail(error.message));
const parsed = userCreateSchema.safeParse({ ...head.data, password });
if (!parsed.success) printFieldErrors(ValidationError.fromZod(parsed.error).fields);

const env = loadEnv();
const { db, client } = createDb(env.DATABASE_URL);
try {
  // Legt bei leerer Datenbank die Tabellen an, auch wenn der Server noch nie lief.
  await runMigrations(db);
  const user = await createUser(db, parsed.data);
  console.log(`Benutzer ${user.email} (${user.role}) angelegt.`);
} catch (error) {
  if (error instanceof EmailTakenError) fail(error.message);
  throw error;
} finally {
  await client.end({ timeout: 5 });
}
