import { eq } from "drizzle-orm";
import type { PublicUser, UserCreate } from "../../shared/schemas/user.ts";
import { userCreateSchema } from "../../shared/schemas/user.ts";
import type { Db } from "../db/index.ts";
import { type UserRow, users } from "../db/schema.ts";
import { ValidationError } from "../errors.ts";

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

export function toPublicUser(user: UserRow): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export class EmailTakenError extends Error {
  override name = "EmailTakenError";

  constructor(readonly email: string) {
    super(`Ein Benutzer mit der E-Mail ${email} existiert schon.`);
  }
}

/** Prüft die Eingabe mit `userCreateSchema` (Passwort ab 12 Zeichen) und legt den Benutzer an. */
export async function createUser(db: Db, input: UserCreate): Promise<PublicUser> {
  const parsed = userCreateSchema.safeParse(input);
  if (!parsed.success) throw ValidationError.fromZod(parsed.error);
  const { email, name, password, role } = parsed.data;

  const [row] = await db
    .insert(users)
    .values({ email, name, role, passwordHash: await hashPassword(password) })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!row) throw new EmailTakenError(email);
  return toPublicUser(row);
}

export async function findUserByEmail(db: Db, email: string): Promise<UserRow | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

export async function adminExists(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  return row !== undefined;
}
