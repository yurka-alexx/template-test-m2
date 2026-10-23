# Briefing: Starter react-shadcn (Skalierungsfabrik (intern))

## Ziel

Ein GitHub-Template-Repo mit dem Standard-Stack der Fabrik, lauffähig und getestet. Ein neues Kundenprojekt startet mit „Repo aus Vorlage anlegen“ (bei GitHub der Knopf „Use this template“). Gerüst, CI, Docker, Anmeldung und Backoffice-Grundlagen werden dann nicht jedes Mal neu gebaut.

Erfolg misst die Fabrik daran:
- Die ersten zwei bis drei Tickets jedes Projekts fallen weg.
- Jedes Projekt hat dieselbe Struktur, dieselben Befehle und dieselbe CI.
- Die Agents finden sich sofort zurecht.

Als erstes Kundenprojekt danach ist voraussichtlich MMCompact OS geplant (MMCompact GmbH). Es gehört nicht zum Umfang dieses Briefings.

## Nutzer

- Die Agents der Fabrik (Dev, Critic, Abnahme) und Yuri Bilogor.
- Später Freelancer in den Dev-Teams.
- Endkunden sehen nur, was aus der Vorlage gebaut wird, nicht den Starter selbst.

Vorkenntnisse: TypeScript und React. Der Kreis ist klein und intern, es gibt keine Lastanforderungen.

## Muss-Funktionen

- **MF1 Frontend:** Vite, React, TypeScript, Tailwind CSS 4, shadcn/ui eingerichtet, Lucide-Icons, Router, Datenabruf mit TanStack Query. Alle Farben, Schriften, Radien und Abstände sind Design-Tokens an einer einzigen Stelle (CSS-Variablen). So lässt sich das Designsystem eines Kunden durch Austausch dieser Datei übernehmen.
- **MF2 Backend:** Hono auf Bun, Postgres mit typisierten Abfragen und versionierten Migrationen, die beim Start laufen. Gemeinsame zod-Schemas für Frontend und Backend.
- **MF3 Anmeldung:** Benutzer mit Passwort (gehasht), Sitzung per Cookie, Rollen `admin` und `benutzer`, Rechteprüfung im Backend. Der erste Admin wird per Befehl oder Umgebungsvariable angelegt, es gibt keinen festen Standardzugang.
- **MF4 Backoffice-Beispiel:** eine Ressource mit Liste (TanStack Table mit Sortierung, Filter, Seiten), Anlegen und Bearbeiten (react-hook-form mit zod) und Löschen mit Bestätigung. Sie dient als Muster, das Projekte kopieren oder entfernen.
- **MF5 Betrieb:** ein Docker-Image für API und Oberfläche, `compose.yaml` mit App und Postgres, Healthcheck `/healthz`, `.env.example`, keine Secrets im Repo. Läuft unverändert auf Coolify.
- **MF6 Qualität:** Lint und Format (Biome), Typecheck, Unit-Tests mit `bun test`, Playwright-Tests gegen die laufende App mit Postgres, alles in GitHub Actions. Dazu ein Seed-Skript mit synthetischen Daten.
- **MF7 Doku für Agents und Menschen:**
  - `CLAUDE.md` mit den Befehlen für Start, Test und Lint sowie den Regeln der Struktur.
  - `docs/ARCHITEKTUR.md` als Gerüst in der Gliederung, die die SOP `architektur` erwartet.
  - `docs/BETRIEB.md` für Coolify und lokale Entwicklung.
  - `docs/ENTSCHEIDUNGEN.md` als leerer Platzhalter (schreibt der Ops-Layer).
- **MF8 Template:** Das Repo ist auf GitHub als Template-Repository markiert.

## Kann-Funktionen

Alle drei Punkte sind optional:
- Dunkles Farbschema über dieselben Tokens.
- Leere Startseite mit Navigation (Seitenleiste) nach dem Muster der shadcn-Blocks, damit Projekte eine fertige Hülle haben.
- Beispiel für einen zeitgesteuerten Hintergrundjob im Backend.

[OFFEN F4: Vorschlag Seitenleiste bleibt Kann-Funktion, wird in Meilenstein 2 mitgebaut und fällt bei knappem Budget als Erstes weg]

## Nicht-Ziele

- Kein Next.js, kein Server-Side-Rendering, keine Mehrmandantenfähigkeit.
- Keine Zahlungen, kein E-Mail-Versand, keine Anbindung an Fremdsysteme.
- Kein PHP-Starter (Laravel und Filament kommen später als eigener Starter).
- Keine Marketing-Website.

## Daten

