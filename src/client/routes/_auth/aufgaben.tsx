import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { TasksTable } from "@/features/tasks/components/tasks-table";
import { parseTaskSearch, type TaskSearch } from "@/features/tasks/search";

// Backoffice-Muster: Liste mit Sortierung, Filter, Suche und Seiten, Zustand in der Adresszeile.
export const Route = createFileRoute("/_auth/aufgaben")({
  validateSearch: parseTaskSearch,
  component: TasksPage,
});

function TasksPage() {
  const { user } = Route.useRouteContext();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const changeSearch = useCallback(
    (next: TaskSearch, options?: { replace?: boolean }) =>
      void navigate({ search: next, replace: options?.replace }),
    [navigate],
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 md:p-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-semibold text-2xl">Aufgaben</h1>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            Zur Startseite
          </Link>
        </Button>
      </div>
      <TasksTable search={search} onSearchChange={changeSearch} user={user} />
    </main>
  );
}
