import { describe, expect, test } from "bun:test";
import { ApiError, createApi, unwrap } from "./api.ts";

/** Client, dessen fetch immer mit `response` antwortet. */
const clientAnswering = (response: () => Response) =>
  createApi("http://localhost", (async () => response()) as unknown as typeof fetch);

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("kein Fehler geworfen");
}

const loginInput = { json: { email: "x", password: "y" } };

describe("unwrap", () => {
  test("gibt den Body der Erfolgsantwort zurück", async () => {
    const user = { id: "1", email: "a@example.test", name: "A", role: "admin" as const };
    const api = clientAnswering(() => Response.json({ user }));
    expect(await unwrap(api.api.auth.me.$get())).toEqual({ user });
  });

  test("204 ergibt null", async () => {
    const api = clientAnswering(() => new Response(null, { status: 204 }));
    expect(await unwrap(api.api.auth.logout.$post())).toBeNull();
  });

  test("Fehler im Format {error, fields} wird ApiError mit Status und Feldern", async () => {
    const api = clientAnswering(() =>
      Response.json(
        {
          error: "Ungültige Eingabe",
          fields: { email: ["muss eine gültige E-Mail-Adresse sein"] },
        },
        { status: 400 },
      ),
    );
    const error = await caught(unwrap(api.api.auth.login.$post(loginInput)));
    expect(error.status).toBe(400);
    expect(error.message).toBe("Ungültige Eingabe");
    expect(error.fields).toEqual({ email: ["muss eine gültige E-Mail-Adresse sein"] });
  });

  test("401 ohne fields bleibt allgemeine Meldung", async () => {
    const api = clientAnswering(() =>
      Response.json({ error: "E-Mail oder Passwort falsch" }, { status: 401 }),
    );
    const error = await caught(unwrap(api.api.auth.login.$post(loginInput)));
    expect(error.status).toBe(401);
    expect(error.message).toBe("E-Mail oder Passwort falsch");
    expect(error.fields).toBeUndefined();
  });

  test("Antwort ohne JSON (z. B. vom Proxy) ergibt eine Meldung mit Status", async () => {
    const api = clientAnswering(() => new Response("Bad Gateway", { status: 502 }));
    const error = await caught(unwrap(api.api.auth.me.$get()));
    expect(error.status).toBe(502);
    expect(error.message).toBe("Anfrage fehlgeschlagen (502)");
  });

  test("Netzwerkfehler ergibt Status 0", async () => {
    const api = createApi("http://localhost", (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    const error = await caught(unwrap(api.api.auth.me.$get()));
    expect(error.status).toBe(0);
    expect(error.message).toBe("Server nicht erreichbar");
  });
});
