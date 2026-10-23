# Betrieb

Wie die App lokal, mit Docker Compose, auf Coolify und auf einem eigenen Server mit Caddy läuft. Es gibt ein Image für API und Oberfläche (`Dockerfile`), konfiguriert wird nur über Umgebungsvariablen nach `.env.example`.

Umgebungsvariablen des Servers (Schema in `src/server/env.ts`, bricht beim Start mit klarer Meldung ab, wenn etwas fehlt oder ungültig ist):

| Variable | Pflicht | Bedeutung |
| --- | --- | --- |
| `DATABASE_URL` | ja | Postgres-URL, `postgres://benutzer:passwort@host:5432/datenbank` |
| `APP_URL` | ja | Adresse, unter der die App im Browser erreichbar ist (z. B. `https://app.example.de`). Ändernde Anfragen mit anderem `Origin` lehnt der Server ab (CSRF), Schema (`https`), Host und Port müssen also genau stimmen |
| `NODE_ENV` | nein | `development`, `test` oder `production`. Das Image setzt `production` (Sitzungs-Cookie mit `Secure`, also nur über HTTPS) |
| `PORT` | nein | Port des Servers, Standard 3000, im Image fest 3000 |
| `ADMIN_EMAIL` | nein | erster Admin beim Start, nur zusammen mit `ADMIN_PASSWORD` und nur, solange es keinen Admin gibt |
| `ADMIN_PASSWORD` | nein | Passwort dazu, mindestens 12 Zeichen. Nach dem ersten Start entfernen |
| `BASIC_AUTH_USER` | nein | Staging-Schutz: Sind `BASIC_AUTH_USER` und `BASIC_AUTH_PASSWORD` gesetzt, verlangt jede Anfrage Basic Auth (der Browser fragt nach Benutzername und Passwort), außer `GET /healthz`. Staging setzt beide. Lokal, in Tests und in der Produktion beim Kunden bleiben sie leer, dann ist der Schutz aus. Nur eine der beiden gesetzt bricht den Start ab. Ohne Doppelpunkt |
| `BASIC_AUTH_PASSWORD` | nein | Passwort dazu |

Nur für `bun run seed` (nicht für den Server): `SEED_ADMIN_PASSWORD` und `SEED_USER_PASSWORD` legen die Test-Konten `seed-admin@example.test` und `seed-benutzer@example.test` an (je mindestens 12 Zeichen, ohne sie keine Konten).

## Lokal entwickeln

Voraussetzungen: Bun (Version wie `packageManager` in `package.json`) und Docker für Postgres.

```sh
bun install
bun run dev
```

`bun run dev` legt `.env` aus `.env.example` an, falls sie fehlt, startet Postgres aus `compose.yaml` (nur den Dienst `db`), wartet, bis die Datenbank bereit ist, und startet dann die API mit Neuladen auf Port 3000 und Vite auf http://localhost:5173 (leitet `/api` an Port 3000 weiter). Die Migrationen laufen beim Start der API.

Ersten Admin in einem zweiten Terminal anlegen, Passwort wird verdeckt abgefragt:

```sh
bun run user:create --email admin@example.com --name "Vorname Nachname" --role admin
bun run seed   # 30 Beispiel-Aufgaben
```

Geklappt hat es, wenn http://localhost:5173 die Anmeldeseite zeigt und die Anmeldung mit diesem Admin auf „Hallo <Name>“ führt. Strg+C beendet API und Vite, Postgres läuft weiter (`docker compose stop db`).

## Lokal mit Docker Compose

Das gleiche Image wie auf dem Server, zusammen mit Postgres:

```sh
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='mindestens-12-Zeichen' docker compose up --build
```

- Port 3000 muss frei sein, also `bun run dev` vorher beenden.
- `compose.yaml` setzt `DATABASE_URL` (auf den Dienst `db`) fest. `APP_URL` kommt ohne Standardwert aus der Umgebung des Rechners oder der lokalen `.env` (Docker Compose liest sie selbst, `bun run dev` legt sie an, sonst `cp .env.example .env`). Fehlt er, bricht der Dienst `app` mit `APP_URL: fehlt` ab. Optional ebenso: `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SEED_ADMIN_PASSWORD` und `SEED_USER_PASSWORD`.
- Geklappt hat es, wenn http://localhost:3000/healthz `{"status":"ok"}` liefert und `docker compose ps` beim Dienst `app` `healthy` zeigt.
- Beispieldaten: `docker compose exec app bun run seed`. Benutzer: `docker compose exec app bun run user:create --email … --name … --role admin`.
- Das Image setzt `NODE_ENV=production`, das Cookie ist `Secure`. Chrome und Firefox nehmen es über `http://localhost` an, Safari je nach Version nicht (Anmeldung scheitert ohne Meldung). Nicht in jedem Browser geprüft.
- Alles samt Datenbank löschen: `docker compose down -v`.

