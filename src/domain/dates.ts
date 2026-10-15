/** Date helpers. Everything is local-time and day-granular; no UTC surprises. */

export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MS_DAY = 86400000;

/** YYYY-MM-DD in local time. */
export function isoOf(d: Date): string {
  return (
    d.getFullYear() +
    '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0')
  );
}

/** Parse YYYY-MM-DD as local midnight. */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** ISO-8601 week id, e.g. "2026-W38". Weeks run Monday to Sunday. */
export function isoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d.getTime() - yearStart.getTime()) / MS_DAY + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}

/** Week id for the Monday-anchored week containing `date`. */
export function weekIdOf(date: Date): string {
  return isoWeekId(mondayOf(date));
}

/** 0=Mon..6=Sun for `date` within the week starting `mondayIso`, or -1 if outside. */
export function dayIndexIn(mondayIso: string, date: Date): number {
  const diff = Math.round((startOfDay(date).getTime() - parseISO(mondayIso).getTime()) / MS_DAY);
  return diff >= 0 && diff <= 6 ? diff : -1;
}

/** Whole days from today to `iso`; negative when past. */
export function daysUntil(iso: string, today: Date): number {
  return Math.round((parseISO(iso).getTime() - startOfDay(today).getTime()) / MS_DAY);
}

export function dayDateIso(mondayIso: string, dayIndex: number): string {
  return isoOf(addDays(parseISO(mondayIso), dayIndex));
}

export function weekNumber(weekId: string): string {
  return weekId.slice(-2);
}

/** The Monday a week id names, or null if it is not one.
 *
 *  The 4th of January is always in week one — that is what ISO-8601 says — so
 *  the Monday of the week containing it is where a year's weeks start counting
 *  from. This is the way back from an id to a date, which is what repairing a
 *  week filed under the right id with the wrong anchor needs. */
export function mondayOfWeekId(id: string): string | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(id);
  if (!m) return null;
  const wk = Number(m[2]);
  if (wk < 1 || wk > 53) return null;
  return isoOf(addDays(mondayOf(new Date(Number(m[1]), 0, 4)), (wk - 1) * 7));
}

/** The week id seven days earlier. */
export function previousWeekId(mondayIso: string): string {
  return isoWeekId(addDays(parseISO(mondayIso), -7));
}
