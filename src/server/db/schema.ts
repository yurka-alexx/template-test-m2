// Drizzle-Schema. Nach jeder Änderung: bun run db:generate
import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { TASK_TITLE_MAX_LENGTH, taskPriorities, taskStatuses } from "../../shared/schemas/task.ts";
import { roles } from "../../shared/schemas/user.ts";

export const roleEnum = pgEnum("role", roles);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

/** `id` ist der SHA-256-Hash (hex) des Sitzungs-Tokens, das Token selbst steht nur im Cookie. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const taskStatusEnum = pgEnum("task_status", taskStatuses);
// Reihenfolge der Werte bestimmt die Sortierung nach Priorität (niedrig < mittel < hoch).
export const taskPriorityEnum = pgEnum("task_priority", taskPriorities);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatusEnum("status").notNull().default("offen"),
    priority: taskPriorityEnum("priority").notNull().default("mittel"),
    dueDate: date("due_date", { mode: "string" }),
    // Ohne Ersteller (Seed ohne Konten, gelöschter Benutzer) bleibt die Aufgabe erhalten.
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check(
      "tasks_title_length",
      sql`char_length(${t.title}) between 1 and ${sql.raw(String(TASK_TITLE_MAX_LENGTH))}`,
    ),
    index("tasks_due_date_idx").on(t.dueDate),
    index("tasks_created_by_idx").on(t.createdBy),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
