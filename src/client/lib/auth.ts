import { type QueryClient, queryOptions } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import type { Login } from "../../shared/schemas/auth.ts";
import type { PublicUser, Role } from "../../shared/schemas/user.ts";
import { ApiError, api, unwrap } from "./api.ts";

/** Angemeldeter Benutzer, ohne Sitzung `null` (die 401 von `/api/auth/me` ist kein Fehler). */
export const meQueryOptions = queryOptions({
  queryKey: ["auth", "me"],
  queryFn: async (): Promise<PublicUser | null> => {
    try {
      const { user } = await unwrap(api.api.auth.me.$get());
      return user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 5 * 60_000,
});

export async function login(input: Login): Promise<PublicUser> {
  const { user } = await unwrap(api.api.auth.login.$post({ json: input }));
  return user;
}

export async function logout(): Promise<void> {
  await unwrap(api.api.auth.logout.$post());
}

/**
 * Für `beforeLoad` geschützter Routen: gibt den Benutzer zurück oder leitet ohne Sitzung
 * zur Anmeldung weiter. `href` ist die aufgerufene Adresse, dorthin geht es nach dem Login.
 */
export async function requireUser(queryClient: QueryClient, href: string): Promise<PublicUser> {
  const user = await queryClient.ensureQueryData(meQueryOptions);
  if (!user) throw redirect({ to: "/login", search: { redirect: href } });
  return user;
}

/** Nur Pfade dieser Seite (`/…`), sonst `/`. Verhindert Weiterleitung auf fremde Seiten. */
export function safeRedirect(target: string | undefined): string {
  if (!target?.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) return "/";
  return target;
}

export const roleLabels: Record<Role, string> = { admin: "Admin", benutzer: "Benutzer" };
