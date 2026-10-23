import type { QueryClient } from "@tanstack/react-query";
import {
  createRouter,
  type ErrorComponentProps,
  type RouterConstructorOptions,
  type RouterHistory,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { routeTree } from "./routeTree.gen.ts";

function ErrorPage({ error, reset }: ErrorComponentProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-semibold text-lg">Etwas ist schiefgelaufen</h1>
      <p className="text-muted-foreground text-sm">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Button variant="outline" onClick={reset}>
        Erneut versuchen
      </Button>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="font-semibold text-lg">Seite nicht gefunden</h1>
      <a className="text-primary text-sm underline-offset-4 hover:underline" href="/">
        Zur Startseite
      </a>
    </main>
  );
}

type TestOptions = Partial<
  Pick<
    RouterConstructorOptions<
      typeof routeTree,
      "never",
      false,
      RouterHistory,
      Record<string, unknown>
    >,
    "history" | "isServer" | "origin" | "scrollRestoration"
  >
>;

/** Router der App. `options` nur für Tests: Verlauf im Speicher statt Browser-Adresse. */
export function createAppRouter(queryClient: QueryClient, options: TestOptions = {}) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
    // Daten liegen im Query-Cache, der Router soll sie nicht zusätzlich zwischenspeichern.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ErrorPage,
    defaultNotFoundComponent: NotFoundPage,
    scrollRestoration: true,
    ...options,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
