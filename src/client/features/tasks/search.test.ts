import { describe, expect, test } from "bun:test";
import { defaultParseSearch } from "@tanstack/react-router";
import { taskListQuerySchema } from "../../../shared/schemas/task.ts";
import {
  listQueryFromSearch,
  pageCount,
  parseTaskSearch,
  searchFromTableState,
  type TaskSearch,
  tableStateFromSearch,
  updateTaskSearch,
} from "./search.ts";

describe("parseTaskSearch", () => {
  test("übernimmt gültige Werte, Einzelwert wird Liste", () => {
    expect(
      parseTaskSearch({
        page: 2,
        pageSize: "20",
        sort: "-dueDate",
        status: "offen",
        priority: ["hoch", "niedrig"],
        q: "  Bericht ",
      }),
    ).toEqual({
      page: 2,
      pageSize: 20,
      sort: "-dueDate",
      status: ["offen"],
      priority: ["niedrig", "hoch"],
      q: "Bericht",
    });
  });

  test("ungültige Werte und Standardwerte fallen weg", () => {
    expect(
      parseTaskSearch({
        page: 0,
        pageSize: 500,
        sort: "id",
        status: ["unbekannt"],
        priority: 3,
        q: "   ",
      }),
    ).toEqual({});
    expect(parseTaskSearch({ page: 1, pageSize: 10, page2: 4 })).toEqual({});
    expect(parseTaskSearch({ page: 1.5, status: ["offen", "kaputt", "offen"] })).toEqual({
      status: ["offen"],
    });
  });

  test("von Hand getippte Zahl oder true als Suchtext bleibt erhalten", () => {
    // Der Router liest `?q=2026` mit JSON.parse als Zahl.
    expect(parseTaskSearch(defaultParseSearch("?q=2026")).q).toBe("2026");
    expect(parseTaskSearch(defaultParseSearch("?q=true")).q).toBe("true");
    expect(parseTaskSearch(defaultParseSearch("?q=%222026%22")).q).toBe("2026");
    expect(parseTaskSearch({ q: { a: 1 } }).q).toBeUndefined();
  });
});

describe("Tabellenzustand und Adresszeile", () => {
  const search: TaskSearch = {
    page: 3,
    pageSize: 20,
    sort: "-dueDate",
    status: ["offen", "in_arbeit"],
    priority: ["hoch"],
    q: "Bericht",
  };

  test("Suchparameter werden Tabellenzustand", () => {
    expect(tableStateFromSearch(search)).toEqual({
      sorting: [{ id: "dueDate", desc: true }],
      columnFilters: [
        { id: "status", value: ["offen", "in_arbeit"] },
        { id: "priority", value: ["hoch"] },
      ],
      globalFilter: "Bericht",
      pagination: { pageIndex: 2, pageSize: 20 },
    });
  });

  test("ohne Parameter: erste Seite, 10 je Seite, ohne Sortierung und Filter", () => {
    expect(tableStateFromSearch({})).toEqual({
      sorting: [],
      columnFilters: [],
      globalFilter: "",
      pagination: { pageIndex: 0, pageSize: 10 },
    });
  });

  test("Hin und zurück ergibt dieselben Suchparameter", () => {
    expect(searchFromTableState(tableStateFromSearch(search))).toEqual(search);
    expect(searchFromTableState(tableStateFromSearch({}))).toEqual({});
  });

  test("aufsteigende Sortierung ohne Minus, unbekannte Spalte ohne Sortierung", () => {
    const state = tableStateFromSearch({});
    expect(searchFromTableState({ ...state, sorting: [{ id: "title", desc: false }] })).toEqual({
      sort: "title",
    });
    expect(searchFromTableState({ ...state, sorting: [{ id: "actions", desc: true }] })).toEqual(
      {},
    );
  });

  test("leerer Filter fällt weg", () => {
    const state = tableStateFromSearch({});
    expect(
      searchFromTableState({ ...state, columnFilters: [{ id: "status", value: [] }] }),
    ).toEqual({});
  });
});

describe("updateTaskSearch", () => {
  test("Sortierung per Spaltenkopf geht zurück auf Seite 1", () => {
    expect(
      updateTaskSearch({ page: 3, status: ["offen"] }, "sorting", [{ id: "dueDate", desc: false }]),
    ).toEqual({ sort: "dueDate", status: ["offen"] });
  });

  test("Filter und Suche gehen zurück auf Seite 1", () => {
    expect(
      updateTaskSearch({ page: 2 }, "columnFilters", (old) => [
        ...old,
        { id: "status", value: ["erledigt"] },
      ]),
    ).toEqual({ status: ["erledigt"] });
    expect(updateTaskSearch({ page: 2, sort: "title" }, "globalFilter", "Rechnung")).toEqual({
      sort: "title",
      q: "Rechnung",
    });
  });

  test("Blättern ändert nur die Seite", () => {
    expect(
      updateTaskSearch({ sort: "-dueDate" }, "pagination", (old) => ({
        ...old,
        pageIndex: old.pageIndex + 1,
      })),
    ).toEqual({ sort: "-dueDate", page: 2 });
  });

  test("neue Seitengröße geht zurück auf Seite 1", () => {
    expect(
      updateTaskSearch({ page: 3 }, "pagination", (old) => ({ ...old, pageSize: 20 })),
    ).toEqual({ pageSize: 20 });
  });
});

describe("listQueryFromSearch", () => {
  test("die API versteht die Abfrage und liest dieselben Werte", () => {
    const search: TaskSearch = {
      page: 2,
      sort: "dueDate",
      status: ["offen", "erledigt"],
      priority: ["hoch"],
      q: "Bericht",
    };
    const query = listQueryFromSearch(search);
    expect(query).toEqual({
      page: "2",
      pageSize: "10",
      sort: "dueDate",
      status: ["offen", "erledigt"],
      priority: ["hoch"],
      q: "Bericht",
    });
    // So liest der Server die Query-Parameter (GET /api/tasks).
    expect(taskListQuerySchema.parse(query)).toEqual({
      page: 2,
      pageSize: 10,
      sort: "dueDate",
      status: ["offen", "erledigt"],
      priority: ["hoch"],
      q: "Bericht",
    });
  });

  test("ohne Parameter fragt die erste Seite mit Standardsortierung ab", () => {
    expect(taskListQuerySchema.parse(listQueryFromSearch({}))).toEqual({
      page: 1,
      pageSize: 10,
      sort: "-createdAt",
    });
  });
});

test("pageCount: 30 Aufgaben ergeben 3 Seiten zu 10, leere Liste eine Seite", () => {
  expect(pageCount(30, 10)).toBe(3);
  expect(pageCount(31, 10)).toBe(4);
  expect(pageCount(0, 10)).toBe(1);
});
