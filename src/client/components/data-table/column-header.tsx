import type { Column, RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DataTableFeatures } from "./features.ts";

/** `aria-sort` für die Kopfzelle (`<th>`), damit Screenreader und Tests die Sortierung sehen. */
export function ariaSort<TData extends RowData, TValue>(
  column: Column<DataTableFeatures, TData, TValue>,
) {
  if (!column.getCanSort()) return undefined;
  const sorted = column.getIsSorted();
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
}

/**
 * Spaltenkopf nach `shadcn-admin`, vereinfacht: Klick sortiert aufsteigend, dann absteigend,
 * dann wieder unsortiert. Der Knopf heißt wie die Spalte (z. B. „Titel“).
 */
export function DataTableColumnHeader<TData extends RowData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
  className?: string;
}) {
  if (!column.getCanSort()) return <span className={className}>{title}</span>;

  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-3 h-8", className)}
      onClick={column.getToggleSortingHandler()}
    >
      {title}
      <Icon aria-hidden="true" className={cn(!sorted && "text-muted-foreground")} />
    </Button>
  );
}
