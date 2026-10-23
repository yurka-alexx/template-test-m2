// Synthetische Beispieldaten für `bun run seed` (scripts/seed.ts). Keine echten Personen oder Firmen.
import { sql } from "drizzle-orm";
import type { TaskPriority, TaskStatus } from "../../shared/schemas/task.ts";
import type { Role } from "../../shared/schemas/user.ts";
import { createUser, EmailTakenError, findUserByEmail } from "../auth/users.ts";
import type { Db } from "./index.ts";
import { tasks } from "./schema.ts";

type SeedTask = {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Fälligkeit in Tagen ab dem Tag des Seeds, null für „keine“. */
  dueInDays: number | null;
};

// Verteilung: 13 offen, 10 in Arbeit, 7 erledigt; 26 verschiedene Fälligkeiten, 4 ohne.
// Bei 10 Einträgen pro Seite unterscheiden sich Sortierung, Statusfilter und Seite 2 deutlich.
// Erstes Wort jedes Titels nur ASCII und kein Anfang eines anderen, damit die Sortierung nach
// Titel unter jeder Datenbank-Collation (C, de_DE, en_US) gleich ausfällt.
export const seedTasks: readonly SeedTask[] = [
  { title: "Angebot für Musterfirma prüfen", status: "in_arbeit", priority: "hoch", dueInDays: 3 },
  {
    title: "Backup der Testdatenbank einspielen",
    status: "erledigt",
    priority: "mittel",
    dueInDays: -6,
  },
  {
    title: "Checkliste Onboarding überarbeiten",
    status: "offen",
    priority: "niedrig",
    dueInDays: 21,
  },
  {
    title: "Datenschutzhinweis aktualisieren",
    description: "Abschnitt zu Cookies an den aktuellen Stand anpassen.",
    status: "offen",
    priority: "hoch",
    dueInDays: 1,
  },
  {
    title: "Entwurf Newsletter Oktober schreiben",
    status: "in_arbeit",
    priority: "mittel",
    dueInDays: 8,
  },
  {
    title: "Feedback aus dem Workshop sammeln",
    status: "erledigt",
    priority: "niedrig",
    dueInDays: -12,
  },
  {
    title: "Gastzugang für das Kickoff einrichten",
    status: "erledigt",
    priority: "mittel",
    dueInDays: -3,
  },
  { title: "Handbuch Kapitel 2 korrigieren", status: "offen", priority: "mittel", dueInDays: null },
  { title: "Inventur Büromaterial", status: "offen", priority: "niedrig", dueInDays: 30 },
  {
    title: "Jahresplanung Entwurf",
    description: "Ziele, Budget und Meilensteine für das nächste Jahr grob skizzieren.",
    status: "in_arbeit",
    priority: "hoch",
    dueInDays: 14,
  },
  { title: "Kalender für Q1 abstimmen", status: "offen", priority: "mittel", dueInDays: 5 },
  { title: "Lieferantenliste bereinigen", status: "in_arbeit", priority: "niedrig", dueInDays: 11 },
  { title: "Meeting mit Testkunde vorbereiten", status: "offen", priority: "hoch", dueInDays: 0 },
  { title: "Notizen ins Wiki übertragen", status: "erledigt", priority: "niedrig", dueInDays: -1 },
  { title: "Organigramm aktualisieren", status: "offen", priority: "mittel", dueInDays: 17 },
  { title: "Quartalszahlen aufbereiten", status: "in_arbeit", priority: "hoch", dueInDays: 2 },
  { title: "Rechnungsvorlage anpassen", status: "offen", priority: "mittel", dueInDays: 9 },
  {
    title: "Serverkosten vergleichen",
    description: "Drei Angebote für das Testsystem gegenüberstellen.",
    status: "in_arbeit",
    priority: "mittel",
    dueInDays: null,
  },
  { title: "Teamtermin Dezember planen", status: "offen", priority: "niedrig", dueInDays: 40 },
  { title: "Umfrage an Testgruppe senden", status: "erledigt", priority: "hoch", dueInDays: -8 },
  { title: "Vertragsentwurf gegenlesen", status: "in_arbeit", priority: "hoch", dueInDays: 4 },
  { title: "Webseitentexte prüfen", status: "offen", priority: "mittel", dueInDays: 12 },
  { title: "Wartungsfenster ankündigen", status: "erledigt", priority: "mittel", dueInDays: -2 },
  { title: "Zeiterfassung auswerten", status: "offen", priority: "hoch", dueInDays: 6 },
  { title: "Ablage digitalisieren", status: "in_arbeit", priority: "niedrig", dueInDays: 25 },
  { title: "Budgetplanung prüfen", status: "offen", priority: "niedrig", dueInDays: null },
  { title: "Dokumentvorlagen sortieren", status: "erledigt", priority: "niedrig", dueInDays: -20 },
  { title: "Kundenumfrage auswerten", status: "in_arbeit", priority: "mittel", dueInDays: 7 },
  {
    title: "Schulung Testsystem",
    description: "Kurze Einführung für neue Benutzer, Dauer etwa eine Stunde.",
    status: "offen",
    priority: "mittel",
    dueInDays: 19,
  },
  { title: "Telefonliste erneuern", status: "in_arbeit", priority: "mittel", dueInDays: null },
];

