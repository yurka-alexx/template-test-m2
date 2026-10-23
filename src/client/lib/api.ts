import { type ClientResponse, hc } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";
import type { AppType } from "../../server/app.ts";
import type { ApiErrorBody } from "../../shared/api-error.ts";

/** Fehlerantwort der API (`{error, fields?}`). `status` 0 heißt: Server nicht erreichbar. */
export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string[]>,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Typisierter Client für alle Routen aus `src/server/app.ts`. Im Browser relativ zur Seite. */
export function createApi(baseUrl = "/", fetchFn?: typeof fetch) {
  return hc<AppType>(baseUrl, fetchFn ? { fetch: fetchFn } : undefined);
}

export const api = createApi();

// Antworttyp der Erfolgsfälle, z. B. `{user}` aus `200 | 401`.
type SuccessBody<R> =
  R extends ClientResponse<infer T, infer S, infer _F>
    ? S extends SuccessStatusCode
      ? T
      : never
    : never;

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

async function toApiError(res: { status: number; json(): Promise<unknown> }): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => undefined);
  if (isApiErrorBody(body)) return new ApiError(res.status, body.error, body.fields);
  return new ApiError(res.status, `Anfrage fehlgeschlagen (${res.status})`);
}

/**
 * Wartet auf einen Aufruf des RPC-Clients und gibt den Body der Erfolgsantwort zurück
 * (bei 204 `null`). Jede andere Antwort wird als `ApiError` mit `error` und `fields` geworfen.
 *
 * @example const { user } = await unwrap(api.api.auth.me.$get());
 */
export async function unwrap<R extends ClientResponse<unknown, number>>(
  request: Promise<R>,
): Promise<SuccessBody<R>> {
  let res: R;
  try {
    res = await request;
  } catch (cause) {
    throw new ApiError(0, "Server nicht erreichbar", undefined, { cause });
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return null as SuccessBody<R>;
  return (await res.json()) as SuccessBody<R>;
}
