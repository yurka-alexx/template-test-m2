import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { LoginForm } from "@/components/login-form";
import { meQueryOptions } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional().catch(undefined) }),
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(meQueryOptions);
    if (user) throw redirect({ to: "/" });
  },
  component: LoginPage,
});

// Aufbau nach dem shadcn/ui-Block "login-01".
function LoginPage() {
  const { redirect: target } = Route.useSearch();
  return (
    <main className="flex w-full flex-1 items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm redirectTo={target} />
      </div>
    </main>
  );
}
