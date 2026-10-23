import { describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError } from "@/lib/api";
import { createQueryClient } from "@/lib/query-client";
import type { Task, TaskList } from "../../../../shared/schemas/task.ts";
import type { PublicUser } from "../../../../shared/schemas/user.ts";
import { taskListQueryOptions } from "../api.ts";
import type { TaskSearch } from "../search.ts";
import { TasksTable } from "./tasks-table.tsx";

const admin: PublicUser = { id: "u1", email: "a@example.test", name: "Ada", role: "admin" };
const benutzer: PublicUser = { ...admin, id: "u2", role: "benutzer" };

const task = (n: number, overrides: Partial<Task> = {}): Task => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title: `Aufgabe ${n}`,
  description: null,
  status: "offen",
  priority: "mittel",
  dueDate: null,
  createdBy: null,
  createdAt: "2026-10-23T08:00:00.000Z",
  updatedAt: "2026-10-23T08:00:00.000Z",
  ...overrides,
});

type Cache = { data: TaskList } | { error: ApiError } | undefined;

/**
 * Rendert die Tabelle einmal als HTML (ohne Browser). Die Antwort der API liegt schon im
 * Query-Cache, so wie nach dem Laden. Ohne `cache` ist die Abfrage noch unterwegs.
 */
function render(search: TaskSearch, user: PublicUser, cache: Cache) {
  const queryClient = createQueryClient({ onUnauthorized: () => {} });
  const { queryKey } = taskListQueryOptions(search);
  if (cache && "data" in cache) queryClient.setQueryData(queryKey, cache.data);
  if (cache && "error" in cache) {
    // Der Fehler kam, während die Tabelle schon zu sehen war: kein neuer Versuch beim Rendern.
    queryClient.setQueryDefaults(queryKey, { retryOnMount: false });
    queryClient
      .getQueryCache()
      .build(queryClient, { queryKey })
      .setState({ status: "error", error: cache.error, fetchStatus: "idle" });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <TasksTable search={search} onSearchChange={() => {}} user={user} />
    </QueryClientProvider>,
  );
}

const page2: TaskList = {
  items: [
    task(11, { title: "Bericht schreiben", status: "in_arbeit", dueDate: "2026-11-02" }),
    task(12, { title: "Rechnung prüfen", priority: "hoch" }),
  ],
  total: 30,
  page: 2,
  pageSize: 10,
};

describe("TasksTable", () => {
  test("zeigt die Einträge der API mit Seite, Sortierung und Filter aus der Adresszeile", () => {
    const html = render({ page: 2, sort: "dueDate", status: ["in_arbeit"] }, admin, {
      data: page2,
    });
    expect(html).toContain('aria-label="Aufgaben"');
    expect(html).toContain("Bericht schreiben");
    expect(html).toContain("In Arbeit");
    expect(html).toContain("02.11.2026");
    expect(html).toContain("Rechnung prüfen");
    expect(html).toContain("Hoch");
    expect(html).toContain("Seite 2 von 3");
    expect(html).toContain("30 Einträge");
    // Sortierung nach Fälligkeit steht am Spaltenkopf, die anderen sortierbaren Spalten sind frei.
    expect(html).toMatch(/<th[^>]*aria-sort="ascending"[^>]*><button[^>]*>Fällig/);
    expect(html).toMatch(/<th[^>]*aria-sort="none"[^>]*><button[^>]*>Titel/);
    // Statusfilter aktiv: Zähler am Knopf und Knopf zum Zurücksetzen.
    expect(html).toContain(", ausgewählt: </span>1");
    expect(html).toContain("Filter zurücksetzen");
  });

  test("Admin sieht je Zeile Bearbeiten und Löschen", () => {
    const html = render({ page: 2 }, admin, { data: page2 });
    expect(html).toContain('aria-label="Bearbeiten: Bericht schreiben"');
    expect(html).toContain('aria-label="Löschen: Bericht schreiben"');
    expect(html).toContain('aria-label="Löschen: Rechnung prüfen"');
  });

  test("Rolle benutzer: kein Löschen-Knopf, Bearbeiten bleibt (AK5)", () => {
    const html = render({ page: 2 }, benutzer, { data: page2 });
    expect(html).toContain('aria-label="Bearbeiten: Bericht schreiben"');
    expect(html).not.toContain("Löschen");
  });

  test("Ladezustand, solange die API noch nicht geantwortet hat", () => {
    const html = render({}, admin, undefined);
    expect(html).toContain('role="status"');
    expect(html).toContain("Aufgaben werden geladen");
  });

  test("leere Liste, mit und ohne Filter", () => {
    const empty: TaskList = { items: [], total: 0, page: 1, pageSize: 10 };
    expect(render({}, admin, { data: empty })).toContain("Noch keine Aufgaben.");
    expect(render({ q: "xyz" }, admin, { data: empty })).toContain(
      "Keine Aufgaben zu diesen Filtern.",
    );
    expect(render({}, admin, { data: empty })).toContain("Seite 1 von 1");
  });

  test("Fehler der API als Meldung mit Knopf „Erneut versuchen“", () => {
    const html = render({}, admin, { error: new ApiError(500, "Interner Fehler") });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Aufgaben konnten nicht geladen werden: Interner Fehler");
    expect(html).toContain("Erneut versuchen");
  });
});
