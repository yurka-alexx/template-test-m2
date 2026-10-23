import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export function createDb(url: string) {
  const client = postgres(url, { connect_timeout: 5, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Db = ReturnType<typeof createDb>["db"];

/** Wirft, wenn Postgres nicht auf `select 1` antwortet. */
export async function pingDb(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