/** Feste IDs: ein zweiter Lauf trifft dieselben Zeilen, statt Doppelte anzulegen. */
export const seedTaskId = (index: number) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;

export const seedAccounts = {
  admin: { email: "seed-admin@example.test", name: "Test-Admin", role: "admin" },
  benutzer: { email: "seed-benutzer@example.test", name: "Test-Benutzer", role: "benutzer" },
} as const satisfies Record<Role, { email: string; name: string; role: Role }>;

export type SeedOptions = {
  /** Passwort für den Test-Admin (`SEED_ADMIN_PASSWORD`). Ohne: kein Admin-Konto. */
  adminPassword?: string;
  /** Passwort für den Test-Benutzer (`SEED_USER_PASSWORD`). Ohne: kein Benutzerkonto. */
  userPassword?: string;
  /** Bezugstag für die Fälligkeiten, Standard heute. */
  today?: Date;
  log?: (message: string) => void;
};

export type SeedResult = { tasks: number; accountsCreated: string[] };

/** Kalendertag `JJJJ-MM-TT` (UTC), `days` Tage nach `base`. */
export function addDays(base: Date, days: number): string {
  const date = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days),
  );
  return date.toISOString().slice(0, 10);
}

async function seedAccount(
  db: Db,
  role: Role,
  password: string | undefined,
  log: (message: string) => void,
): Promise<{ id: string; email: string; created: boolean } | undefined> {
  if (!password) return undefined;
  const account = seedAccounts[role];
  const existing = await findUserByEmail(db, account.email);
  if (existing) {
    log(`Konto ${account.email} existiert schon, Passwort unverändert.`);
    return { id: existing.id, email: existing.email, created: false };
  }
  try {
    const user = await createUser(db, { ...account, password });
    log(`Konto ${user.email} (${user.role}) angelegt.`);
    return { id: user.id, email: user.email, created: true };
  } catch (error) {
    // Gleichzeitig von einem anderen Lauf angelegt.
    if (!(error instanceof EmailTakenError)) throw error;
    const raced = await findUserByEmail(db, account.email);
    return raced && { id: raced.id, email: raced.email, created: false };
  }
}

/**
 * Legt die 30 Seed-Aufgaben an oder setzt sie auf den Seed-Stand zurück (andere Aufgaben bleiben).
 * Konten nur, wenn das jeweilige Passwort übergeben wird. Mehrfach ausführbar ohne Doppelte.
 */
export async function seed(db: Db, options: SeedOptions = {}): Promise<SeedResult> {
  const log = options.log ?? console.log;
  const today = options.today ?? new Date();

  const admin = await seedAccount(db, "admin", options.adminPassword, log);
  const benutzer = await seedAccount(db, "benutzer", options.userPassword, log);
  if (!options.adminPassword && !options.userPassword) {
    log("SEED_ADMIN_PASSWORD und SEED_USER_PASSWORD nicht gesetzt: keine Konten angelegt.");
  }

  // Ersteller ist der Test-Admin, sobald es ihn gibt, auch bei einem späteren Lauf ohne Passwort.
  const creatorId = admin?.id ?? (await findUserByEmail(db, seedAccounts.admin.email))?.id ?? null;
  const now = today.getTime();
  const rows = seedTasks.map((task, index) => ({
    id: seedTaskId(index),
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueInDays === null ? null : addDays(today, task.dueInDays),
    createdBy: creatorId,
    // Gestaffelt, damit „neueste zuerst“ eine erkennbare Reihenfolge hat.
    createdAt: new Date(now - (seedTasks.length - index) * 60 * 60 * 1000),
  }));

  await db
    .insert(tasks)
    .values(rows)
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        title: sql`excluded.title`,
        description: sql`excluded.description`,
        status: sql`excluded.status`,
        priority: sql`excluded.priority`,
        dueDate: sql`excluded.due_date`,
        createdBy: sql`excluded.created_by`,
        createdAt: sql`excluded.created_at`,
        updatedAt: new Date(),
      },
    });
  log(`${rows.length} Aufgaben angelegt oder auf den Seed-Stand gesetzt.`);

  return {
    tasks: rows.length,
    accountsCreated: [admin, benutzer].flatMap((account) =>
      account?.created ? [account.email] : [],
    ),
  };
}
