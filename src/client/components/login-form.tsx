import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, meQueryOptions, safeRedirect } from "@/lib/auth";
import { formErrorsFrom } from "@/lib/form-errors";
import { cn } from "@/lib/utils";
import { type Login, loginSchema } from "../../shared/schemas/auth.ts";

const fieldNames = ["email", "password"] as const;

// Aufbau nach dem shadcn/ui-Block "login-01", Prüfung mit dem gemeinsamen Login-Schema.
export function LoginForm({
  redirectTo,
  className,
  ...props
}: React.ComponentProps<"div"> & { redirectTo?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<Login>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  const { errors } = form.formState;

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async (user) => {
      queryClient.setQueryData(meQueryOptions.queryKey, user);
      router.history.push(safeRedirect(redirectTo));
    },
    onError: (error) => {
      const { fields, root } = formErrorsFrom(error, fieldNames);
      for (const name of fieldNames) {
        const message = fields[name];
        if (message) form.setError(name, { type: "server", message });
      }
      if (root) form.setError("root.server", { type: "server", message: root });
    },
  });

  const onSubmit = form.handleSubmit((values) => loginMutation.mutate(values));
  const rootError = errors.root?.server?.message;

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Anmelden</CardTitle>
          <CardDescription>Mit E-Mail-Adresse und Passwort anmelden</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-6">
              {rootError && (
                <p role="alert" className="text-destructive text-sm">
                  {rootError}
                </p>
              )}
              <div className="grid gap-3">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="name@example.com"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  {...form.register("email")}
                />
                {errors.email && (
                  <p id="email-error" className="text-destructive text-sm">
                    {errors.email.message}
                  </p>
                )}
              </div>
              <div className="grid gap-3">
                <Label htmlFor="password">Passwort</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? "password-error" : undefined}
                  {...form.register("password")}
                />
                {errors.password && (
                  <p id="password-error" className="text-destructive text-sm">
                    {errors.password.message}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                Anmelden
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
