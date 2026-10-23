import type { Column, RowData } from "@tanstack/react-table";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DataTableFeatures } from "./features.ts";

export type FilterOption = { value: string; label: string };

/**
 * Mehrfachauswahl für eine Spalte (nach `shadcn-admin`, ohne cmdk): Knopf mit dem Spaltennamen,
 * Menü mit Häkchen je Wert. Der Filterwert ist die Liste der gewählten Werte.
 */
export function DataTableFacetedFilter<TData extends RowData, TValue>({
  column,
  title,
  options,
}: {
  column: Column<DataTableFeatures, TData, TValue>;
  title: string;
  options: readonly FilterOption[];
}) {
  const raw = column.getFilterValue();
  const selected = Array.isArray(raw) ? (raw as string[]) : [];

  const toggle = (value: string, checked: boolean) => {
    const next = checked ? [...selected, value] : selected.filter((v) => v !== value);
    column.setFilterValue(next.length > 0 ? next : undefined);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-dashed">
          <ListFilter aria-hidden="true" />
          {title}
          {selected.length > 0 && (
            <span className="rounded-sm bg-secondary px-1 font-normal text-secondary-foreground">
              <span className="sr-only">, ausgewählt: </span>
              {selected.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) => toggle(option.value, checked)}
            // Menü bleibt offen, damit man mehrere Werte wählen kann.
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => column.setFilterValue(undefined)}>
              Filter zurücksetzen
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
