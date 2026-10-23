# Architektur: Starter react-shadcn (Skalierungsfabrik (intern))

## Überblick

Ein GitHub-Template-Repo `yurka-alexx/starter-react-shadcn` (aus F1, bestätigt in `starter.md`, Entscheidung Yuri 23.10.2026) mit dem Standard-Stack der Fabrik. Neue Kundenprojekte entstehen über „Use this template“ und bekommen Gerüst, Anmeldung mit Rollen, ein Backoffice-Muster, Docker, CI und Doku fertig mit.

Nutzer sind die Agents der Fabrik (Dev, Critic, Abnahme), Yuri Bilogor und später Freelancer. Es gibt keine Last-Anforderungen und nur synthetische Daten. Keine Produktion: Die Staging-Demo auf Coolify ist die lauffähige Referenz.

Umfang: MF1 bis MF8. Kann-Funktionen (Seitenleiste, dunkles Farbschema, Hintergrundjob) kommen in Meilenstein 2. Nicht-Ziele bleiben draußen: Next.js, SSR, Mehrmandantenfähigkeit, Zahlungen, E-Mail, Fremdsysteme, PHP-Starter, Marketing-Website.

## Stack und Gerüst

Das ist der Standard-Stack aus `starter.md`, also keine Abweichung.

- **Frontend (MF1):** Vite, React 19, TypeScript, Tailwind CSS 4 (`@tailwindcss/vite`), shadcn/ui, Lucide, TanStack Router (dateibasiert), TanStack Query, TanStack Table, react-hook-form mit `@hookform/resolvers` und zod 4. Open Sans wird selbst gehostet (`@fontsource`), es gibt kein Google-Fonts-CDN.
- **Backend (MF2):** Hono auf Bun, Drizzle ORM mit dem Treiber `postgres` (postgres.js), `drizzle-kit` erzeugt versionierte SQL-Migrationen in `drizzle/`. Der Server spielt sie beim Start mit dem Drizzle-Migrator ein. Validierung läuft über `@hono/zod-validator` mit denselben Schemas wie im Frontend (`src/shared`). Typisierte API-Aufrufe im Frontend laufen über den Hono-RPC-Client (`hc<AppType>`).
- **Anmeldung (MF3):** eigene Sitzungen nach dem Muster aus „The Copenhagen Book“. Passwörter werden mit `Bun.password` (argon2id) gehasht, Sitzungen liegen als Hash des Tokens in Postgres und das Cookie ist HttpOnly.
- **Qualität (MF6):** Biome (Lint und Format), `tsc --noEmit`, `bun test`, Playwright, GitHub Actions.
- **Ein Paket statt Monorepo:** Die Ordner sind `src/client`, `src/server`, `src/shared`, `scripts/`, `e2e/`, `drizzle/` und `docs/`. Es gibt eine `package.json` und einen Befehlssatz, kein Turbo.
- **Versionen:** im Lockfile (`bun.lock`) fest. Die Bun-Version steht in `packageManager` in `package.json` und gilt gleich für CI (`bun-version-file`) und Dockerfile (`ARG BUN_VERSION`, ein Unit-Test prüft den Gleichstand).

**Gerüst: eigen.** In `starter.md` war noch kein Starter verfügbar, dieses Projekt baut den ersten. Das Gerüst bringt mit:

- `Dockerfile` (mehrstufig, ohne Root-Rechte, `HEALTHCHECK` auf `/healthz`) und `compose.yaml` (Dienste `db` und `app`)
- `/healthz` und `/probe`
- Test-Setup: `bun test` (Unit-Tests unter `src/`) und Playwright (`e2e/`)
- Biome und `check:tokens`
- Drizzle-Migrationen in `drizzle/`
- `.env.example`, mit einem Unit-Test gegen das Env-Schema abgeglichen
- CI in `.github/workflows/ci.yml` mit den Jobs `check` und `docker`, Dependabot in `.github/dependabot.yml`
- `CLAUDE.md`, `README.md` und `docs/` (`ARCHITEKTUR.md`, `BETRIEB.md`, `ENTSCHEIDUNGEN.md`)

**Vorlagen, erste Wahl:**

