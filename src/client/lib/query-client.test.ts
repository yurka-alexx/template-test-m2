import { describe, expect, test } from "bun:test";
import { ApiError } from "./api.ts";
import { createQueryClient } from "./query-client.ts";

describe("createQueryClient", () => {
  test("401 einer Abfrage meldet abgelaufene Sitzung, ohne Wiederholung", async () => {
    let unauthorized = 0;
    let calls = 0;
    const client = createQueryClient({ onUnauthorized: () => unauthorized++ });
    await client
      .fetchQuery({
        queryKey: ["x"],
        queryFn: () => {
          calls++;
          throw new ApiError(401, "Nicht angemeldet");
        },
      })
      .catch(() => {});
    expect(unauthorized).toBe(1);
    expect(calls).toBe(1);
  });

  test("andere Fehler melden keine abgelaufene Sitzung", async () => {
    let unauthorized = 0;
    const client = createQueryClient({ onUnauthorized: () => unauthorized++ });
    await client
      .fetchQuery({
        queryKey: ["y"],
        queryFn: () => {
          throw new ApiError(403, "Keine Berechtigung");
        },
      })
      .catch(() => {});
    expect(unauthorized).toBe(0);
  });

  test("4xx wird nicht wiederholt, Server- und Netzwerkfehler bis zu zweimal", () => {
    const client = createQueryClient({ onUnauthorized: () => {} });
    const retry = client.getDefaultOptions().queries?.retry as (n: number, e: unknown) => boolean;
    expect(retry(0, new ApiError(400, "x"))).toBe(false);
    expect(retry(0, new ApiError(404, "x"))).toBe(false);
    expect(retry(0, new ApiError(500, "x"))).toBe(true);
    expect(retry(1, new ApiError(0, "x"))).toBe(true);
    expect(retry(2, new ApiError(500, "x"))).toBe(false);
  });
});
