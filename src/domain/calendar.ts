import type { CalendarEvent } from './types';

/** Subscribed calendar feeds duplicate themselves easily — the same Runna plan
 *  arriving through Apple and through Outlook, or a feed subscribed twice —
 *  and iOS shows every copy. Collapsing them is a display decision, so it
 *  lives here where it can be tested without a phone.
 *
 *  The bar is *identical*, not *similar*. Two Runna sessions on one day are
 *  routine and are usually different sessions, so anything that could be told
 *  apart on screen is left alone. */

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Two entries are the same entry when they fall on the same day at the same
 *  minute with the same name. Which calendar each came from is deliberately
 *  not part of this: the whole point is that one session shows up in two. */
function keyOf(e: CalendarEvent): string {
  return JSON.stringify([e.date ?? '', e.allDay ? 'all' : e.time, norm(e.title)]);
}

/** A real location, as distinct from the calendar name `where` falls back to. */
function placeOf(e: CalendarEvent): string | null {
  const p = (e.place ?? '').trim();
  return p ? norm(p) : null;
}

/** Keeps the first of each set of identical entries, taking any detail the
 *  later copies have and it lacks. Order is otherwise untouched. */
export function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const seen = new Map<string, CalendarEvent[]>();

  for (const e of events) {
    const key = keyOf(e);
    const kept = seen.get(key) ?? [];

    // Same name and minute, but each names a different place: two real things.
    const mine = placeOf(e);
    const twin = kept.find((k) => {
      const theirs = placeOf(k);
      return mine === null || theirs === null || mine === theirs;
    });

    if (!twin) {
      const fresh = { ...e, copies: 1 };
      kept.push(fresh);
      seen.set(key, kept);
      out.push(fresh);
      continue;
    }

    twin.copies = (twin.copies ?? 1) + 1;
    if (!twin.place && e.place) { twin.place = e.place; twin.where = e.where; }
    if (!twin.track && e.track) twin.track = e.track;
  }

  return out;
}
