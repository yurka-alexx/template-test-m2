import { useQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ariaSort } from "@/components/data-table/column-header";
import { dataTableFeatures } from "@/components/data-table/features";
import { DataTablePagination } from "@/components/data-table/pagination";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Task } from "../../../../shared/schemas/task.ts";
import type { PublicUser } from "../../../../shared/schemas/user.ts";
import { taskListQueryOptions } from "../api.ts";
import { canDeleteTasks } from "../labels.ts";
import {
  pageCount,
  pageSizeOptions,
  type TaskSearch,
  tableStateFromSearch,
  updateTaskSearch,
} from "../search.ts";
import { TaskDeleteDialog } from "./task-delete-dialog.tsx";
import { TaskFormDialog } from "./task-form-dialog.tsx";
import { taskColumns } from "./tasks-columns.tsx";
import { TasksToolbar } from "./tasks-toolbar.tsx";

// Die Aufgabe bleibt beim Schließen stehen, damit der Dialog nicht während der Animation umspringt.
type DialogState = { open: boolean; task?: Task };
const closed = (state: DialogState) => ({ ...state, open: false });

/**
 * Aufgaben-Liste: Tabellenzustand kommt aus `search` (Adresszeile), jede Änderung geht über
 * `onSearchChange` zurück dorthin. Sortiert, gefiltert und geteilt wird in der API.
 */
export function TasksTable({
  search,
  onSearchChange,
  user,
}: {
  search: TaskSearch;
  onSearchChange: (search: TaskSearch, options?: { replace?: boolean }) => void;
  user: PublicUser;
}) {
  const [formDialog, setFormDialog] = useState<DialogState>({ open: false });
  const [deleteDialog, setDeleteDialog] = useState<DialogState>({ open: false });
  const query = useQuery(taskListQueryOptions(search));
  const state = tableStateFromSearch(search);
  const canDelete = canDeleteTasks(user);

  const columns = useMemo(
    () =>
      taskColumns({
        canDelete,
        onEdit: (task) => setFormDialog({ open: true, task }),
        onDelete: (task) => setDeleteDialog({ open: true, task }),
      }),
    [canDelete],
  );

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data: query.data?.items ?? [],
    getRowId: (task) => task.id,
    state,
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    enableMultiSort: false,
    sortDescFirst: false,
    rowCount: query.data?.total ?? 0,
    onSortingChange: (updater) => onSearchChange(updateTaskSearch(search, "sorting", updater)),
    onColumnFiltersChange: (updater) =>
      onSearchChange(updateTaskSearch(search, "columnFilters", updater)),
    onGlobalFilterChange: (updater) =>
      onSearchChange(updateTaskSearch(search, "globalFilter", updater), { replace: true }),
    onPaginationChange: (updater) =>
      onSearchChange(updateTaskSearch(search, "pagination", updater)),
  });

  // Seite gibt es nicht (mehr), etwa nach dem Löschen des letzten Eintrags: auf die letzte Seite.
  const total = query.data?.total;
  const lastPage = total === undefined ? undefined : pageCount(total, state.pagination.pageSize);
  useEffect(() => {
    if (lastPage !== undefined && (search.page ?? 1) > lastPage) {
      onSearchChange({ ...search, page: lastPage > 1 ? lastPage : undefined }, { replace: true });
    }
  }, [lastPage, search, onSearchChange]);

  const filtered = state.columnFilters.length > 0 || state.globalFilter !== "";
  const rows = table.getRowModel().rows;
  const columnCount = columns.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TasksToolbar
          table={table}
          query={state.globalFilter}
          filtered={filtered}
          onReset={() => onSearchChange({ sort: search.sort, pageSize: search.pageSize })}
        />
        <Button size="sm" onClick={() => setFormDialog({ open: true })}>
          <Plus aria-hidden="true" />
          Neue Aufgabe
        </Button>
      </div>

      {query.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive p-3 text-destructive text-sm"
        >
          <span>Aufgaben konnten nicht geladen werden: {query.error.message}</span>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Erneut versuchen
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table
          aria-label="Aufgaben"
          aria-busy={query.isFetching}
          className={cn(query.isPlaceholderData && "opacity-60")}
        >
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} aria-sort={ariaSort(header.column)}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columnCount} className="h-24 text-center">
                  {query.isPending ? (
                    <span role="status">Aufgaben werden geladen …</span>
                  ) : query.isError ? (
                    "Keine Daten"
                  ) : (
                    <span role="status">
                      {filtered ? "Keine Aufgaben zu diesen Filtern." : "Noch keine Aufgaben."}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {query.data && (
        <DataTablePagination
          table={table}
          pagination={state.pagination}
          total={query.data.total}
          pageSizeOptions={pageSizeOptions}
        />
      )}

      <TaskFormDialog
        open={formDialog.open}
        onOpenChange={(open) => !open && setFormDialog(closed)}
        task={formDialog.task}
      />
      {deleteDialog.task && (
        <TaskDeleteDialog
          open={deleteDialog.open}
          onOpenChange={(open) => !open && setDeleteDialog(closed)}
          task={deleteDialog.task}
        />
      )}
    </div>
  );
}
