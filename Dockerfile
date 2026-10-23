# Ein Image für API und Oberfläche (docs/ARCHITEKTUR.md, MF5). Lokal: docker compose up --build
# Bun-Version wie "packageManager" in package.json, src/server/dockerfile.test.ts prüft den Gleichstand.
ARG BUN_VERSION=1.3.14

# Stufe 1: alle Abhängigkeiten (auch dev, für den Build der Oberfläche)
FROM oven/bun:${BUN_VERSION}-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Nur Produktionsabhängigkeiten für die Laufzeitstufe
FROM oven/bun:${BUN_VERSION}-slim AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stufe 2: Oberfläche nach dist/client bauen
FROM oven/bun:${BUN_VERSION}-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Laufzeit: Server, Skripte (seed, user:create, db:migrate) und gebaute Oberfläche
FROM oven/bun:${BUN_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY --from=build /app/dist/client ./dist/client
USER bun
EXPOSE 3000
# Das slim-Image hat kein curl, deshalb fragt Bun selbst /healthz ab.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT}/healthz`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "run", "start"]
