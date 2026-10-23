import { describe, expect, test } from "bun:test";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { Task } from "../../../../shared/schemas/task.ts";
import { TaskFormDialog } from "./task-form-dialog.tsx";

const task = (n: number): Task => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title: `Aufgabe ${n}`,
  description: null,
  status: "offen",
  priority: "mittel",
  dueDate: null,
  createdBy: null,
  createdAt: "2026-10-23T08:00:00.000Z",
  updatedAt: "2026-10-23T08:00:00.000Z",
});

/** Sucht im Elementbaum (ohne Rendern) das Formular, also das Element mit `onSaved`. */
function findForm(node: ReactNode): ReactElement | undefined {
  if (!isValidElement<{ children?: ReactNode; onSaved?: unknown }>(node)) return undefined;
  if (node.props.onSaved) return node;
  const children = node.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findForm(child);
    if (found) return found;
  }
  return undefined;
}

// TaskFormDialog selbst nutzt keine Hooks, der Aufruf als Funktion liefert den Elementbaum.
const formKey = (t?: Task) =>
  findForm(TaskFormDialog({ open: true, onOpenChange: () => {}, task: t }))?.key;

describe("TaskFormDialog", () => {
  test("Formular hat je Aufgabe und für „Neue Aufgabe“ einen eigenen key", () => {
    // Wechselt der key, baut React das Formular neu auf, auch wenn der Dialog noch eingehängt ist.
    expect(formKey(task(1))).toBe(task(1).id);
    expect(formKey(task(2))).toBe(task(2).id);
    expect(formKey()).toBe("neu");
  });
});
