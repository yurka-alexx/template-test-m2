import { z } from "zod";

export const roles = ["admin", "benutzer"] as const;
export const roleSchema = z.enum(roles);
export type Role = z.infer<typeof roleSchema>;

export const PASSWORD_MIN_LENGTH = 12;
// Obergrenze schützt argon2 vor sehr langen Eingaben.
export const PASSWORD_MAX_LENGTH = 256;

/** E-Mail wird getrimmt und klein geschrieben, so steht sie auch in der Datenbank. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "muss eine gültige E-Mail-Adresse sein" }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein` })
  .max(PASSWORD_MAX_LENGTH, { error: `darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein` });

/** Neuer Benutzer (user:create, erster Admin aus der Umgebung). */
export const userCreateSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, { error: "fehlt" }).max(100),
  password: passwordSchema,
  role: roleSchema,
});
export type UserCreate = z.infer<typeof userCreateSchema>;

/** Benutzer, wie die API ihn ausgibt (ohne Passwort-Hash). */
export type PublicUser = { id: string; email: string; name: string; role: Role };
