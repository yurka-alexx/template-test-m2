import { z } from "zod";

export const taskStatuses = ["offen", "in_arbeit", "erledigt"] as const;
export const taskStatusSchema = z.enum(taskStatuses, {
  error: `muss einer der Werte ${taskStatuses.join(", ")} sein`,
});
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskPriorities = ["niedrig", "mittel", "hoch"] as const;
export const taskPrioritySchema = z.enum(taskPriorities, {
  error: `muss einer der Werte ${taskPriorities.join(", ")} sein`,
});
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const TASK_TITLE_MAX_LENGTH = 200;
export const TASK_DESCRIPTION_MAX_LENGTH = 5000;

const title = z
  .string({ error: (issue) => (issue.input === undefined ? "fehlt" : "muss Text sein") })
  .trim()
  .min(1, { error: "fehlt" })
  .max(TASK_TITLE_MAX_LENGTH, {
    error: `darf höchstens ${TASK_TITLE_MAX_LENGTH} Zeichen lang sein`,
  });

// Leerer Text und null bedeuten „keine Beschreibung“, gespeichert wird dann null.
const description = z
  .string()
  .trim()
  .max(TASK_DESCRIPTION_MAX_LENGTH, {
    error: `darf höchstens ${TASK_DESCRIPTION_MAX_LENGTH} Zeichen lang sein`,
  })
  .nullable();

/** Fälligkeit als Kalendertag `JJJJ-MM-TT` ohne Uhrzeit, null für „keine“. */
const dueDate = z.iso.date({ error: "muss ein Datum im Format JJJJ-MM-TT sein" }).nullable();

const taskFields = {
  title,
  description,
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueDate,
};

/** Neue Aufgabe (POST /api/tasks, Formular „Anlegen“). */
export const taskCreateSchema = z.object({
  title: taskFields.title,
  description: taskFields.description.optional(),
  status: taskFields.status.default("offen"),
  priority: taskFields.priority.default("mittel"),
  dueDate: taskFields.dueDate.optional(),
});
export type TaskCreate = z.infer<typeof taskCreateSchema>;

/** Änderung (PATCH /api/tasks/:id): nur die gesendeten Felder, mindestens eines. */
export const taskUpdateSchema = z
  .object(taskFields)
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    error: "keine Felder zum Ändern",
  });
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

/** Sortierung: Feldname aufsteigend, mit `-` davor absteigend (z. B. `-dueDate`). */
export const taskSorts = [
  "dueDate",
  "-dueDate",
  "title",
  "-title",
  "priority",
  "-priority",
  "status",
  "-status",
  "createdAt",
  "-createdAt",
] as const;
export const taskSortSchema = z.enum(taskSorts, {
  error: `muss einer der Werte ${taskSorts.join(", ")} sein`,
});
export type TaskSort = z.infer<typeof taskSortSchema>;

export const TASK_PAGE_SIZE_DEFAULT = 10;
export const TASK_PAGE_SIZE_MAX = 100;

// Query-Parameter kommen einzeln als Text, mehrfach (`?status=a&status=b`) als Liste.
const oneOrMany = <T extends z.ZodType>(schema: T) =>
  z.union([schema, z.array(schema)]).transform((v) => (Array.isArray(v) ? v : [v]));

/** Listenabfrage (GET /api/tasks) aus den Query-Parametern. */
export const taskListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(TASK_PAGE_SIZE_MAX).default(TASK_PAGE_SIZE_DEFAULT),
  sort: taskSortSchema.default("-createdAt"),
  status: oneOrMany(taskStatusSchema).optional(),
  priority: oneOrMany(taskPrioritySchema).optional(),
  // Suchtext in Titel und Beschreibung, ohne Groß- und Kleinschreibung. Leer heißt „kein Filter“.
  q: z
    .string()
    .trim()
    .max(TASK_TITLE_MAX_LENGTH)
    .transform((v) => v || undefined)
    .optional(),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

/** Aufgabe, wie die API sie ausgibt. Zeitpunkte als ISO-Text. */
export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskList = { items: Task[]; total: number; page: number; pageSize: number };
