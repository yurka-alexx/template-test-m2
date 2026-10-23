import { z } from "zod";
import {
  type Task,
  taskCreateSchema,
  taskPrioritySchema,
  taskStatusSchema,
  taskUpdateSchema,
} from "../../../shared/schemas/task.ts";

/** Felder des Formulars, zugleich die Schlüssel von `fields` in Fehlerantworten der API. */
export const taskFormFields = ["title", "description", "status", "priority", "dueDate"] as const;
export type TaskFormField = (typeof taskFormFields)[number];

/** Werte, wie sie in den Eingabefeldern stehen: alles Text, leeres Datum ist "". */
export type TaskFormValues = {
  title: string;
  description: string;
  status: Task["status"];
  priority: Task["priority"];
  dueDate: string;
};

export function taskFormDefaults(task?: Task): TaskFormValues {
  return {
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "offen",
    priority: task?.priority ?? "mittel",
    dueDate: task?.dueDate ?? "",
  };
}

// Leeres Datumsfeld heißt „keine Fälligkeit“ (null). Danach prüft das gemeinsame Schema der API,
// also mit denselben Meldungen, die auch die API in `fields` zurückgibt.
const formValues = z.object({
  title: z.string(),
  description: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueDate: z.string(),
});
const toInput = (values: TaskFormValues) => ({ ...values, dueDate: values.dueDate || null });

/** Formular „Neue Aufgabe“: Eingabe wie `POST /api/tasks`. */
export const taskCreateFormSchema = formValues
  .transform((values): z.input<typeof taskCreateSchema> => toInput(values))
  .pipe(taskCreateSchema);

/** Formular „Aufgabe bearbeiten“: Eingabe wie `PATCH /api/tasks/:id`, mit allen Feldern. */
export const taskUpdateFormSchema = formValues
  .transform((values): z.input<typeof taskUpdateSchema> => toInput(values))
  .pipe(taskUpdateSchema);