- **Offizielle shadcn/ui-Blocks** (MIT): `login` für die Anmeldeseite, `sidebar-07` für die App-Hülle (Kann, aus F4).
- **Tabellenmuster aus `satnaing/shadcn-admin`** (MIT, letzter Commit 11.06.2026, React 19, Tailwind 4.2, Vite 8, TanStack Router, Table und Query): Toolbar, Spaltenfilter, Seitensteuerung und Spaltenkopf-Sortierung. Clerk, ESLint und Prettier werden nicht übernommen.
- **`stevedylandev/bhvr`** (MIT, letzter Commit 28.03.2026) nur als Muster für Hono-RPC zwischen Server und Client.

## Laufzeit und Prozesse

- **Ein Prozess `web`:** Bun startet Hono. Hono liefert unter `/api/*` die API, unter `/healthz` den Healthcheck und unter `/probe` die Probe. Alles andere ist der gebaute Vite-Client aus `dist/client` mit SPA-Fallback auf `index.html`. Ein Image enthält API und Oberfläche (MF5).
- **Start-Reihenfolge:**
  1. Umgebungsvariablen mit zod prüfen (`src/server/env.ts`), bei Fehler mit klarer Meldung abbrechen.
  2. Migrationen einspielen.
  3. Ersten Admin aus der Umgebung anlegen, falls gesetzt und noch kein Admin existiert.
  4. Port öffnen.
  5. Täglichen Zeitplan für abgelaufene Sitzungen starten. Bei SIGINT/SIGTERM wird er vor Server und Datenbank gestoppt.
- **Lokal (AK1):** `bun run dev` startet zuerst Postgres aus `compose.yaml` (`docker compose up -d --wait db`). Danach laufen parallel die API mit `bun --watch` auf Port 3000 und Vite auf Port 5173 mit Proxy `/api` → 3000.
- **Image (MF5):** `Dockerfile` auf `oven/bun` (slim), Laufzeit als Benutzer `bun`, `NODE_ENV=production`, Port 3000, `HEALTHCHECK` fragt `/healthz` mit Bun ab, Start mit `bun run start`. `docker compose up --build` startet Image und Postgres zusammen. Der CI-Job `docker` baut das Image, startet Compose und prüft `/healthz`, Migrationen, Anmeldung und Seed.
- **Kein Worker, kein externer Cron.** Hintergrundjob (Kann-Funktion): `startSessionCleanup` in `src/server/auth/cleanup.ts` plant mit `croner` im selben Prozess täglich um 3 Uhr (Zeitzone des Servers, im Image UTC) `deleteExpiredSessions`, das alle Sitzungen mit `expires_at` vor dem Zeitpunkt des Laufs löscht und die Zahl loggt. Ein Fehler im Job wird geloggt, der Server läuft weiter. Kein Lauf beim Start, keine Umgebungsvariable. Das gilt nur bei einer Instanz, mehrere Instanzen sind nicht vorgesehen (der Job liefe sonst in jeder Instanz).
- **Dateiablage:** keine.
- **Externe Dienste:** keine.

Befehle (Beschreibung in `CLAUDE.md`, Betrieb in `docs/BETRIEB.md`):

- `bun run dev`
- `bun run build`
- `bun run start`
- `bun run lint` (Biome plus `check:tokens`)
- `bun run format`
- `bun run typecheck`
- `bun test`
- `bun run test:e2e`
- `bun run db:generate`
- `bun run db:migrate`
- `bun run seed`
- `bun run user:create`

## Datenmodell

Postgres, Schema in `src/server/db/schema.ts`, Migrationen in `drizzle/`.

- **`users`:** `id` (uuid), `email` (eindeutig, klein geschrieben), `name`, `password_hash`, `role` (`admin` | `benutzer`), `created_at`, `updated_at`.
- **`sessions`:** `id` (SHA-256 des Sitzungs-Tokens, Text), `user_id` → `users.id` (on delete cascade), `expires_at`, `created_at`.
- **`tasks`** (Beispielressource „Aufgabe“, MF4): `id` (uuid), `title` (Pflicht, 1 bis 200 Zeichen), `description` (optional), `status` (`offen` | `in_arbeit` | `erledigt`), `priority` (`niedrig` | `mittel` | `hoch`), `due_date` (optional), `created_by` → `users.id`, `created_at`, `updated_at`. Die Felder decken Text, Auswahl und Datum ab. Damit zeigt die Tabelle Sortierung (Fälligkeit, Titel), Filter (Status, Priorität, Suchtext) und Seiten.
- **`__drizzle_migrations`:** von Drizzle verwaltet.

