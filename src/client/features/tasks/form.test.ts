import { describe, expect, test } from "bun:test";
import { zodResolver } from "@hookform/resolvers/zod";
import { Hono } from "hono";
import type { FieldValues, Resolver } from "react-hook-form";
import { ApiError, createApi, unwrap } from "@/lib/api";
import { formErrorsFrom } from "@/lib/form-errors";
import { onError } from "../../../server/errors.ts";
import { validator } from "../../../server/validator.ts";
import { type Task, taskCreateSchema } from "../../../shared/schemas/task.ts";
import {
  type TaskFormValues,
  taskCreateFormSchema,
  taskFormDefaults,
  taskFormFields,
  taskUpdateFormSchema,
} from "./form.ts";
import { canDeleteTasks, formatDueDate } from "./labels.ts";

const task: Task = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Bericht schreiben",
  description: null,
  status: "in_arbeit",
  priority: "hoch",
  dueDate: "2026-11-02",
  createdBy: null,
  createdAt: "2026-10-23T08:00:00.000Z",
  updatedAt: "2026-10-23T08:00:00.000Z",
};

/** Ruft den Resolver so auf, wie react-hook-form es beim Absenden tut. */
async function resolve<T extends FieldValues, O>(
  resolver: Resolver<T, unknown, O>,
  values: T,
): Promise<{ values: O | Record<string, never>; errors: Record<string, { message?: string }> }> {
  const result = await resolver(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });
  return result as never;
}

/** Abgespeckte Aufgaben-Route mit demselben Validator und Fehlerformat wie `POST /api/tasks`. */
function apiWithTaskValidation() {
  const app = new Hono()
    .post("/api/tasks", validator("json", taskCreateSchema), (c) => c.json({ ok: true }, 201))
    .onError(onError);
  return createApi("http://localhost", ((input: RequestInfo | URL, init?: RequestInit) =>
    app.fetch(new Request(input, init))) as typeof fetch);
}

describe("Formularwerte", () => {
  test("Vorgaben: leeres Formular bzw. Werte der Aufgabe", () => {
    expect(taskFormDefaults()).toEqual({
      title: "",
      description: "",
      status: "offen",
      priority: "mittel",
      dueDate: "",
    });
    expect(taskFormDefaults(task)).toEqual({
      title: "Bericht schreiben",
      description: "",
      status: "in_arbeit",
      priority: "hoch",
      dueDate: "2026-11-02",
    });
  });

  test("leeres Datum wird null, Titel getrimmt (gemeinsames Schema)", async () => {
    const values: TaskFormValues = { ...taskFormDefaults(task), title: "  Neu  ", dueDate: "" };
    expect((await resolve(zodResolver(taskCreateFormSchema), values)).values).toEqual({
      title: "Neu",
      description: "",
      status: "in_arbeit",
      priority: "hoch",
      dueDate: null,
    });
    expect((await resolve(zodResolver(taskUpdateFormSchema), values)).values).toMatchObject({
      title: "Neu",
      dueDate: null,
    });
  });
});

describe("Aufgabe ohne Titel (AE3)", () => {
  const withoutTitle: TaskFormValues = { ...taskFormDefaults(), title: "   " };

  test("clientseitige Prüfung und API liefern am Feld „Titel“ denselben Text", async () => {
    // Formular: zodResolver mit dem gemeinsamen Schema, wie beim Absenden.
    const client = await resolve(zodResolver(taskCreateFormSchema), withoutTitle);
    const clientMessage = client.errors.title?.message;

    // API: 400 mit fields.title, über den RPC-Client und formErrorsFrom aufs Formular verteilt.
    const api = apiWithTaskValidation();
    const error = await unwrap(api.api.tasks.$post({ json: { title: "" } })).catch((e) => e);
    expect(error.status).toBe(400);
    const { fields, root } = formErrorsFrom(error, taskFormFields);

    expect(clientMessage).toBe("fehlt");
    expect(fields).toEqual({ title: clientMessage });
    expect(root).toBeUndefined();
  });

  test("auch beim Bearbeiten", async () => {
    const result = await resolve(zodResolver(taskUpdateFormSchema), withoutTitle);
    expect(result.errors.title?.message).toBe("fehlt");
  });

  test("zu langer Titel: dieselbe Meldung im Formular und in der API", async () => {
    const tooLong = "x".repeat(201);
    const client = await resolve(zodResolver(taskCreateFormSchema), {
      ...withoutTitle,
      title: tooLong,
    });
    const error = await unwrap(
      apiWithTaskValidation().api.tasks.$post({ json: { title: tooLong } }),
    )
      .then(() => undefined)
      .catch((e) => e);
    expect(formErrorsFrom(error, taskFormFields).fields.title).toBe(
      client.errors.title?.message as string,
    );
  });
});

describe("Abbildung der API-Feldfehler auf die Formularfelder", () => {
  test("jedes Feld der Aufgabe landet am gleichnamigen Formularfeld", async () => {
    const api = apiWithTaskValidation();
    const error = await unwrap(
      api.api.tasks.$post({
        json: { title: "ok", status: "kaputt", priority: "x", dueDate: "morgen" } as never,
      }),
    ).catch((e) => e);
    const { fields, root } = formErrorsFrom(error, taskFormFields);
    expect(Object.keys(fields).sort()).toEqual(["dueDate", "priority", "status"]);
    expect(fields.dueDate).toBe("muss ein Datum im Format JJJJ-MM-TT sein");
    expect(root).toBeUndefined();
  });

  test("403 beim Speichern wird allgemeine Meldung über dem Formular", () => {
    expect(formErrorsFrom(new ApiError(403, "Keine Berechtigung"), taskFormFields)).toEqual({
      fields: {},
      root: "Keine Berechtigung",
    });
  });
});

describe("Anzeige", () => {
  test("Fälligkeit als TT.MM.JJJJ, ohne Fälligkeit ein Strich", () => {
    expect(formatDueDate("2026-11-02")).toBe("02.11.2026");
    expect(formatDueDate(null)).toBe("–");
  });

  test("Löschen-Knopf nur für Admins (AK5)", () => {
    expect(canDeleteTasks({ role: "admin" })).toBe(true);
    expect(canDeleteTasks({ role: "benutzer" })).toBe(false);
  });
});