- Nur synthetische Beispieldaten aus dem Seed-Skript.
- In Postgres liegen Benutzer (mit gehashtem Passwort) und die Beispielressource.
- Kleines Volumen, keine echten personenbezogenen Daten und keine Geschäftsgeheimnisse.

## Schnittstellen

Keine Fremdsysteme. Angebunden sind nur die Standardwerkzeuge der Fabrik:
- GitHub: Template-Markierung und Actions, Zugang per SSH mit dem Agent-Key.
- Coolify: Staging-Deployment, Zugang wie bei jedem Projekt.

## Betrieb

- Staging auf der Skalierungsfabrik-Staging-Umgebung (Coolify) als lauffähige Demo des Starters.
- Keine Produktion.
- Lokale Entwicklung über `compose.yaml`.

[OFFEN F1: Vorschlag eigenes Repo `yurka-alexx/starter-react-shadcn` als Template, weil „Repo aus Vorlage anlegen“ bei GitHub nur ganze Repos kopiert]

[OFFEN F3: Vorschlag Ops-Layer pflegt den Starter (Abhängigkeits-Updates), Yuri ist Verantwortlicher, bereits erzeugte Projekte übernehmen Updates nicht automatisch]

## Abnahmekriterien

- **AK1 (MF2):** Frisch geklont: Nach `bun install` startet ein einziger Befehl Oberfläche und API lokal gegen Postgres aus `compose.yaml`.
- **AK2 (MF5):** `docker compose up` startet App und Datenbank, `/healthz` antwortet mit 200, die Migrationen laufen beim Start.
- **AK3 (MF6):** CI ist grün: Lint, Typecheck, Unit-Tests, Playwright.
- **AK4 (MF4):** Playwright belegt als Admin: Eintrag anlegen, in der Liste finden, bearbeiten, löschen.
- **AK5 (MF3):** Playwright belegt: Anmeldung als Admin funktioniert, ein Benutzer ohne Admin-Rolle darf nicht löschen.
- **AK6 (MF1):** Ein Austausch der Token-Datei ändert Farben und Schrift überall, ohne eine Komponente anzufassen (Test oder Prüfschritt).
- **AK7 (MF7):** `CLAUDE.md` und die drei Doku-Dateien sind vorhanden und beschreiben den tatsächlichen Stand.
- **AK8 (MF8, Vorschlag):** Auf GitHub ist das Repo als Template markiert. Ein mit „Use this template“ erzeugtes Test-Repo läuft ohne Änderung grün durch die CI.
- **AK9 (MF5, Vorschlag):** Das Image läuft auf Coolify-Staging ohne Code-Änderung, nur mit Umgebungsvariablen nach `.env.example`. `/healthz` unter der Staging-Adresse antwortet mit 200, die Anmeldung funktioniert.
- **AK10 (MF3, Vorschlag):** Mit leerer Datenbank gibt es keinen Benutzer, bis der erste Admin per Befehl oder Umgebungsvariable angelegt ist. Ein Lösch-Aufruf direkt an die API mit einem Nicht-Admin-Konto wird mit 403 abgelehnt.

[OFFEN F2: Vorschlag AK8 bis AK10 so übernehmen]

## Zeit und Budget

- Keine feste Deadline, Wunsch: möglichst in derselben Woche wie der Auftrag vom 23.10.2026.
- Token-Budget: 60 €.
- Meilenstein-Vorschlag aus dem Briefing:
  1. **Gerüst:** Frontend, Backend, Postgres, Migrationen, Anmeldung mit Rollen, Docker, CI mit Lint, Typecheck und Unit-Tests, `CLAUDE.md`.
  2. **Backoffice und Abnahme:** Beispielressource mit Tabelle und Formularen, Seitenleiste (Kann, siehe F4), Playwright-Tests, Doku-Dateien, Template-Markierung, Staging.

## Design

- Neutral nach shadcn/ui.
- Akzent und Schrift aus dem Skalierungsfabrik-Designsystem als Standard-Tokens: Navy, Open Sans, Lucide-Icons.
- Kundenprojekte ersetzen die Tokens durch ihr eigenes Designsystem.

[OFFEN F5: Vorschlag Dev übernimmt die genauen Werte (Navy-Farbwert, Radien) aus dem Skalierungsfabrik-Designsystem, Yuri prüft auf Staging]

## Quellen

- `Skalierungsfabrik/Produkte/Ops-Layer/eingang/starter-react-shadcn/BRIEFING.md` (Auftrag von Yuri im Chat vom 23.10.2026)
- Kontaktdatenbanken Able & Baker und Skalierungsfabrik: MMCompact GmbH, Yuri Bilogor
- Nicht lesbar (Ordner nicht freigegeben): `Skalierungsfabrik/Produkte/Ops-Layer/starter.md`, Skalierungsfabrik-Designsystem