Zod-Schemas in `src/shared/schemas/` für Login, `taskCreate`, `taskUpdate` und Listenabfrage (`page`, `pageSize`, `sort`, `status`, `priority`, `q`). Server und Formulare nutzen dieselben Schemas.

Das Seed-Skript `scripts/seed.ts` legt nur synthetische Daten an: 30 Aufgaben und, falls `SEED_ADMIN_PASSWORD` bzw. `SEED_USER_PASSWORD` gesetzt sind, ein Test-Admin- und ein Test-Benutzerkonto. Ohne diese Variablen legt es keine Konten an. Es gibt keinen festen Standardzugang (MF3).

## Schnittstellen

Keine Fremdsysteme. Eigene HTTP-Schnittstelle, JSON, Fehler einheitlich als `{error, fields?}`:

- `GET /healthz`: ohne Anmeldung. 200, wenn Postgres auf `select 1` antwortet, sonst 503.
- `GET /probe`: nur als Admin. Antwortet `{ok, checks: []}`. Die Liste ist leer, weil der Starter keine Fremddienste hat. Projekte tragen dort ihre Checks ein.
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `GET /api/tasks` (serverseitig sortiert, gefiltert, seitenweise), `GET /api/tasks/:id`, `POST /api/tasks`, `PATCH /api/tasks/:id`: für `admin` und `benutzer`.
- `DELETE /api/tasks/:id`: nur `admin`, sonst 403 (AK10).

Werkzeuge der Fabrik:

- **GitHub:** Repo per SSH mit dem Agent-Key. Die Template-Markierung (`is_template`) und das Test-Repo für AK8 laufen über die GitHub-API mit dem PAT.
- **Coolify:** Staging-Anwendung, Zugang wie bei jedem Projekt.

## Sicherheit und Datenschutz

- Nur synthetische Daten, keine echten personenbezogenen Daten. Alles läuft auf Fabrik-Infrastruktur in der EU, keine Fremd-APIs, keine Tracking- oder CDN-Skripte, die Schrift ist selbst gehostet.
- Passwörter: argon2id über `Bun.password`, mindestens 12 Zeichen (zod-Regel, gilt auch für `user:create` und den ersten Admin aus der Umgebung).
- Sitzung: zufälliges Token, in der Datenbank nur als Hash. Cookie `sid` mit `HttpOnly`, `SameSite=Lax`, `Path=/` und in Produktion bzw. Staging `Secure`. Laufzeit 7 Tage, wird bei Nutzung nach der Hälfte verlängert. Beim Abmelden wird der Eintrag gelöscht.
- Staging-Schutz: Sind `BASIC_AUTH_USER` und `BASIC_AUTH_PASSWORD` gesetzt, verlangt die erste Middleware Basic Auth (Hono `basicAuth`, zeitkonstanter Vergleich) für alles außer `GET /healthz`. Ohne die Variablen ist sie aus.
- Schutz gegen gefälschte Anfragen: Hono-Middleware `csrf()` prüft bei ändernden Anfragen den `Origin` gegen `APP_URL`.
- Rechteprüfung nur im Backend über die Middleware `requireRole('admin')`. Das Frontend blendet den Löschen-Knopf für Benutzer nur zusätzlich aus.
- Erster Admin (MF3): entweder `bun run user:create --email … --name … --role admin` (fragt das Passwort ab oder liest es aus stdin) oder `ADMIN_EMAIL`/`ADMIN_PASSWORD` beim Start. Der Weg über die Umgebung greift nur, wenn noch kein Admin existiert, und gibt im Log einen Hinweis aus, die Variable danach zu entfernen.
- Keine Secrets im Repo: `.env` steht in `.gitignore`, `.env.example` enthält nur Platzhalter. Ein Unit-Test gleicht die Schlüssel des Env-Schemas mit `.env.example` in beiden Richtungen ab. Die Seed-Variablen `SEED_ADMIN_PASSWORD` und `SEED_USER_PASSWORD` gehören nicht zum Server-Schema, `scripts/seed.ts` prüft sie selbst mit einem eigenen Schema und derselben Passwortregel wie beim Anmelden (mindestens 12 Zeichen, leer gilt als nicht gesetzt, ein zu kurzes Passwort bricht vor dem Datenbankzugriff ab). In `.env.example` stehen sie als leere Platzhalter, der Abgleich führt sie als benannte Ausnahme (`SCRIPT_ONLY_KEYS`).

