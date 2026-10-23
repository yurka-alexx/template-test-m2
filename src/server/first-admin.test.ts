// AK10: Bei leerer Datenbank gibt es keinen Benutzer und keine Anmeldung, bis der erste Admin per
// `bun run user:create` oder über ADMIN_EMAIL/ADMIN_PASSWORD angelegt ist. Geprüft mit echtem
// Serverprozess gegen je eine frische Wegwerf-Datenbank, die Datenbank aus DATABASE_URL bleibt unberührt.

import { afterAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDb } from "./db/index.ts";
import { users } from "./db/schema.ts";
import { spawnServer, testDatabaseUrl, waitForAddress } from "./test-helpers.ts";

// Datenbank anlegen, Serverstart mit Migrationen und argon2id-Hashes brauchen mehr als Buns 5 Sekunden.
const TIMEOUT_MS = 20_000;
const baseEnv = { APP_URL: "http://localhost:3000", NODE_ENV: "test", PORT: "0" };
const userCreateScript = fileURLToPath(new URL("../../scripts/user-create.ts", import.meta.url));
const admin = { email: "erste-admin@example.test", password: "erstes-admin-passwort" };

const server = createDb(testDatabaseUrl());
const created: string[] = [];
afterAll(async () => {
  for (const name of created) {
    await server.db.execute(sql.raw(`drop database if exists ${name} with (force)`));
  }
  await server.client.end({ timeout: 1 });
});

/** Legt eine leere Datenbank an (ohne Migrationen) und gibt ihre URL zurück. */
async function emptyDatabase() {
  const name = `first_admin_test_${crypto.randomUUID().replaceAll("-", "")}`;
  await server.db.execute(sql.raw(`create database ${name}`));
  created.push(name);
  return Object.assign(new URL(testDatabaseUrl()), { pathname: `/${name}` }).toString();
}

/** Startet den Server gegen `url`, führt `run` mit seiner Adresse aus und beendet ihn wieder. */
async function withServer(
  url: string,
  env: Record<string, string>,
  run: (address: string) => Promise<void>,
) {
  const proc = spawnServer({ ...baseEnv, DATABASE_URL: url, ...env });
  try {
    const { address } = await waitForAddress(proc.stdout);
    await run(address);
  } finally {
    proc.kill();
    await proc.exited;
  }
}

const login = (address: string, credentials: { email: string; password: string }) =>
  fetch(`${address}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

async function userCount(url: string) {
  const conn = createDb(url);
  try {
    return (await conn.db.select().from(users)).length;
  } finally {
    await conn.client.end({ timeout: 1 });
  }
}

describe("Leere Datenbank: erster Admin", () => {
  test(
    "ohne Admin kein Benutzer und keine Anmeldung, nach user:create klappt sie",
    async () => {
      const url = await emptyDatabase();
      await withServer(url, {}, async (address) => {
        // Der Server hat die Migrationen eingespielt, es gibt aber keinen Standardzugang.
        expect(await userCount(url)).toBe(0);
        expect((await login(address, admin)).status).toBe(401);
        expect((await fetch(`${address}/api/auth/me`)).status).toBe(401);

        const proc = Bun.spawn(
          [
            "bun",
            "--no-env-file",
            userCreateScript,
            ...["--email", admin.email, "--name", "Erste Admin", "--role", "admin"],
          ],
          {
            env: { PATH: process.env.PATH ?? "", DATABASE_URL: url, APP_URL: baseEnv.APP_URL },
            stdin: new Blob([`${admin.password}\n`]),
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        expect(await proc.exited).toBe(0);
        expect(await userCount(url)).toBe(1);

        const res = await login(address, admin);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ user: { email: admin.email, role: "admin" } });
      });
    },
    TIMEOUT_MS,
  );

  test(
    "mit ADMIN_EMAIL/ADMIN_PASSWORD legt der Start den Admin an, die Anmeldung klappt",
    async () => {
      const url = await emptyDatabase();
      const env = { ADMIN_EMAIL: admin.email, ADMIN_PASSWORD: admin.password };
      await withServer(url, env, async (address) => {
        expect(await userCount(url)).toBe(1);
        expect((await login(address, { ...admin, password: "falsches-passwort-1" })).status).toBe(
          401,
        );
        const res = await login(address, admin);
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ user: { email: admin.email, role: "admin" } });
      });
    },
    TIMEOUT_MS,
  );
});