## Coolify

So läuft das Image auf Coolify nur mit Umgebungsvariablen, ohne Änderung am Code. Die Namen der Knöpfe und Felder sind die aus Coolify v4, in anderen Versionen können sie leicht abweichen.

1. **Datenbank anlegen:** Im Projekt und in der Umgebung (z. B. `staging`) über „+ New“ eine Datenbank „PostgreSQL“ anlegen und starten. Aus deren Einstellungen die interne Postgres-URL kopieren (beginnt mit `postgres://`, Host ist der interne Name der Datenbank).
2. **Anwendung anlegen:** „+ New“, dann das GitHub-Repo wählen (über die GitHub App von Coolify, damit Pushes ankommen), Branch `main`.
3. **Build-Pack:** „Dockerfile“ (nicht „Nixpacks“ und nicht „Docker Compose“, `compose.yaml` ist nur für lokal). Pfad zum Dockerfile: `/Dockerfile`.
4. **Port:** Bei „Ports Exposes“ `3000` eintragen. Bei „Domains“ die Adresse der App mit `https://` eintragen, Coolify holt das Zertifikat.
5. **Healthcheck:** Das Image bringt ein eigenes `HEALTHCHECK` mit, das `/healthz` mit Bun abfragt (200, wenn Postgres antwortet). Im Image gibt es weder `curl` noch `wget`. Im Reiter „Healthcheck“ der Anwendung prüfen, dass der Healthcheck von Coolify ausgeschaltet ist oder nicht `curl`/`wget` im Container voraussetzt, sonst meldet Coolify die App als ungesund und schaltet sie nicht frei. Dann gilt das `HEALTHCHECK` aus dem Image.
6. **Umgebungsvariablen** (Reiter „Environment Variables“), Namen wie in `.env.example`:
   - `DATABASE_URL`: die interne Postgres-URL aus Schritt 1
   - `APP_URL`: genau die Adresse aus Schritt 4, z. B. `https://app.staging.example.de`, mit `https`
   - `NODE_ENV=production` und `PORT=3000` setzt das Image schon, sie müssen nicht eingetragen werden
   - `ADMIN_EMAIL` und `ADMIN_PASSWORD` (mindestens 12 Zeichen) nur für den ersten Start, siehe Schritt 8
   - `BASIC_AUTH_USER` und `BASIC_AUTH_PASSWORD` auf Staging immer setzen (Staging ist nicht öffentlich). Die App verlangt dann selbst Basic Auth, weil Coolify das bei Docker-Compose-Apps nicht am Proxy macht. `/healthz` bleibt für den Healthcheck offen
7. **Auto-Deploy:** In den erweiterten Einstellungen („Advanced“) „Auto Deploy“ einschalten. Jeder Push auf `main` baut und startet die App neu. Die Migrationen laufen bei jedem Start, bevor der Port öffnet.
8. **Erster Admin:** „Deploy“ klicken. Beim ersten Start legt der Server den Admin aus `ADMIN_EMAIL`/`ADMIN_PASSWORD` an, im Log steht ein Hinweis. **Nach dem ersten Start beide Variablen entfernen** und neu starten. Sie greifen zwar nur, solange es keinen Admin gibt, das Passwort soll aber nicht dauerhaft in Coolify stehen. Alternative ohne Variablen: im Terminal der Anwendung `bun run user:create --email … --name … --role admin`.
9. **Seed:** Im Reiter „Terminal“ der Anwendung den Container `app` wählen und ausführen:
   ```sh
   bun run seed
   ```
   Das legt 30 synthetische Aufgaben an bzw. setzt sie zurück. Test-Konten nur mit `SEED_ADMIN_PASSWORD=… SEED_USER_PASSWORD=… bun run seed`. Nur synthetische Daten einspielen.
10. **Prüfen nach jedem Deploy:**
    - `https://<Adresse>/healthz` liefert `{"status":"ok"}`, ohne nach einem Passwort zu fragen.
    - `https://<Adresse>` im Browser öffnen: Der Browser fragt nach Benutzername und Passwort. Mit `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` erscheint die Anmeldeseite der App, mit „Abbrechen“ nur `{"error":"Zugang nur mit Basic Auth"}`.
    - Im Browser als Admin anmelden, dann `https://<Adresse>/probe` öffnen. Geklappt hat es, wenn `{"ok":true,"checks":[]}` erscheint (im Starter ist die Liste leer, ein Projekt mit Fremddiensten trägt dort seine Checks ein, `"ok":false` heißt dann, ein Dienst antwortet nicht). Ohne Anmeldung kommt 401.

Läuft die App nicht an, steht der Grund im Log der Anwendung („Logs“). Typisch: `Ungültige Umgebungsvariablen` mit der fehlenden Variable, oder die Datenbank ist von der App aus nicht erreichbar (falsche URL, Datenbank in einer anderen Umgebung).

