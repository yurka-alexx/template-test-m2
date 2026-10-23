import { ApiError } from "@/lib/api";
import type { TaskPriority, TaskStatus } from "../../../shared/schemas/task.ts";
import type { PublicUser } from "../../../shared/schemas/user.ts";

export const taskStatusLabels: Record<TaskStatus, string> = {
  offen: "Offen",
  in_arbeit: "In Arbeit",
  erledigt: "Erledigt",
};

export const taskPriorityLabels: Record<TaskPriority, string> = {
  niedrig: "Niedrig",
  mittel: "Mittel",
  hoch: "Hoch",
};

/** Fälligkeit `JJJJ-MM-TT` als `TT.MM.JJJJ`, ohne Umweg über Date (keine Zeitzonen-Verschiebung). */
export function formatDueDate(dueDate: string | null): string {
  if (!dueDate) return "–";
  const [year, month, day] = dueDate.split("-");
  return `${day}.${month}.${year}`;
}

/** Meldung im Löschdialog, wenn die API das Löschen ablehnt. */
export function deleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Keine Berechtigung: Nur Admins dürfen Aufgaben löschen.";
    if (error.status === 404) return "Die Aufgabe gibt es nicht mehr. Die Liste wird neu geladen.";
    return `Löschen fehlgeschlagen: ${error.message}`;
  }
  return "Löschen fehlgeschlagen: Unerwarteter Fehler";
}

/**
 * Löschen-Knopf nur für Admins. Reiner Bedienkomfort: Die API lehnt das Löschen
 * für andere Rollen selbst mit 403 ab.
 */
export const canDeleteTasks = (user: Pick<PublicUser, "role">) => user.role === "admin";
