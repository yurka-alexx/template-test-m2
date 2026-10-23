import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Oberfläche: Quelle in src/client, Build nach dist/client (liefert Hono aus, siehe src/server/static.ts).
export default defineConfig({
  plugins: [
    // Muss vor react() stehen. Erzeugt src/client/routeTree.gen.ts aus src/client/routes.
    tanstackRouter({
      target: "react",
      routesDirectory: "src/client/routes",
      generatedRouteTree: "src/client/routeTree.gen.ts",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src/client", import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://localhost:3000" },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