## Compose plus Caddy für Kundenprojekte

Für einen eigenen Server ohne Coolify: Docker Compose mit App, Postgres und Caddy als Reverse Proxy mit automatischem HTTPS. Die `compose.yaml` im Repo ist für lokal (festes Datenbankpasswort, `APP_URL` auf localhost) und wird dafür nicht genutzt. Auf dem Server liegen zwei eigene Dateien neben dem Repo-Checkout, die Werte kommen aus einer `.env` auf dem Server (nicht im Repo).

Beispiel `compose.server.yaml` (Name frei wählbar, Start mit `docker compose -f compose.server.yaml up -d --build`):

```yaml
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: app
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h localhost -U app -d app"]
      interval: 2s
      timeout: 5s
      retries: 30
    restart: unless-stopped

  app:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://app:${POSTGRES_PASSWORD}@db:5432/app
      APP_URL: https://app.example.de
      ADMIN_EMAIL: ${ADMIN_EMAIL:-}
      ADMIN_PASSWORD: ${ADMIN_PASSWORD:-}
    restart: unless-stopped

  caddy:
    image: caddy:2
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on:
      - app
    restart: unless-stopped

volumes:
  db-data:
  caddy-data:
```

Beispiel `Caddyfile` (die Domain muss per DNS auf den Server zeigen, Caddy holt das Zertifikat selbst):

```
app.example.de {
	encode zstd gzip
	reverse_proxy app:3000 {
		health_uri /healthz
	}
}
```

- `APP_URL` und die Domain im `Caddyfile` müssen übereinstimmen.
- Weder `app` noch `db` veröffentlichen Ports, erreichbar ist nur Caddy auf 80 und 443.
- Erster Admin und Seed wie bei Coolify: `ADMIN_EMAIL`/`ADMIN_PASSWORD` in der Server-`.env` für den ersten Start und danach entfernen, oder `docker compose -f compose.server.yaml exec app bun run user:create …`. Seed: `docker compose -f compose.server.yaml exec app bun run seed`.
- Update: `git pull`, dann `docker compose -f compose.server.yaml up -d --build`. Die Migrationen laufen beim Start.
- Backup der Datenbank legt das Kundenprojekt selbst fest (siehe Grenzen).

## Grenzen

- **Nur eine Instanz.** Die Migrationen laufen beim Start, bevor der Port öffnet. Starten zwei Instanzen gleichzeitig, können sie sich dabei in die Quere kommen. Wer skalieren will, spielt die Migrationen vorher in einem eigenen Schritt ein (`bun run db:migrate`) und passt den Start an. Auch der tägliche Aufräum-Job der Sitzungen (nächster Punkt) ist nur für eine Instanz gedacht, bei mehreren liefe er in jeder.
- **Abgelaufene Sitzungen löscht ein Zeitplan im Server-Prozess**, kein Worker und kein Cron auf dem Server nötig. Das Paket `croner` startet nach dem Öffnen des Ports einen Job, der täglich um 3 Uhr in der Zeitzone des Servers (im Image UTC) alle Zeilen aus `sessions` mit abgelaufenem `expires_at` löscht. Im Log steht danach `Sitzungen aufgeräumt: <Zahl> abgelaufene gelöscht.`, bei einem Fehler `Aufräumen der Sitzungen fehlgeschlagen, …`, der Server läuft dann weiter und versucht es am nächsten Tag wieder. Beim Start läuft der Job nicht, eine Umgebungsvariable gibt es dafür nicht. Läuft die App um 3 Uhr nicht, fällt der Lauf aus, abgelaufene Sitzungen bleiben dann bis zum nächsten Lauf liegen (sie gelten trotzdem nicht mehr).
- **Basic Auth ist nur ein Zaun für Staging.** Sie ersetzt nicht die Anmeldung der App, hat keine Drosselung bei Fehlversuchen und schickt das Passwort bei jeder Anfrage mit, also nur über HTTPS nutzen. Der Browser merkt sich die Zugangsdaten bis zum Schließen, „Abmelden“ in der App beendet nur die Sitzung der App.
- **Keine Drosselung bei Fehlversuchen der Anmeldung.** Schutz sind argon2id und mindestens 12 Zeichen. Für öffentlich erreichbare Projekte mit echten Daten eine Drosselung ergänzen (z. B. je IP und E-Mail in der Login-Route oder im Reverse Proxy).
- **Kein Backup beim Starter.** Staging enthält nur synthetische Daten, die `bun run seed` jederzeit neu aufbaut. Kundenprojekte mit echten Daten richten ein Backup der Datenbank ein (z. B. die geplanten Backups der Coolify-Datenbank oder `pg_dump` per Zeitplan).
