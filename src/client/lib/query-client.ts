import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api.ts";

const MAX_RETRIES = 2;

/**
 * Query-Client der App. Antworten mit 4xx werden nicht wiederholt. Liefert eine Abfrage 401
 * (Sitzung abgelaufen), ruft der Cache `onUnauthorized`, die App leitet dann zur Anmeldung.
 */
export function createQueryClient({ onUnauthorized }: { onUnauthorized: () => void }) {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) onUnauthorized();
      },
    }),
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < MAX_RETRIES;
        },
      },
    },
  });
}
