import type { PaginationState, RowData, Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { DataTableFeatures } from "./features.ts";

/** Seitensteuerung nach `shadcn-admin`: Einträge je Seite, „Seite x von y“, vier Knöpfe. */
export function DataTablePagination<TData extends RowData>({
  table,
  pagination,
  total,
  pageSizeOptions,
}: {
  table: Table<DataTableFeatures, TData>;
  pagination: PaginationState;
  total: number;
  pageSizeOptions: readonly number[];
}) {
  const pageSizeId = useId();
  // Leere Liste: trotzdem „Seite 1 von 1“.
  const pageCount = Math.max(1, table.getPageCount());
  const sizes = pageSizeOptions.includes(pagination.pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pagination.pageSize].sort((a, b) => a - b);

  return (
    <nav aria-label="Seiten" className="flex flex-wrap items-center justify-between gap-4 px-2">
      <p className="text-muted-foreground text-sm">
        {total === 1 ? "1 Eintrag" : `${total} Einträge`}
      </p>
      <div className="flex flex-wrap items-center gap-4 lg:gap-6">
        <div className="flex items-center gap-2">
          <Label htmlFor={pageSizeId}>Einträge pro Seite</Label>
          <NativeSelect
            id={pageSizeId}
            value={pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
          >
            {sizes.map((size) => (
              <NativeSelectOption key={size} value={size}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <p className="font-medium text-sm" aria-live="polite">
          Seite {pagination.pageIndex + 1} von {pageCount}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Erste Seite"
            onClick={() => table.firstPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Vorherige Seite"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Nächste Seite"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Letzte Seite"
            onClick={() => table.lastPage()}
            disabled={!table.getCanLastPage()}
          >
            <ChevronsRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