## Staging

Soll-Stand. Die Projektleitung richtet die Anwendung ein und trägt danach die echten Werte (Adresse, Ressourcen) hier ein. Die Schritte stehen in `docs/BETRIEB.md`, Abschnitt Coolify.

- **Adresse:** `https://starter-react-shadcn.staging.skalierungsfabrik.de` auf der Skalierungsfabrik-Staging-Umgebung (Coolify).
- **Coolify-Anwendung** aus dem GitHub-Repo mit Build-Pack Dockerfile, Port 3000, Healthcheck über das `HEALTHCHECK` im Image (`/healthz`, ohne `curl`), automatisches Deployment bei Push auf `main`.
- **Postgres** als Coolify-Datenbank-Ressource im selben Projekt, `DATABASE_URL` als Umgebungsvariable.
- **Umgebungsvariablen nach `.env.example`:** `DATABASE_URL`, `APP_URL` (die Staging-Adresse), `NODE_ENV=production` und `PORT=3000` (setzt das Image), beim ersten Start `ADMIN_EMAIL`/`ADMIN_PASSWORD`, danach entfernen. Immer `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD`: Die App verlangt dann vor allem außer `GET /healthz` Basic Auth, weil Staging nicht öffentlich sein soll und Coolify bei Docker-Compose-Apps keine Basic Auth am Proxy setzt.
- **Daten:** einmal `bun run seed` über das Terminal der Anwendung in Coolify, nur synthetische Daten.
- **Kein Backup nötig:** Der Stand lässt sich jederzeit per Seed neu aufbauen.
- **Probe:** nach jedem Deploy `/probe`. Im Starter ist die Liste leer und das Ergebnis immer ok.
- **AK9** wird hier nachgewiesen.

## Produktion

Keine Produktion (Briefing, Betrieb). Kundenprojekte aus der Vorlage legen Server, Betrieb und Backup in ihrer eigenen Architektur fest.

Das Image ist dafür vorbereitet:

- mehrstufiger Build auf `oven/bun` (slim)
- läuft ohne Root-Rechte
- Migrationen beim Start
- `/healthz` für Coolify oder Caddy

Auf einer Coolify-Instanz des Kunden und mit Docker Compose plus Caddy läuft es gleich. `docs/BETRIEB.md` beschreibt beide Wege, die lokale Entwicklung und die Grenzen (eine Instanz, keine Drosselung der Anmeldung, kein Backup).

Pflege (aus F3): `.github/dependabot.yml` bündelt die Updates einmal im Monat in je einen Pull Request für `bun` (`package.json`, `bun.lock`), `github-actions` und `docker`. Der Ops-Layer pflegt den Starter damit, verantwortlich ist Yuri. Bereits erzeugte Projekte übernehmen Updates des Starters nicht automatisch.

## Meilensteine

### Meilenstein 1: Lauffähiger Durchstich lokal und in CI

**Ziel:** Frisch geklont startet die App mit einem Befehl. Ein Admin meldet sich an und verwaltet Aufgaben in einer Tabelle mit Formularen. Ein Benutzer darf nicht löschen, und die CI belegt das mit Lint, Typecheck, Unit-Tests und Playwright.

**Muss-Funktionen:** MF1, MF2, MF3, MF4, MF6.

**Umfang:**

