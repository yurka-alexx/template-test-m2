import { z } from "zod";
import { emailSchema, PASSWORD_MAX_LENGTH } from "./user.ts";

/**
 * Anmeldung. Die 12-Zeichen-Regel gilt beim Anlegen (`userCreateSchema`), nicht hier:
 * Ein zu kurzes Passwort ist beim Login einfach falsch und bekommt dieselbe 401 wie jedes andere.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "fehlt" }).max(PASSWORD_MAX_LENGTH),
});
export type Login = z.infer<typeof loginSchema>;
