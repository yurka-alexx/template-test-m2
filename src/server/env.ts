import { z } from "zod";
import { emailSchema, passwordSchema } from "../shared/schemas/user.ts";

// Leere Werte (z. B. `ADMIN_EMAIL=` aus .env.example) gelten als nicht gesetzt.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

export const envSchema = z
  .object({
    DATABASE_URL: z.url({
      protocol: /^postgres(ql)?$/,
      error: "muss eine Postgres-URL sein (postgres://benutzer:passwort@host:5432/datenbank)",
    }),
    APP_URL: z.url({ error: "muss eine URL sein (z. B. http://localhost:3000)" }),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(0).max(65535).default(3000),
    // Erster Admin beim Start, nur wenn noch keiner existiert. Danach aus der Umgebung entfernen.
    ADMIN_EMAIL: optional(emailSchema),
    ADMIN_PASSWORD: optional(passwordSchema),
    // Staging-Schutz per Basic Auth (src/server/auth/basic-auth.ts). Staging setzt beide, lokal leer.
    BASIC_AUTH_USER: optional(
      z.string().refine((value) => !value.includes(":"), "darf keinen Doppelpunkt enthalten"),
    ),
    BASIC_AUTH_PASSWORD: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    for (const [a, b] of [
      ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
      ["BASIC_AUTH_USER", "BASIC_AUTH_PASSWORD"],
    ] as const) {
      if ((env[a] === undefined) !== (env[b] === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: [env[a] === undefined ? a : b],
          message: `${a} und ${b} nur gemeinsam setzen`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvError extends Error {
  override name = "EnvError";
}

/** Prüft die Umgebung und wirft einen EnvError, der jede fehlerhafte Variable einzeln nennt. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const key = issue.path.join(".");
    const missing = source[key] === undefined || source[key] === "";
    const reason = missing && issue.code !== "custom" ? "fehlt" : issue.message;
    return `  - ${key}: ${reason}`;
  });
  throw new EnvError(
    `Ungültige Umgebungsvariablen:\n${lines.join("\n")}\nVorlage: .env.example (lokal: cp .env.example .env)`,
  );
}

/** Für Einstiegspunkte: bei ungültiger Umgebung Meldung ausgeben und mit Code 1 beenden. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  try {
    return parseEnv(source);
  } catch (error) {
    if (error instanceof EnvError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}