- Repo-Grundlage: `package.json`, tsconfig, Biome, `bunfig.toml` (Unit-Tests nur unter `src/`), `.gitignore`.
- `compose.yaml` mit Postgres für lokal, `.env.example`, Befehl `bun run dev`. Technisch nötig, abgenommen wird MF5 in Meilenstein 2.
- Frontend-Gerüst: Tailwind 4, shadcn/ui, `tokens.css` als einzige Stelle für Farben, Schrift, Radien und Abstände (`--spacing`), TanStack Router und Query, Anmeldeseite, geschützte Startseite.
- Backend-Gerüst: Hono, Drizzle, Migrationen beim Start, gemeinsame zod-Schemas, einheitliches Fehlerformat, Auslieferung des gebauten Clients, `/healthz` (technisch nötig für Playwright).
- Anmeldung: Tabellen `users`/`sessions`, Login, Logout, `me`, Cookie, Rollen-Middleware, CSRF-Schutz.
- Erster Admin über `user:create` und Umgebungsvariablen.
- Aufgaben-API mit Rechteprüfung.
- Aufgaben-Liste mit TanStack Table: Sortierung, Filter, Seiten, serverseitig.
- Formulare zum Anlegen und Bearbeiten (react-hook-form mit zod), Löschen mit Bestätigungsdialog.
- Seed-Skript.
- `check:tokens`: Skript, das Farbwerte und Tailwind-Farbklassen außerhalb von `tokens.css` findet.
- CI-Workflow (Push, Pull Request, `workflow_dispatch`): Biome, Typecheck, `bun test`, Playwright gegen die gebaute App mit Postgres-Service.
- Erste Fassung von `CLAUDE.md` als Arbeitsgrundlage. Abgenommen wird MF7 in Meilenstein 2.

**Abnahmekriterien:**

- AK1: Frisch geklont: nach bun install startet ein Befehl Oberfläche und API lokal gegen Postgres aus compose.yaml.
- AK3: CI ist grün: Lint, Typecheck, Unit-Tests, Playwright.
- AK4: Playwright belegt als Admin: Eintrag anlegen, in der Liste finden, bearbeiten, löschen.
- AK5: Playwright belegt: Anmeldung als Admin funktioniert, ein Benutzer ohne Admin-Rolle darf nicht löschen.
- AK6: Austausch der Token-Datei ändert Farben und Schrift überall, ohne eine Komponente anzufassen (Test oder Prüfschritt). Umsetzung: Ein Playwright-Test lädt die Seite, liest die berechnete Primärfarbe und die Schrift, bindet die Alternativ-Datei `e2e/fixtures/tokens-alt.css` ein und prüft, dass sich beide Werte ändern.
- AE1: `bun run lint` schlägt fehl, sobald außerhalb von `src/client/styles/tokens.css` ein Farbwert (hex, rgb, hsl, oklch) oder eine Tailwind-Farbklasse wie `bg-slate-500` steht. In CI ist das grün.
- AE2: Playwright prüft mit 30 Seed-Aufgaben: Sortierung nach Fälligkeit, Filter nach Status und Wechsel auf Seite 2 zeigen jeweils die erwarteten Einträge.
- AE3: Eine Aufgabe ohne Titel wird von der API mit 400 und Feldfehler abgelehnt, das Formular zeigt denselben Fehler am Feld (gemeinsames zod-Schema, Playwright und Unit-Test).
- AK10: Bei leerer Datenbank existiert kein Benutzer, bis der erste Admin per Befehl oder Umgebungsvariable angelegt ist; ein Lösch-Aufruf direkt an die API mit Nicht-Admin-Konto wird mit 403 abgelehnt.

**Tickets:** 4 klein, 8 mittel, 0 groß.

**Stand:** umgesetzt (Tickets 1 bis 7).

### Meilenstein 2: Betrieb, Doku und Template

**Ziel:** Ein Image läuft lokal per `docker compose up` und auf Coolify-Staging. Die Doku beschreibt den echten Stand, und das Repo ist als Template markiert. Ein daraus erzeugtes Repo ist sofort grün.

**Muss-Funktionen:** MF5, MF7, MF8.

**Umfang:**

- Dockerfile (mehrstufig, ohne Root-Rechte, ein Image für API und Oberfläche), `compose.yaml` mit App und Postgres.
- CI-Job: Image bauen, `docker compose up`, `/healthz` abfragen.
- Unit-Test: Env-Schema gegen `.env.example` abgleichen.
- `/probe` als Gerüst.
- Coolify-Staging einrichten und seeden.
- `docs/ARCHITEKTUR.md` als Gerüst mit den zwölf Abschnitten der SOP `architektur`, `docs/BETRIEB.md` (Coolify, Compose plus Caddy, lokal), `docs/ENTSCHEIDUNGEN.md` leer.
- `CLAUDE.md` auf den Endstand bringen.
- Dependabot-Konfiguration (aus F3).
- Template-Markierung über die GitHub-API, Test-Repo per „Use this template“ erzeugen und CI dort laufen lassen.
- Kann-Funktionen, in dieser Reihenfolge, bei knappem Budget fällt die Seitenleiste zuerst weg (aus F4):
  - Seitenleiste nach `sidebar-07` als App-Hülle (umgesetzt, `src/client/routes/_auth.tsx`, `src/client/components/app-sidebar.tsx`, `src/client/components/ui/sidebar.tsx`).
  - Dunkles Farbschema über den `.dark`-Block in `tokens.css` mit Umschalter (umgesetzt, `src/client/lib/theme.ts`, `src/client/components/theme-toggle.tsx`).
  - Hintergrundjob, der täglich abgelaufene Sitzungen löscht (umgesetzt, `src/server/auth/cleanup.ts`).

