import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { House, ListTodo, LogOut, UserRound } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { logout, meQueryOptions, roleLabels } from "@/lib/auth";
import type { PublicUser } from "../../shared/schemas/user.ts";

/**
 * Einträge des Hauptmenüs. Neue Seite: Route unter `routes/_auth/` anlegen und hier eintragen.
 * `exact`: nur genau dieser Pfad markiert den Eintrag (sonst auch Unterseiten).
 */
export const menuItems = [
  { title: "Start", to: "/", icon: House, exact: true },
  { title: "Aufgaben", to: "/aufgaben", icon: ListTodo, exact: false },
] as const;

/**
 * Seitenleiste der App-Hülle nach shadcn/ui-Block "sidebar-07": auf Symbole einklappbar, auf
 * schmalen Bildschirmen eine Schublade. Oben das Menü, unten Name und Rolle, Farbschema und
 * „Abmelden“. Steht in `routes/_auth.tsx` innerhalb von `SidebarProvider`.
 */
export function AppSidebar({ user }: { user: PublicUser }) {
  const { isMobile, setOpen, setOpenMobile } = useSidebar();
  const matchRoute = useMatchRoute();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      queryClient.clear();
      queryClient.setQueryData(meQueryOptions.queryKey, null);
      await navigate({ to: "/login" });
    },
    // Eingeklappt ist die Meldung versteckt (zu schmal): Leiste aufklappen, damit man sie sieht.
    onError: () => {
      if (!isMobile) setOpen(true);
    },
  });

  // In der Schublade führt ein Klick auf einen Eintrag zur Seite und schließt die Schublade.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <nav aria-label="Hauptmenü">
          <SidebarGroup>
            <SidebarGroupLabel>Menü</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={Boolean(matchRoute({ to: item.to, fuzzy: !item.exact }))}
                      tooltip={item.title}
                    >
                      <Link
                        to={item.to}
                        activeOptions={{ exact: item.exact }}
                        onClick={closeOnMobile}
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        {logoutMutation.isError && (
          <p
            role="alert"
            className="px-2 text-destructive text-xs group-data-[collapsible=icon]:hidden"
          >
            Abmelden fehlgeschlagen: {logoutMutation.error.message}
          </p>
        )}
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2 group-data-[collapsible=icon]:flex-col">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden p-2 text-sm group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:p-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <UserRound aria-hidden="true" className="size-4" />
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-sidebar-foreground/70 text-xs">
                  {roleLabels[user.role]}
                </span>
              </span>
            </div>
            <ThemeToggle className="size-8 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Abmelden"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              <LogOut aria-hidden="true" />
              <span>Abmelden</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
