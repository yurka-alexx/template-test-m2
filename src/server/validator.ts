import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import { ValidationError } from "./errors.ts";

/**
 * `zValidator` mit gemeinsamem Hook: Bei ungültiger Eingabe antwortet die API immer
 * mit 400 und `{error, fields}`. In Routen statt `zValidator` direkt verwenden.
 */
export const validator = <Target extends keyof ValidationTargets, T extends z.ZodType>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) throw ValidationError.fromZod(result.error);
  });
