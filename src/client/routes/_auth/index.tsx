import { createFileRoute } from "@tanstack/react-router";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { roleLabels } from "@/lib/auth";

export const Route = createFileRoute("/_auth/")({
  component: HomePage,
});

// Menü und „Abmelden“ stehen in der Seitenleiste (components/app-sidebar.tsx).
function HomePage() {
  const { user } = Route.useRouteContext();

  return (
    <main className="flex w-full flex-1 items-center justify-center p-6 md:p-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Hallo {user.name}</CardTitle>
          <CardDescription>
            Angemeldet als {user.email}, Rolle: {roleLabels[user.role]}
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}
