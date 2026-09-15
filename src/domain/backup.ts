import type { AppState } from './types';
import { migrate } from './state';

/** The file format. Kept deliberately boring: a wrapper with enough provenance to
 *  tell you what you are about to restore, and the state verbatim underneath. */
export const BACKUP_KIND = 'optimal-week-backup';
export const BACKUP_FORMAT = 1;

export interface BackupEnvelope {
  kind: typeof BACKUP_KIND;
  format: number;
  exportedAt: string;
  app: { version: number };
  summary: BackupSummary;
  state: AppState;
}

export interface BackupSummary {
  weeks: number;
  firstWeek: string | null;
  lastWeek: string | null;
  habits: number;
  tasksDone: number;
  trips: number;
  countdowns: number;
  watchlist: number;
}

export function summarise(state: AppState): BackupSummary {
  const ids = Object.keys(state.weeks).sort();
  let tasksDone = 0;
  for (const w of Object.values(state.weeks)) {
    for (const arr of Object.values(w.tasks ?? {})) {
      for (const t of arr) if (t.state === 'done') tasksDone += 1;
    }
  }
  return {
    weeks: ids.length,
    firstWeek: ids[0] ?? null,
    lastWeek: ids[ids.length - 1] ?? null,
    habits: state.habits.length,
    tasksDone,
    trips: state.trips.length,
    countdowns: state.events.length,
    watchlist: state.watch.length,
  };
}

export function buildEnvelope(state: AppState, now = new Date()): BackupEnvelope {
  return {
    kind: BACKUP_KIND,
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    app: { version: state.version },
    summary: summarise(state),
    state,
  };
}

export function serialise(state: AppState, now = new Date()): string {
  return `${JSON.stringify(buildEnvelope(state, now), null, 2)}\n`;
}

export type ParseResult =
  | { ok: true; state: AppState; summary: BackupSummary; exportedAt: string }
  | { ok: false; reason: string };

/** Never trust a file. Anything that is not recognisably one of our backups is
 *  refused outright rather than half-applied. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not valid JSON.' };
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'That file does not contain a backup.' };
  }
  const env = raw as Partial<BackupEnvelope>;
  if (env.kind !== BACKUP_KIND) {
    return { ok: false, reason: 'That is not a Week One backup.' };
  }
  if (typeof env.format !== 'number' || env.format > BACKUP_FORMAT) {
    return { ok: false, reason: 'That backup was made by a newer version of the app.' };
  }
  const state = migrate((env.state ?? null) as AppState | null);
  if (!state) {
    return { ok: false, reason: 'That backup is missing its week data.' };
  }
  return {
    ok: true,
    state,
    summary: summarise(state),
    exportedAt: typeof env.exportedAt === 'string' ? env.exportedAt : '',
  };
}

export function backupFilename(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `optimal-week-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
    + `-${p(now.getHours())}${p(now.getMinutes())}.json`;
}