**Abnahmekriterien:**

- AK2: docker compose up startet App und Datenbank, /healthz antwortet mit 200, Migrationen laufen beim Start.
- AK9: Image läuft auf Coolify-Staging ohne Code-Änderung nur mit Umgebungsvariablen nach .env.example; /healthz unter der Staging-Adresse antwortet mit 200, Anmeldung funktioniert.
- AK7: CLAUDE.md und die drei Doku-Dateien sind vorhanden und beschreiben den tatsächlichen Stand.
- AK8: Repo ist auf GitHub als Template markiert; ein mit „Use this template“ erzeugtes Test-Repo läuft ohne Änderung grün durch die CI.
- AE4: Der CI-Job „docker“ baut das Image, startet `docker compose up` und erhält von `/healthz` innerhalb von 60 Sekunden 200.
- AE5: Ein Unit-Test schlägt fehl, wenn das Env-Schema eine Variable liest, die nicht in `.env.example` steht.
- AE6: `/probe` antwortet als Admin mit `{ok: true, checks: []}` und ohne Anmeldung mit 401 (Playwright).

**Tickets:** 6 klein, 3 mittel, 0 groß.

**Stand:** Im Repo vorhanden sind Dockerfile, `compose.yaml` mit App und Postgres, CI-Job `docker`, Env-Abgleich mit `.env.example`, `/probe`, `docs/BETRIEB.md`, Dependabot und die Doku auf Endstand. Offen bei der Projektleitung: Coolify-Staging einrichten und seeden, Template-Markierung, Test-Repo für AK8. Alle drei Kann-Funktionen sind umgesetzt: Hintergrundjob, dunkles Farbschema und Seitenleiste als App-Hülle.

## Risiken

1. Die genauen Werte aus dem Skalierungsfabrik-Designsystem (Navy, Radien) sind für Agents evtl. nicht lesbar (F5). Gegenmaßnahme: Dev setzt neutrale shadcn-Werte plus ein als Platzhalter markiertes Navy in `tokens.css`, Yuri prüft auf Staging. Austausch betrifft nur diese Datei.
2. `bun test` sammelt auch Playwright-Dateien ein. Gegenmaßnahme: `bunfig.toml` beschränkt Unit-Tests auf `src/`, Playwright liegt in `e2e/`.
3. Einige shadcn-Komponenten bringen feste Farben mit (z. B. Overlay `bg-black/50`) und würden AK6 brechen. Gegenmaßnahme: `check:tokens` in Lint, solche Stellen auf Tokens wie `--overlay` umstellen.
4. In aus dem Template erzeugten Repos startet die CI beim ersten Commit evtl. nicht von selbst. Gegenmaßnahme: Der Workflow startet bei Push, Pull Request und `workflow_dispatch` und braucht keine Geheimnisse. Für AK8 wird er notfalls von Hand gestartet. Workflow, Compose und Dockerfile enthalten keinen Repo-Namen (`src/server/docs.test.ts` prüft das).
5. `ADMIN_PASSWORD` bleibt nach dem ersten Start in der Coolify-Umgebung stehen. Gegenmaßnahme: Wird nur genutzt, wenn kein Admin existiert, Log-Hinweis, `docs/BETRIEB.md` sagt „nach dem ersten Start entfernen“.
6. Die Anmeldung hat keine Drosselung bei Fehlversuchen, Staging ist öffentlich erreichbar. Gegenmaßnahme: argon2id und mindestens 12 Zeichen. Nur synthetische Daten. In `docs/BETRIEB.md` unter Grenzen als Punkt für öffentlich erreichbare Kundenprojekte vermerkt.
7. Junge Hauptversionen (Vite 8, Tailwind 4, zod 4, shadcn-CLI) ändern sich schnell. Gegenmaßnahme: Lockfile, gepinnte Bun-Version, monatliche gebündelte Dependabot-Updates (`.github/dependabot.yml`), die durch die CI laufen.
8. Erzeugte Projekte bekommen Starter-Updates nicht (F3). Gegenmaßnahme: Der Starter setzt Versions-Tags, Projekte können Korrekturen gezielt nachziehen.
9. Meilenstein 1 liegt mit 12 Tickets an der Obergrenze. Gegenmaßnahme: Die Kann-Funktionen liegen alle in Meilenstein 2. Wird Meilenstein 1 teurer, entfallen sie in der Reihenfolge Seitenleiste, Hintergrundjob, dunkles Schema.
10. Migrationen beim Start sind bei mehreren Instanzen gleichzeitig unsicher. Gegenmaßnahme: Der Starter läuft mit einer Instanz, `docs/BETRIEB.md` nennt das unter Grenzen.

