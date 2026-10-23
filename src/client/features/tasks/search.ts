import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
  Updater,
} from "@tanstack/react-table";
import {
  TASK_PAGE_SIZE_DEFAULT,
  TASK_PAGE_SIZE_MAX,
  TASK_TITLE_MAX_LENGTH,
  type TaskPriority,
  type TaskSort,
  type TaskStatus,
  taskPriorities,
  taskSorts,
  taskStatuses,
} from "../../../shared/schemas/task.ts";

/**
 * Suchparameter der Seite `/aufgaben`, also der Tabellenzustand in der Adresszeile.
 * Standardwerte fehlen, damit die Adresse kurz bleibt (Seite 1, 10 je Seite, neueste zuerst).
 */
export type TaskSearch = {
  page?: number;
  pageSize?: number;
  sort?: TaskSort;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  q?: string;
};

/** Zustand der Tabelle (TanStack Table), alles serverseitig: Sortierung, Filter, Suche, Seite. */
export type TaskTableState = {
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  pagination: PaginationState;
};

// Spaltenkennungen sind die Feldnamen der API: Sortierung `id` bzw. `-id`, Filter `?id=…`.

export const pageSizeOptions = [10, 20, 50] as const;

const includes = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === "string" && (list as readonly string[]).includes(value);

function positiveInt(value: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) return undefined;
  return number >= 1 && number <= max ? number : undefined;
}

/**
 * Suchtext aus der Adresse. Der Router liest Parameter mit `JSON.parse`, ein von Hand getipptes
 * `?q=2026` oder `?q=true` kommt als Zahl bzw. Boolean an und zählt als Text.
 */
function searchText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

/** Einzelwert oder Liste, nur bekannte Werte, ohne Doppelte, in der Reihenfolge von `allowed`. */
function oneOrMany<T extends string>(allowed: readonly T[], value: unknown): T[] | undefined {
  const values = Array.isArray(value) ? value : [value];
  const valid = allowed.filter((option) => values.includes(option));
  return valid.length > 0 ? valid : undefined;
}

/** Entfernt Standardwerte und leere Angaben. */
function compact(search: TaskSearch): TaskSearch {
  const result: TaskSearch = {};
  if (search.page && search.page > 1) result.page = search.page;
  if (search.pageSize && search.pageSize !== TASK_PAGE_SIZE_DEFAULT) {
    result.pageSize = search.pageSize;
  }
  if (search.sort) result.sort = search.sort;
  if (search.status?.length) result.status = search.status;
  if (search.priority?.length) result.priority = search.priority;
  const q = search.q?.trim().slice(0, TASK_TITLE_MAX_LENGTH);
  if (q) result.q = q;
  return result;
}

/**
 * Liest die Suchparameter (`validateSearch` der Route). Ungültige Werte, etwa aus einer
 * von Hand geänderten Adresse, fallen still auf den Standard zurück, statt die Seite abzubrechen.
 */
export function parseTaskSearch(raw: Record<string, unknown>): TaskSearch {
  const search = compact({
    page: positiveInt(raw.page),
    pageSize: positiveInt(raw.pageSize, TASK_PAGE_SIZE_MAX),
    sort: includes(taskSorts, raw.sort) ? raw.sort : undefined,
    status: oneOrMany(taskStatuses, raw.status),
    priority: oneOrMany(taskPriorities, raw.priority),
    q: searchText(raw.q),
  });
  // Alle Schlüssel ausdrücklich, auch leer: Der Router legt das Ergebnis über die rohen
  // Parameter, ein fehlender Schlüssel ließe den ungültigen Rohwert stehen.
  return {
    page: search.page,
    pageSize: search.pageSize,
    sort: search.sort,
    status: search.status,
    priority: search.priority,
    q: search.q,
  };
}

/** Query für `GET /api/tasks`. Fehlende Werte setzt die API auf ihren Standard. */
export function listQueryFromSearch(search: TaskSearch) {
  return {
    page: String(search.page ?? 1),
    pageSize: String(search.pageSize ?? TASK_PAGE_SIZE_DEFAULT),
    ...(search.sort && { sort: search.sort }),
    ...(search.status && { status: search.status }),
    ...(search.priority && { priority: search.priority }),
    ...(search.q && { q: search.q }),
  };
}

export function tableStateFromSearch(search: TaskSearch): TaskTableState {
  const sorting: SortingState = [];
  if (search.sort) {
    const desc = search.sort.startsWith("-");
    sorting.push({ id: desc ? search.sort.slice(1) : search.sort, desc });
  }
  const columnFilters: ColumnFiltersState = [];
  if (search.status) columnFilters.push({ id: "status", value: search.status });
  if (search.priority) columnFilters.push({ id: "priority", value: search.priority });
  return {
    sorting,
    columnFilters,
    globalFilter: search.q ?? "",
    pagination: {
      pageIndex: (search.page ?? 1) - 1,
      pageSize: search.pageSize ?? TASK_PAGE_SIZE_DEFAULT,
    },
  };
}

function sortFromSorting(sorting: SortingState): TaskSort | undefined {
  const [first] = sorting;
  if (!first) return undefined;
  const sort = `${first.desc ? "-" : ""}${first.id}`;
  return includes(taskSorts, sort) ? sort : undefined;
}

export function searchFromTableState(state: TaskTableState): TaskSearch {
  const filter = (id: string) => state.columnFilters.find((f) => f.id === id)?.value;
  return compact({
    page: state.pagination.pageIndex + 1,
    pageSize: positiveInt(state.pagination.pageSize, TASK_PAGE_SIZE_MAX),
    sort: sortFromSorting(state.sorting),
    status: oneOrMany(taskStatuses, filter("status")),
    priority: oneOrMany(taskPriorities, filter("priority")),
    q: state.globalFilter,
  });
}

const resolve = <T>(updater: Updater<T>, old: T): T =>
  typeof updater === "function" ? (updater as (old: T) => T)(old) : updater;

/**
 * Neue Suchparameter nach einer Änderung an der Tabelle (`onSortingChange` usw.).
 * Ändern sich Sortierung, Filter, Suche oder Seitengröße, geht es zurück auf Seite 1.
 */
export function updateTaskSearch<K extends keyof TaskTableState>(
  search: TaskSearch,
  key: K,
  updater: Updater<TaskTableState[K]>,
): TaskSearch {
  const state = tableStateFromSearch(search);
  const next = { ...state, [key]: resolve(updater, state[key]) };
  const samePageSize = next.pagination.pageSize === state.pagination.pageSize;
  if (key !== "pagination" || !samePageSize) {
    next.pagination = { ...next.pagination, pageIndex: 0 };
  }
  return searchFromTableState(next);
}

/** Zahl der Seiten, mindestens 1 (auch bei leerer Liste). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
