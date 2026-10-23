import { and, asc, count, eq, ilike, inArray, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type {
  Task,
  TaskCreate,
  TaskList,
  TaskListQuery,
  TaskSort,
  TaskUpdate,
} from "../../shared/schemas/task.ts";
import type { Db } from "../db/index.ts";
import { type TaskRow, tasks } from "../db/schema.ts";

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const sortColumns: Record<string, AnyPgColumn> = {
  dueDate: tasks.dueDate,
  title: tasks.title,
  priority: tasks.priority,
  status: tasks.status,
  createdAt: tasks.createdAt,
};

/** Sortierung plus `id` als letzte Stufe, damit Seiten bei gleichen Werten stabil bleiben. */
function orderBy(sort: TaskSort): SQL[] {
  const descending = sort.startsWith("-");
  const column = sortColumns[descending ? sort.slice(1) : sort] ?? tasks.createdAt;
  // Aufgaben ohne Fälligkeit stehen in beiden Richtungen am Ende.
  const direction = descending ? sql`desc nulls last` : sql`asc nulls last`;
  return [sql`${column} ${direction}`, asc(tasks.id)];
}

/** `%` und `_` im Suchtext gelten wörtlich, nicht als Platzhalter. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

function filters(query: TaskListQuery): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  if (query.status) conditions.push(inArray(tasks.status, query.status));
  if (query.priority) conditions.push(inArray(tasks.priority, query.priority));
  if (query.q) {
    const pattern = `%${escapeLike(query.q)}%`;
    conditions.push(or(ilike(tasks.title, pattern), ilike(tasks.description, pattern)));
  }
  return and(...conditions);
}

/** Eine Seite der Liste, sortiert und gefiltert in der Datenbank, plus Gesamtzahl der Treffer. */
export async function listTasks(db: Db, query: TaskListQuery): Promise<TaskList> {
  const where = filters(query);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(...orderBy(query.sort))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ total: count() }).from(tasks).where(where),
  ]);
  return {
    items: rows.map(toTask),
    total: totalRow?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getTask(db: Db, id: string): Promise<Task | undefined> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  return row && toTask(row);
}

export async function createTask(db: Db, input: TaskCreate, createdBy: string): Promise<Task> {
  const [row] = await db
    .insert(tasks)
    .values({
      title: input.title,
      description: input.description || null,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      createdBy,
    })
    .returning();
  if (!row) throw new Error("Aufgabe wurde nicht angelegt");
  return toTask(row);
}

export async function updateTask(db: Db, id: string, input: TaskUpdate): Promise<Task | undefined> {
  const { description, ...rest } = input;
  const [row] = await db
    .update(tasks)
    .set({ ...rest, ...(description !== undefined && { description: description || null }) })
    .where(eq(tasks.id, id))
    .returning();
  return row && toTask(row);
}

/** true, wenn die Aufgabe existierte und gelöscht wurde. */
export async function deleteTask(db: Db, id: string): Promise<boolean> {
  const rows = await db.delete(tasks).where(eq(tasks.id, id)).returning({ id: tasks.id });
  return rows.length > 0;
}