## Offene Punkte

Alle Intake-Fragen F1 bis F5 sind über die G1-Freigabe („Überall Vorschläge übernehmen“) entschieden.

[OFFEN A1: Vorschlag Budget gilt als 120 € statt 60 €, weil die G1-Notiz „Budget for Double“ sagt; Kann-Funktionen werden damit in Meilenstein 2 eingeplant]

[OFFEN A2: Vorschlag Test-Repo für AK8 heißt `yurka-alexx/starter-react-shadcn-check`, ist privat und wird nach der Abnahme von Yuri gelöscht, Agents löschen keine Repos]

## Entscheidungen

- **Stack:** Standard-Stack aus `starter.md` (React, Tailwind 4, shadcn/ui, Hono auf Bun, Postgres). Verworfen: Node statt Bun, weil das Briefing Bun und `bun test` verlangt.
- **Datenbankzugriff:** Drizzle ORM mit `drizzle-kit`. Verworfen: Kysely (Migrationen von Hand), Prisma (schwere Engine im Container).
- **Anmeldung:** eigene Sitzungen mit `Bun.password`. Verworfen: Better Auth (eigenes Tabellenschema, weit mehr Funktionen als nötig), Lucia (nicht mehr als Bibliothek gepflegt).
- **Router:** TanStack Router. Verworfen: React Router, weil TanStack Router typisiert zu Query und Table passt und die Vorlage `shadcn-admin` ihn nutzt.
- **Repo-Aufbau:** ein Paket. Verworfen: Workspaces mit Turbo wie in `bhvr`, weil das mehr Konfiguration und mehrere Befehlssätze bringt.
- **Tabelle:** serverseitig sortiert, gefiltert und seitenweise. Verworfen: im Browser, weil Kundenprojekte mit echten Datenmengen das Muster sonst umbauen müssten.
- **Staging:** Dockerfile-Build-Pack plus Coolify-Postgres. Verworfen: `compose.yaml` auf Coolify, weil AK9 das Image allein mit Umgebungsvariablen prüft und Coolify die Datenbank getrennt verwaltet. `compose.yaml` bleibt für lokal.
- **Beispielressource:** „Aufgabe“ (`tasks`). Verworfen: Kontakte, weil sie nach personenbezogenen Daten aussehen.
- **Rechte:** Benutzer dürfen lesen, anlegen und bearbeiten, nur Löschen ist Admin vorbehalten. Verworfen: Nur-Lese-Benutzer, weil das Briefing nur das Löschen einschränkt.
- **Repo-Ort:** eigenes Repo `yurka-alexx/starter-react-shadcn` (aus F1). Verworfen: Ordner im `ops-projekt-template`.
- **Abnahmekriterien:** AK8 bis AK10 übernommen (aus F2).
- **Pflege:** Ops-Layer mit Dependabot, Yuri verantwortlich (aus F3). Ökosystem `bun` für `package.json` und `bun.lock`. Verworfen: `npm`, weil das Repo kein `package-lock.json` hat und Dependabot `bun.lock` direkt pflegt.
- **Seitenleiste:** Kann-Funktion in Meilenstein 2, fällt bei knappem Budget zuerst weg (aus F4).
- **Token-Werte:** Dev übernimmt sie aus dem Designsystem, Yuri prüft auf Staging (aus F5).
