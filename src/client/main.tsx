import "@fontsource-variable/open-sans";
import "./styles/index.css";

import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { meQueryOptions } from "./lib/auth.ts";
import { createQueryClient } from "./lib/query-client.ts";
import { createAppRouter } from "./router.tsx";

const queryClient = createQueryClient({
  // Sitzung abgelaufen: Benutzer vergessen, die geschützte Route leitet dann zur Anmeldung.
  onUnauthorized: () => {
    queryClient.setQueryData(meQueryOptions.queryKey, null);
    void router.invalidate();
  },
});
const router = createAppRouter(queryClient);

const root = document.getElementById("root");
if (!root) throw new Error("Element #root fehlt in index.html");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
