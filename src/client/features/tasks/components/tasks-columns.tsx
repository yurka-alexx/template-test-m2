import { createColumnHelper } from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import type { DataTableFeatures } from "@/components/data-table/features";
import { Button } from "@/components/ui/button";
import type { Task } from "../../../../shared/schemas/task.ts";
import { formatDueDate, taskPriorityLabels, taskStatusLabels } from "../labels.ts";

const column = createColumnHelper<DataTableFeatures, Task>();

/**
 * Spalten der Aufgaben-Liste. Spaltenkennung = Feldname der API (Sortierung, Filter).
 * Ohne `canDelete` fehlt der Löschen-Knopf, die API prüft das Recht trotzdem selbst.
 */
export function taskColumns({
  canDelete,
  onEdit,
  onDelete,
}: {
  canDelete: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}) {
  return column.columns([
    column.accessor("title", {
      header: ({ column }) => <DataTableColumnHeader column={column} title="Titel" />,
      cell: ({ row }) => (
        <span className="block max-w-96 truncate font-medium">{row.original.title}</span>
      ),
    }),
    column.accessor("status", {
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => taskStatusLabels[row.original.status],
    }),
    column.accessor("priority", {
      header: ({ column }) => <DataTableColumnHeader column={column} title="Priorität" />,
      cell: ({ row }) => taskPriorityLabels[row.original.priority],
    }),
    column.accessor("dueDate", {
      header: ({ column }) => <DataTableColumnHeader column={column} title="Fällig" />,
      cell: ({ row }) => formatDueDate(row.original.dueDate),
    }),
    column.display({
      id: "actions",
      header: () => <span className="sr-only">Aktionen</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Bearbeiten: ${row.original.title}`}
            onClick={() => onEdit(row.original)}
          >
            <Pencil aria-hidden="true" />
            Bearbeiten
          </Button>
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              aria-label={`Löschen: ${row.original.title}`}
              onClick={() => onDelete(row.original)}
            >
              <Trash2 aria-hidden="true" />
              Löschen
            </Button>
          )}
        </div>
      ),
    }),
  ]);
}
