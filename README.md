# starter-react-shadcn

Starter react-shadcn (Ops-Layer P-2026-0002): Vorlage mit Hono auf Bun, Postgres über Drizzle und einer Oberfläche mit React 19, Tailwind CSS 4 und shadcn/ui.

## Schnellstart

Voraussetzungen: [Bun](https://bun.sh) (Version siehe `packageManager` in `package.json`) und Docker.

```sh
bun install
bun run dev                     # Postgres, API (Port 3000) und Oberfläche (http://localhost:5173)
# zweites Terminal:
bun run user:create --email admin@example.com --name "Vorname Nachname" --role admin
bun run seed                    # 30 Beispiel-Aufgaben
```

Dann http://localhost:5173 öffnen und mit dem eben angelegten Admin anmelden. Unter „Aufgaben“ steht die Liste.

Alles prüfen wie in der CI (Postgres muss laufen, Port 3000 frei, also `bun run dev` vorher beenden):

```sh
bun run lint && bun run typecheck && bun test
bunx playwright install chromium   # einmalig
bun run test:e2e                   # braucht SEED_ADMIN_PASSWORD und SEED_USER_PASSWORD in .env
```

## Neues Projekt aus dem Template

1. Auf GitHub im Starter-Repo oben rechts „Use this template“, dann „Create a new repository“ wählen, Besitzer und Namen eintragen (z. B. `kunde-x/backoffice`), Sichtbarkeit wählen, „Create repository“.
2. Das neue Repo klonen und `bun install` ausführen.
3. Anpassen:
   - `package.json`: `name` auf den Projektnamen setzen.
   - `README.md`: Titel und Einleitung auf das Projekt umschreiben, ebenso die erste Zeile von `CLAUDE.md`.
   - `docs/ARCHITEKTUR.md` durch die eigene Architektur ersetzen. Die zwölf Abschnitte (Überblick bis Entscheidungen) bleiben, `src/server/docs.test.ts` prüft die Überschriften.
   - `docs/BETRIEB.md` gilt unverändert, solange am Betrieb nichts anders ist.
4. `docs/ENTSCHEIDUNGEN.md` leeren. Im Starter führt der Ops-Layer dort seine eigenen Notizen, die gehören nicht in dein Projekt. Ersetze den Inhalt durch dieses Gerüst:

   ```markdown
   # Entscheidungen

   ## Entscheidungen

   Noch keine Einträge.

   ## Offene Bedenken

   Noch keine Einträge.

   ## Offene Review-Befunde

   Noch keine Einträge.
   ```

   Projekte, die der Ops-Layer anlegt, überschreiben die Datei automatisch mit ihren eigenen Notizen.
5. `.env` anlegen: `cp .env.example .env` (oder einfach `bun run dev`, das legt sie an, falls sie fehlt). Die `.env` bleibt lokal und kommt nie ins Repo.
6. Die CI läuft ohne Änderung und ohne Geheimnisse bei jedem Push. Startet sie beim ersten Commit nicht von selbst: unter „Actions“ den Workflow „CI“ wählen und „Run workflow“ klicken. Geklappt hat es, wenn beide Jobs („Lint, Typecheck, Unit-Tests, Playwright“ und „Docker-Image und Compose“) einen grünen Haken haben.

Updates kommen nicht automatisch: `.github/dependabot.yml` wird mitkopiert, das neue Repo bekommt also eigene monatliche Pull Requests für seine Abhängigkeiten. Was im Starter später aktualisiert oder korrigiert wird (auch die Dependabot-Updates des Starters), kommt im neuen Projekt nicht an und muss bei Bedarf von Hand übernommen werden. Deployment auf Coolify oder einen eigenen Server: `docs/BETRIEB.md`.

## Lokal starten

```sh
bun install
bun run dev
```

`bun run dev` legt `.env` aus `.env.example` an, falls sie fehlt, startet Postgres aus `compose.yaml`, wartet, bis die Datenbank bereit ist, und startet dann zusammen:

- die Oberfläche (Vite) auf http://localhost:5173, Aufrufe an `/api` leitet Vite an die API weiter
- die API auf http://localhost:3000, beim Start werden die Migrationen aus `drizzle/` eingespielt

Beide laden bei Änderungen neu. Strg+C beendet beide, Postgres läuft weiter (`docker compose stop db`).

Prüfen, frisch geklont:

1. `bun install`, dann `bun run dev`. In der Ausgabe stehen `API läuft auf http://localhost:3000` und die Vite-Adresse `http://localhost:5173/`.
2. http://localhost:3000/healthz antwortet mit `{"status":"ok"}` (ist die Datenbank nicht erreichbar: 503).
3. In einem zweiten Terminal den ersten Admin anlegen (siehe unten, `bun run user:create …`).
4. http://localhost:5173 öffnen: Ohne Sitzung landet man auf der Anmeldeseite (`/login?redirect=%2F`).
5. Mit falschem Passwort anmelden: Über dem Formular steht „E-Mail oder Passwort falsch“. Ohne E-Mail abschicken: Die Meldung steht unter dem Feld „E-Mail“.
6. Mit den richtigen Zugangsdaten anmelden: Die Startseite zeigt „Hallo <Name>“ mit E-Mail und Rolle. Links steht die Seitenleiste mit „Start“ und „Aufgaben“, unten Name, Rolle, „Farbschema wechseln“ und „Abmelden“. „Abmelden“ führt zurück zur Anmeldeseite.
7. In einem zweiten Terminal `bun run seed` ausführen, dann in der Seitenleiste „Aufgaben“ klicken: Die Liste zeigt 10 von 30 Aufgaben, unten steht „Seite 1 von 3“. Ein Klick auf den Spaltenkopf „Fällig“ sortiert nach Fälligkeit, der Knopf „Status“ filtert, „Nächste Seite“ blättert. Die Adresszeile merkt sich alles (z. B. `/aufgaben?page=2&sort=dueDate`).
8. „Neue Aufgabe“ ohne Titel speichern: Unter dem Feld „Titel“ steht „fehlt“. Mit Titel speichern: Die Aufgabe steht oben in der Liste. „Bearbeiten“ ändert sie, „Löschen“ fragt vorher nach. Als Benutzer ohne Admin-Rolle gibt es keinen Knopf „Löschen“.

## Bauen und starten wie auf dem Server

```sh
bun run build   # Oberfläche nach dist/client
bun run start   # API und Oberfläche auf http://localhost:3000
```

`bun run start` braucht Postgres (z. B. `docker compose up -d db`) und eine `.env`. Hono liefert dann die gebaute Oberfläche aus. Jede Adresse außer `/api/*`, `/healthz` und `/probe` bekommt `index.html`, ein direkter Aufruf von http://localhost:3000/login lädt also die Anmeldeseite.

`/probe` prüft nach einem Deploy die angebundenen Fremddienste und ist nur für Admins: als Admin angemeldet http://localhost:3000/probe öffnen. Geklappt hat es, wenn `{"ok":true,"checks":[]}` erscheint. Die Liste ist leer, weil der Starter keine Fremddienste hat. Ohne Anmeldung kommt 401, als Benutzer ohne Admin-Rolle 403. Eigene Checks trägt ein Projekt in `src/server/probe.ts` ein.

Abgelaufene Sitzungen löscht der Server selbst, täglich um 3 Uhr (Zeitzone des Servers) über einen Zeitplan im selben Prozess (`croner`, `src/server/auth/cleanup.ts`). Im Log steht dann `Sitzungen aufgeräumt: <Zahl> abgelaufene gelöscht.` Gedacht ist das nur für eine Instanz, siehe `docs/BETRIEB.md`, Abschnitt „Grenzen“.

## Mit Docker (ein Image für API und Oberfläche)

Dasselbe Image läuft lokal, in der CI und auf Coolify (Einrichtung in `docs/BETRIEB.md`). Lokal mit Postgres zusammen:

```sh
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='mindestens-12-Zeichen' docker compose up --build
```

Danach antwortet http://localhost:3000/healthz mit `{"status":"ok"}`, und auf http://localhost:3000 kann man sich mit diesem Admin anmelden. Die Migrationen laufen beim Start des Containers. Beispieldaten im laufenden Container: `docker compose exec app bun run seed` (Test-Konten mit `SEED_ADMIN_PASSWORD` und `SEED_USER_PASSWORD` beim `docker compose up`). Benutzer anlegen: `docker compose exec app bun run user:create --email … --name … --role admin`. Beenden mit Strg+C, alles samt Datenbank löschen mit `docker compose down -v`.

- Port 3000 muss frei sein, also `bun run dev` vorher beenden. `bun run dev` startet weiterhin nur Postgres aus `compose.yaml`, nicht den Dienst `app`.
- `APP_URL` kommt ohne Standardwert aus der Umgebung des Rechners. Docker Compose liest dafür auch die `.env` im Projektordner (`bun run dev` legt sie an, sonst `cp .env.example .env`), dort steht `http://localhost:3000`. Ohne `APP_URL` bricht der Dienst `app` mit `APP_URL: fehlt` ab. `DATABASE_URL` setzt `compose.yaml` fest auf `db:5432`.
- `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SEED_ADMIN_PASSWORD` und `SEED_USER_PASSWORD` sind optional und kommen ebenso aus der Umgebung oder der `.env`.
- Das Image setzt `NODE_ENV=production`, das Sitzungs-Cookie ist dann `Secure`. Chrome und Firefox nehmen es auch über `http://localhost` an. Safari lehnt `Secure`-Cookies über `http://` je nach Version ab, dann scheitert die Anmeldung ohne Fehlermeldung (man bleibt auf der Anmeldeseite). Mit Safari deshalb `bun run dev` nutzen oder einen anderen Browser. Das ist nicht in jedem Browser geprüft.
- Das Image läuft als Benutzer `bun` (nicht root), startet `bun run start` auf Port 3000 und meldet seinen Zustand über `/healthz` (`docker compose ps` zeigt `healthy`).

## Staging-Schutz (Basic Auth)

Staging-Apps der Fabrik sind nicht öffentlich. Dafür setzt Staging `BASIC_AUTH_USER` und `BASIC_AUTH_PASSWORD`: Sind beide gesetzt, verlangt die App vor allem anderen Basic Auth (der Browser fragt nach Benutzername und Passwort), auch für `/api/*`, `/probe` und die Oberfläche. Nur `GET /healthz` bleibt offen, damit der Healthcheck läuft. Lokal, in Tests und in der Produktion beim Kunden bleiben beide leer, dann ist der Schutz aus. Nur eine der beiden gesetzt bricht den Start mit `… nur gemeinsam setzen` ab.

Lokal ausprobieren: `BASIC_AUTH_USER=staging BASIC_AUTH_PASSWORD=geheim bun run start`, dann http://localhost:3000 öffnen. Geklappt hat es, wenn der Browser nach Benutzername und Passwort fragt und danach die Anmeldeseite der App erscheint. Einrichtung auf Coolify: `docs/BETRIEB.md`.

## Design-Tokens

Farben, Schrift, Radien und Abstände stehen nur in `src/client/styles/tokens.css`. Komponenten nutzen ausschließlich Klassen wie `bg-primary` oder `text-muted-foreground`, die auf diese Variablen zeigen. Die Primärfarbe Navy ist ein Platzhalter, bis der Wert aus dem Designsystem feststeht. Wer die Datei austauscht, ändert das Aussehen überall, ohne eine Komponente anzufassen. Die Schrift Open Sans liegt im Paket `@fontsource-variable/open-sans` und wird mit ausgeliefert, kein Google-Fonts-CDN.

`bun run check:tokens` (läuft in `bun run lint` und in der CI mit) bricht ab, sobald außerhalb dieser Datei ein Farbwert (hex, rgb, hsl, oklch) oder eine Tailwind-Farbklasse aus der Standardpalette steht, und nennt Datei, Zeile und Spalte.

### Dunkles Farbschema

Auf der Anmeldeseite oben rechts, nach dem Anmelden unten in der Seitenleiste sitzt der Knopf „Farbschema wechseln“ (Sonne bzw. Mond). Er öffnet ein Menü mit „Hell“, „Dunkel“ und „System“. „System“ ist der Standard und folgt der Einstellung des Browsers bzw. Betriebssystems, auch wenn sie sich ändert, während die Seite offen ist. Die Wahl bleibt im Browser gespeichert (`localStorage`, Schlüssel `theme`), nicht im Benutzerkonto.

Die dunklen Farben stehen ebenfalls nur in `src/client/styles/tokens.css`, im Block `.dark` direkt unter `:root`. Er setzt dieselben Farb-Tokens noch einmal, die Primärfarbe kommt auch dort aus `--navy` (ein helleres Navy, ebenfalls Platzhalter). Eine neue Farbe gehört deshalb in beide Blöcke, ein Unit-Test prüft das. Dunkel heißt technisch: `<html>` hat die Klasse `dark`. Ein kleines Skript in `index.html` setzt sie, bevor die Seite das erste Mal gezeichnet wird, damit beim Laden nichts hell aufblitzt. Die Logik dazu steht in `src/client/lib/theme.ts`.

## App-Hülle mit Seitenleiste

Nach dem Anmelden liegt jede Seite in derselben Hülle (shadcn/ui-Block `sidebar-07`): links die Seitenleiste mit dem Menü („Start“, „Aufgaben“, der aktive Eintrag ist hinterlegt), unten Name und Rolle, „Farbschema wechseln“ und „Abmelden“. Der Knopf „Seitenleiste umschalten“ oben links (oder Strg+B bzw. Cmd+B) klappt die Leiste auf Symbole ein, ein Mauszeiger auf einem Symbol zeigt den Namen. Auf schmalen Bildschirmen (unter 768 Pixel) ist die Leiste zu, derselbe Knopf öffnet sie als Schublade über der Seite.

Menü um eine Seite erweitern:

1. Route unter `src/client/routes/_auth/` anlegen, z. B. `kunden.tsx`. Sie erscheint automatisch in der Hülle und braucht eine Anmeldung.
2. In `src/client/components/app-sidebar.tsx` in `menuItems` einen Eintrag ergänzen, z. B. `{ title: "Kunden", to: "/kunden", icon: Users, exact: false }` (Symbol aus `lucide-react`).
3. `bun run build` oder `bun run dev` erzeugt `src/client/routeTree.gen.ts` neu, danach ist der Eintrag in der Leiste.

Die Bausteine der Leiste liegen in `src/client/components/ui/sidebar.tsx`, ihre Farben in `tokens.css` (Variablen `--sidebar*`, hell und dunkel).

## Erster Admin

Bei leerer Datenbank gibt es keinen Benutzer und keinen Standardzugang. Der erste Admin entsteht auf einem von zwei Wegen:

```sh
bun run user:create --email admin@example.com --name "Vorname Nachname" --role admin
```

Das Passwort (mindestens 12 Zeichen) wird verdeckt abgefragt. Ohne Terminal liest der Befehl es aus stdin.

Oder beim Start über die Umgebung: `ADMIN_EMAIL` und `ADMIN_PASSWORD` setzen. Der Server legt den Admin nur an, wenn noch keiner existiert. Danach beide Variablen wieder entfernen.

Anmelden: `POST /api/auth/login` mit `{"email": "…", "password": "…"}`, danach `GET /api/auth/me`. Im Browser: Anmeldeseite unter `/login`.

## Beispieldaten

```sh
bun run seed
# mit Test-Konten:
SEED_ADMIN_PASSWORD=… SEED_USER_PASSWORD=… bun run seed
```

Legt 30 synthetische Aufgaben an. Mehrfaches Ausführen setzt sie auf den Ausgangsstand zurück (auch Ersteller und Anlagezeit), es entstehen keine Doppelten. Ersteller ist der Test-Admin, sobald es ihn gibt.

Test-Konten gibt es nur über zwei Umgebungsvariablen (je mindestens 12 Zeichen, beim Aufruf oder in der lokalen `.env` setzen, in `.env.example` stehen sie als leere Platzhalter):

- `SEED_ADMIN_PASSWORD`: Passwort für den Test-Admin `seed-admin@example.test` (Rolle Admin)
- `SEED_USER_PASSWORD`: Passwort für den Test-Benutzer `seed-benutzer@example.test` (Rolle Benutzer)

Ohne die Variablen (oder mit leerem Wert) legt der Seed keine Konten an, einen festen Standardzugang gibt es nicht. Ein bestehendes Konto bleibt unverändert. Die Variablen prüft nur `scripts/seed.ts`, der Server kennt sie nicht.

Aufgaben-API (nur angemeldet): `GET /api/tasks?sort=dueDate&status=offen&page=2`, `GET|PATCH|DELETE /api/tasks/:id`, `POST /api/tasks`. Löschen darf nur ein Admin. Details: `CLAUDE.md`.

## Prüfen

```sh
bun run lint      # Biome und check:tokens
bun run typecheck
bun test          # braucht Postgres (bun run dev oder docker compose up -d db), leert users, sessions und tasks
bun run build
bun run test:e2e  # Playwright, siehe unten
```

Die CI (`.github/workflows/ci.yml`) führt dieselben Schritte bei Push, Pull Request und von Hand (Knopf „Run workflow“ unter „Actions“) aus, in dieser Reihenfolge: Lint, Typecheck, Unit-Tests, Build, Playwright. Schlägt Playwright fehl, hängt am Lauf das Artefakt `playwright-report` mit HTML-Bericht und Traces (herunterladen, entpacken, `bunx playwright show-report playwright-report` bzw. `bunx playwright show-trace <datei>.zip`).

## Playwright

`bun run test:e2e` baut die Oberfläche, startet die App wie auf dem Server (`bun run start` auf `APP_URL`, Standard http://localhost:3000) und prüft sie in Chromium:

- Anmeldung als Admin, Fehlermeldung bei falschem Passwort
- als Admin eine Aufgabe anlegen, finden, bearbeiten und mit Bestätigung löschen
- als Benutzer ohne Admin-Rolle kein Knopf „Löschen“, ein Lösch-Aufruf direkt an die API bekommt 403
- Liste mit den 30 Seed-Aufgaben: Sortierung nach Fälligkeit, Filter „Erledigt“, Seite 2
- Aufgabe ohne Titel: Fehler „fehlt“ am Feld „Titel“, die API antwortet mit 400 und `fields.title`
- Austausch der Token-Datei: mit `e2e/fixtures/tokens-alt.css` ändern sich Primärfarbe und Schrift
- Farbschema: „Farbschema wechseln“, dann „Dunkel“ macht die Seite dunkel und bleibt nach dem Neuladen; ist der Browser auf dunkel gestellt, startet die Seite bei „System“ dunkel
- `/probe`: als Admin `{ok: true, checks: []}`, ohne Anmeldung 401
- Seitenleiste: „Start“ und „Aufgaben“ im Menü, der aktive Eintrag ist markiert; der Knopf „Seitenleiste umschalten“ klappt sie auf Symbole ein und wieder aus; „Abmelden“ und „Farbschema wechseln“ stehen im Fuß; bei 390 Pixel Breite ist sie zu und öffnet als Schublade

Vorbereitung, einmalig:

1. Chromium installieren: `bunx playwright install chromium` (unter Linux `--with-deps` anhängen, das installiert auch die Systembibliotheken).
2. In der lokalen `.env` die beiden Zeilen mit eigenen Passwörtern (je mindestens 12 Zeichen) ausfüllen, sie gehören nicht ins Repo. In `.env.example` stehen sie leer, in einer älteren `.env` fehlen sie eventuell und kommen dazu:
   ```sh
   SEED_ADMIN_PASSWORD=…
   SEED_USER_PASSWORD=…
   ```
3. Postgres starten (`docker compose up -d db`) und `bun run dev` beenden, damit Port 3000 frei ist.

Vor jedem Lauf spielt Playwright die Migrationen ein und ruft `bun run seed` auf: Die 30 Aufgaben stehen danach wieder auf dem Seed-Stand, Test-Admin und Test-Benutzer werden angelegt, falls es sie noch nicht gibt. Reste abgebrochener Läufe (Aufgaben, deren Titel mit „E2E“ beginnt) werden gelöscht. Eigene Aufgaben bleiben. Gibt es ein Test-Konto schon mit einem anderen Passwort, schlägt die Anmeldung fehl: dann das alte Passwort eintragen oder das Konto löschen.

Geklappt hat es, wenn am Ende `12 passed` steht. Eine einzelne Datei: `bun run test:e2e e2e/liste.spec.ts`. Ergebnisse und Traces fehlgeschlagener Tests liegen in `e2e/test-results/`.

Bei leerer Datenbank gibt es keinen Benutzer und keine Anmeldung, bis der erste Admin angelegt ist. Das prüft `bun test` (`src/server/first-admin.test.ts`) mit echtem Server auf einer frischen Datenbank, für `user:create` und für `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

Weitere Befehle und Regeln: `CLAUDE.md`. Architektur: `docs/ARCHITEKTUR.md`. Betrieb (lokal, Docker Compose, Coolify, Compose plus Caddy, Grenzen): `docs/BETRIEB.md`.
