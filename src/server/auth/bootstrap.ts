import type { Db } from "../db/index.ts";
import { adminExists, createUser } from "./users.ts";

export const BOOTSTRAP_ADMIN_NAME = "Admin";

export type BootstrapResult = "nicht-gesetzt" | "admin-existiert" | "angelegt";

/**
 * Erster Admin aus `ADMIN_EMAIL`/`ADMIN_PASSWORD`: läuft beim Start nach den Migrationen.
 * Legt nur an, wenn beide gesetzt sind und noch kein Admin existiert. Das Passwort prüft
 * `createUser` mit derselben 12-Zeichen-Regel wie `user:create`.
 */
export async function bootstrapAdmin(
  db: Db,
  admin: { email?: string; password?: string },
  log: (message: string) => void = console.log,
): Promise<BootstrapResult> {
  if (!admin.email || !admin.password) return "nicht-gesetzt";

  if (await adminExists(db)) {
    log(
      "ADMIN_EMAIL/ADMIN_PASSWORD sind gesetzt, es gibt aber schon einen Admin: nichts angelegt. " +
        "Die beiden Variablen bitte aus der Umgebung entfernen.",
    );
    return "admin-existiert";
  }

  await createUser(db, {
    email: admin.email,
    name: BOOTSTRAP_ADMIN_NAME,
    password: admin.password,
    role: "admin",
  });
  log(
    `Erster Admin ${admin.email} aus ADMIN_EMAIL/ADMIN_PASSWORD angelegt. ` +
      "ADMIN_PASSWORD und ADMIN_EMAIL jetzt aus der Umgebung entfernen.",
  );
  return "angelegt";
}
