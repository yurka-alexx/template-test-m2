import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import type { Task, TaskCreate, TaskUpdate } from "../../../shared/schemas/task.ts";
import { listQueryFromSearch, type TaskSearch } from "./search.ts";

/** Schlüssel aller Aufgaben-Abfragen, nach Änderungen als Ganzes neu laden. */
export const tasksQueryKey = ["tasks"] as const;

/** Eine Seite der Liste. Beim Blättern bleibt die alte Seite stehen, bis die neue da ist. */
export const taskListQueryOptions = (search: TaskSearch) => {
  const query = listQueryFromSearch(search);
  return queryOptions({
    queryKey: [...tasksQueryKey, "list", query],
    queryFn: () => unwrap(api.api.tasks.$get({ query })),
    placeholderData: keepPreviousData,
  });
};

export async function createTask(input: TaskCreate): Promise<Task> {
  const { task } = await unwrap(api.api.tasks.$post({ json: input }));
  return task;
}

export async function updateTask(id: string, input: TaskUpdate): Promise<Task> {
  const { task } = await unwrap(api.api.tasks[":id"].$patch({ param: { id }, json: input }));
  return task;
}

export async function deleteTask(id: string): Promise<void> {
  await unwrap(api.api.tasks[":id"].$delete({ param: { id } }));
}
