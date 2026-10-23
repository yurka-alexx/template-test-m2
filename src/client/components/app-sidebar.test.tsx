import { afterEach, describe, expect, test } from "bun:test";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import type { PublicUser } from "../../shared/schemas/user.ts";
import { createQueryClient } from "../lib/query-client.ts";
import { createAppRouter } from "../router.tsx";

const benutzer: PublicUser = {
  id: "u2",
  email: "bea@example.test",
  name: "Bea Benutzer",
  role: "benutzer",
};
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/**
 * Öffnet `path` im Router der App (Verlauf im Speicher, `/api/auth/me` liefert `user`, bei `null`
 * 401) und rendert die Seite einmal als HTML, ohne Browser. Breiter Bildschirm: Die Leiste ist offen.
 */
async function render(path: string, user: PublicUser | null = benutzer) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.endsWith("/api/auth/me")) return new Response(null, { status: 500 });
    return user
      ? Response.json({ user })
      : Response.json({ error: "Nicht angemeldet" }, { status: 401 });
  }) as typeof fetch;
  const queryClient = createQueryClient({ onUnauthorized: () => {} });
  const router = createAppRouter(queryClient, {
    history: createMemoryHistory({ initialEntries: [path] }),
    isServer: false,
    origin: "http://localhost",
    scrollRestoration: false,
  });
  await router.load();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** Das `<a>`-Element des Menüeintrags mit dem Text `title`. */
function menuLink(html: string, title: string) {
  const nav = html.slice(html.indexOf('<nav aria-label="Hauptmenü"'), html.indexOf("</nav>"));
  const link = [...nav.matchAll(/<a [^>]*>.*?<\/a>/g)]
    .map((m) => m[0])
    .find((a) => a.includes(`<span>${title}</span>`));
  expect(link).toBeDefined();
  return link as string;
}

describe("App-Hülle mit Seitenleiste", () => {
  test("Menü mit Start und Aufgaben, auf /aufgaben ist Aufgaben markiert", async () => {
    const html = await render("/aufgaben");
    const start = menuLink(html, "Start");
    const aufgaben = menuLink(html, "Aufgaben");

    expect(start).toContain('href="/"');
    expect(start).toContain('data-active="false"');
    expect(start).not.toContain("aria-current");
    expect(aufgaben).toContain('href="/aufgaben"');
    expect(aufgaben).toContain('data-active="true"');
    expect(aufgaben).toContain('aria-current="page"');
  });

  test("mit Suchparametern (Sortierung, Seite) bleibt Aufgaben markiert", async () => {
    const html = await render("/aufgaben?page=2&sort=dueDate");
    expect(menuLink(html, "Aufgaben")).toContain('aria-current="page"');
    expect(menuLink(html, "Aufgaben")).toContain('data-active="true"');
    expect(menuLink(html, "Start")).not.toContain("aria-current");
  });

  test("auf / ist nur Start markiert", async () => {
    const html = await render("/");
    expect(menuLink(html, "Start")).toContain('aria-current="page"');
    expect(menuLink(html, "Start")).toContain('data-active="true"');
    expect(menuLink(html, "Aufgaben")).not.toContain("aria-current");
    expect(menuLink(html, "Aufgaben")).toContain('data-active="false"');
  });

  test("Fuß mit Name, Rolle, Farbschema und Abmelden, Auslöser in der Kopfzeile", async () => {
    const html = await render("/");
    const footer = html.slice(html.indexOf('data-slot="sidebar-footer"'));
    expect(footer).toContain("Bea Benutzer");
    expect(footer).toContain(">Benutzer</span>");
    expect(footer).toContain('aria-label="Farbschema wechseln"');
    expect(footer).toMatch(/<button[^>]*data-sidebar="menu-button"[^>]*>.*<span>Abmelden<\/span>/);

    // Leiste offen, auf Symbole einklappbar, Auslöser mit Namen und Zustand.
    expect(html).toContain('data-state="expanded"');
    const trigger = html.match(/<button[^>]*data-sidebar="trigger"[^>]*>/)?.[0];
    expect(trigger).toContain('aria-expanded="true"');
    expect(html).toContain('<span class="sr-only">Seitenleiste umschalten</span>');
  });

  test("Umschalter für das Farbschema nur einmal: in der Seitenleiste, nicht in der Kopfzeile", async () => {
    const html = await render("/aufgaben");
    expect(html.match(/aria-label="Farbschema wechseln"/g)).toHaveLength(1);
  });

  test("Anmeldeseite ohne App-Hülle, Umschalter in der Kopfzeile", async () => {
    const html = await render("/login", null);
    expect(html).not.toContain('data-slot="sidebar"');
    expect(html).toMatch(/<header[^>]*><button[^>]*aria-label="Farbschema wechseln"/);
  });
});
