import { afterEach, describe, expect, test } from "bun:test";
import { createMemoryHistory } from "@tanstack/react-router";
import type { PublicUser } from "../shared/schemas/user.ts";
import { createQueryClient } from "./lib/query-client.ts";
import { createAppRouter } from "./router.tsx";

const admin: PublicUser = {
  id: "u1",
  email: "admin@example.test",
  name: "Ada Admin",
  role: "admin",
};
const originalFetch = globalThis.fetch;
let requests: string[] = [];

/** Ersetzt fetch: `/api/auth/me` antwortet mit `user` oder ohne Sitzung mit 401. */
function serveMe(user: PublicUser | null) {
  requests = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    requests.push(url);
    if (!url.endsWith("/api/auth/me")) return new Response(null, { status: 500 });
    return user
      ? Response.json({ user })
      : Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function open(path: string) {
  const queryClient = createQueryClient({ onUnauthorized: () => {} });
  // Wie im Browser (isServer false, Weiterleitungen führt der Router selbst aus), aber ohne
  // window: feste Adresse, Verlauf im Speicher, keine Scroll-Wiederherstellung.
  const router = createAppRouter(queryClient, {
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: false,
    origin: "http://localhost",
    scrollRestoration: false,
  });
  // Eine Weiterleitung aus beforeLoad startet eine zweite Navigation, load() wartet sie mit ab.
  await router.load();
  return router;
}

describe("geschützte Startseite", () => {
  test("ohne Sitzung leitet / zur Anmeldung weiter, mit Rücksprung auf /", async () => {
    serveMe(null);
    const router = await open("/");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/" });
    expect(requests.some((url) => url.endsWith("/api/auth/me"))).toBe(true);
  });

  test("mit Sitzung bleibt / und der Benutzer steht im Routen-Kontext", async () => {
    serveMe(admin);
    const router = await open("/");
    expect(router.state.location.pathname).toBe("/");
    const home = router.state.matches.find((m) => m.routeId === "/_auth/");
    expect(home?.context).toMatchObject({ user: admin });
  });

  test("angemeldet führt /login direkt zur Startseite", async () => {
    serveMe(admin);
    const router = await open("/login");
    expect(router.state.location.pathname).toBe("/");
  });

  test("ohne Sitzung bleibt /login die Anmeldeseite", async () => {
    serveMe(null);
    const router = await open("/login?redirect=%2F");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/" });
  });
});

/** Suchparameter nach `validateSearch` der Route /aufgaben. */
const tasksSearch = (router: Awaited<ReturnType<typeof open>>) =>
  router.state.matches.find((m) => m.routeId === "/_auth/aufgaben")?.search;

describe("Seite Aufgaben", () => {
  test("ohne Sitzung zur Anmeldung, danach zurück mit denselben Suchparametern", async () => {
    serveMe(null);
    const router = await open("/aufgaben?page=2&sort=dueDate");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toEqual({ redirect: "/aufgaben?page=2&sort=dueDate" });
  });

  test("Tabellenzustand kommt aus der Adresszeile", async () => {
    serveMe(admin);
    const router = await open("/aufgaben?page=2&sort=-dueDate&status=offen&q=Bericht");
    expect(router.state.location.pathname).toBe("/aufgaben");
    expect(tasksSearch(router)).toEqual({
      page: 2,
      sort: "-dueDate",
      status: ["offen"],
      q: "Bericht",
    });
  });

  test("ungültige Suchparameter fallen auf den Standard zurück, die Seite bleibt", async () => {
    serveMe(admin);
    const router = await open("/aufgaben?page=-1&sort=kaputt&status=nie");
    expect(router.state.location.pathname).toBe("/aufgaben");
    expect(tasksSearch(router)).toEqual({});
  });
});
