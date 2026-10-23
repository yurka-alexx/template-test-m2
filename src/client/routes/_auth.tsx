import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { requireUser } from "@/lib/auth";

// Alle Routen unter routes/_auth/ brauchen eine Sitzung, ohne geht es zur Anmeldung.
// Das ist nur Bedienkomfort: Die Rechte prüft das Backend bei jedem Aufruf selbst.
export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ context, location }) => ({
    user: await requireUser(context.queryClient, location.href),
  }),
  component: AppShell,
});

// App-Hülle nach shadcn/ui-Block "sidebar-07": Seitenleiste links, rechts Kopfzeile mit dem
// Auslöser „Seitenleiste umschalten“ und darunter die Seite.
function AppShell() {
  const { user } = Route.useRouteContext();
  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
