import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useRouterState } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/theme-toggle";

export type RouterContext = { queryClient: QueryClient };

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

// Kopfzeile mit dem Umschalter für das Farbschema auf den Seiten ohne App-Hülle (Anmeldung,
// 404). Im geschützten Bereich sitzt der Umschalter in der Seitenleiste (routes/_auth.tsx), die
// Kopfzeile entfällt dort. Die Seiten füllen den Rest der Höhe mit `flex-1`.
function RootLayout() {
  const inAppShell = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === "/_auth"),
  });
  return (
    <div className="flex min-h-svh flex-col">
      {!inAppShell && (
        <header className="flex justify-end px-4 pt-4">
          <ThemeToggle />
        </header>
      )}
      <Outlet />
    </div>
  );
}
