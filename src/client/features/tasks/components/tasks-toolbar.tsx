import type { Table } from "@tanstack/react-table";
import { X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { DataTableFacetedFilter } from "@/components/data-table/faceted-filter";
import type { DataTableFeatures } from "@/components/data-table/features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TASK_TITLE_MAX_LENGTH,
  type Task,
  taskPriorities,
  taskStatuses,
} from "../../../../shared/schemas/task.ts";
import { taskPriorityLabels, taskStatusLabels } from "../labels.ts";

const SEARCH_DELAY_MS = 300;

const statusOptions = taskStatuses.map((value) => ({ value, label: taskStatusLabels[value] }));
const priorityOptions = taskPriorities.map((value) => ({
  value,
  label: taskPriorityLabels[value],
}));

/**
 * Feldinhalt, nachdem sich die Suche in der Adresszeile (`query`) geändert hat. `sent` ist der
 * zuletzt selbst gesendete Suchtext: Kommt genau er zurück, ist das das Echo der eigenen Suche,
 * und das Feld bleibt, wie es ist (inzwischen getippte Zeichen gehen nicht verloren). Jeder
 * andere Wert kam von außen (Zurücksetzen, Zurück im Browser) und wird übernommen.
 */
export function nextSearchText(current: string, query: string, sent: string | undefined): string {
  if (current.trim() === query || query === sent) return current;
  return query;
}

/**
 * Suchfeld und Filter über der Tabelle (nach `shadcn-admin`). Die Suche wartet kurz aufs Tippen,
 * dann geht der Text an `table.setGlobalFilter` (Suchparameter `q`).
 */
export function TasksToolbar({
  table,
  query,
  filtered,
  onReset,
}: {
  table: Table<DataTableFeatures, Task>;
  query: string;
  filtered: boolean;
  onReset: () => void;
}) {
  const [text, setText] = useState(query);
  const sent = useRef<string | undefined>(undefined);
  const search = useEffectEvent((value: string) => {
    sent.current = value.trim();
    table.setGlobalFilter(value);
  });

  // Suche geändert: Werte von außen übernehmen, das Echo der eigenen Suche nur einmal überspringen.
  useEffect(() => {
    const echo = sent.current;
    sent.current = undefined;
    setText((current) => nextSearchText(current, query, echo));
  }, [query]);

  useEffect(() => {
    if (text.trim() === query) return;
    const timer = setTimeout(() => search(text), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, query]);

  const statusColumn = table.getColumn("status");
  const priorityColumn = table.getColumn("priority");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        aria-label="Aufgaben durchsuchen"
        placeholder="Titel oder Beschreibung …"
        maxLength={TASK_TITLE_MAX_LENGTH}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="h-8 w-full sm:w-64"
      />
      {statusColumn && (
        <DataTableFacetedFilter column={statusColumn} title="Status" options={statusOptions} />
      )}
      {priorityColumn && (
        <DataTableFacetedFilter
          column={priorityColumn}
          title="Priorität"
          options={priorityOptions}
        />
      )}
      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setText("");
            onReset();
          }}
        >
          Filter zurücksetzen
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
