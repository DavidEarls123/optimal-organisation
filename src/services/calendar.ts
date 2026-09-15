import * as Calendar from 'expo-calendar';
import type { CalendarEvent } from '../domain/types';
import { parseISO, addDays } from '../domain/dates';
import { dedupeEvents } from '../domain/calendar';

/** Reading the phone's calendar is the whole integration story.
 *  Outlook synced to iOS shows up here, and so does a Runna plan — Runna
 *  publishes an iCalendar feed it syncs into Apple, Google and Outlook
 *  calendars, so planned sessions arrive without any API work.
 *
 *  SDK 57 replaced the `*Async` calendar API. The old names still exist but
 *  every one of them throws, so a blanket try/catch turns a wrong API call
 *  into a convincing "you haven't granted access yet" — which is what hid
 *  this for several builds. Failures are now recorded and shown. */

let granted: boolean | null = null;
let lastError: string | null = null;

export type CalendarAccess = 'granted' | 'ask' | 'blocked' | 'error';

/** The reason the calendar came back empty, when it was not a permission. */
export function calendarError(): string | null {
  return lastError;
}

function note(e: unknown): null {
  lastError = e instanceof Error ? e.message : String(e);
  return null;
}

function stateOf(p: Calendar.PermissionResponse): CalendarAccess {
  granted = p.granted;
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'ask' : 'blocked';
}

/** Reads the current state without prompting, so the UI can say something
 *  useful instead of silently showing no events. */
export async function calendarAccess(): Promise<CalendarAccess> {
  try {
    lastError = null;
    return stateOf(await Calendar.getCalendarPermissions(false));
  } catch (e) {
    note(e);
    return 'error';
  }
}

/** Prompts, if iOS will still let us. Returns the state afterwards. */
export async function askForCalendar(): Promise<CalendarAccess> {
  try {
    lastError = null;
    return stateOf(await Calendar.requestCalendarPermissions(false));
  } catch (e) {
    note(e);
    return 'error';
  }
}

export async function ensureCalendarPermission(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    const p = await Calendar.requestCalendarPermissions(false);
    granted = p.granted;
  } catch (e) {
    note(e);
    granted = false;
  }
  return granted;
}

/** The event calendars on the phone. */
async function eventCalendars(): Promise<Calendar.ExpoCalendar[]> {
  try {
    return await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  } catch (e) {
    note(e);
    return [];
  }
}

/** Names of the calendars being read, so you can tell whether Outlook is among them. */
export async function calendarNames(): Promise<string[]> {
  if (!(await ensureCalendarPermission())) return [];
  const cals = await eventCalendars();
  return [...new Set(cals.map((c) => c.title).filter(Boolean))].sort();
}

/** Guess the trackable a planned session belongs to, from its calendar source
 *  and wording. Returns null when it is an ordinary appointment. */
export function inferTrack(title: string, calendarTitle: string): string | null {
  const hay = `${calendarTitle} ${title}`.toLowerCase();
  if (/runna|parkrun|\brun\b|\bkm\b|\b\d+k\b|intervals|tempo|shakeout|strides/.test(hay)) return 'run';
  if (/\bgym\b|lift|squat|deadlift|bench|strength/.test(hay)) return 'gym';
  if (/\bswim\b/.test(hay)) return 'swim';
  if (/\bwalk\b/.test(hay)) return 'walk';
  if (/\bhiit\b|circuit/.test(hay)) return 'hiit';
  if (/\bgolf\b/.test(hay)) return 'golf';
  return null;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** `startDate` comes back as a Date on some platforms and an ISO string on
 *  others, so never hand it straight to a getter. */
function asDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function eventsBetween(start: Date, end: Date) {
  if (!(await ensureCalendarPermission())) return null;
  const cals = await eventCalendars();
  if (!cals.length) return null;
  try {
    lastError = null;
    const raw = await Calendar.listEvents(cals, start, end);
    return { raw, byId: new Map(cals.map((c) => [c.id, c.title ?? ''])) };
  } catch (e) {
    note(e);
    return null;
  }
}

/** Timed events for one day, ordered. All-day events are returned too, flagged,
 *  because those are the ones that become countdowns rather than appointments. */
export async function eventsForDay(dateIso: string): Promise<CalendarEvent[]> {
  const start = parseISO(dateIso);
  const found = await eventsBetween(start, addDays(start, 1));
  if (!found) return [];
  const mapped = found.raw
    .map((e) => {
      const calTitle = found.byId.get(e.calendarId) ?? '';
      return {
        id: String(e.id),
        time: e.allDay ? '' : hhmm(asDate(e.startDate)),
        title: e.title || '(untitled)',
        where: e.location || calTitle,
        place: e.location || null,
        allDay: Boolean(e.allDay),
        track: inferTrack(e.title ?? '', calTitle),
      } satisfies CalendarEvent;
    })
    .sort((a, b) => (a.allDay === b.allDay ? a.time.localeCompare(b.time) : a.allDay ? -1 : 1));
  return dedupeEvents(mapped);
}

/** All-day entries in the next `days` days become countdowns. */
export async function allDayHorizon(fromIso: string, days = 180): Promise<(CalendarEvent & { date: string })[]> {
  const start = parseISO(fromIso);
  const found = await eventsBetween(start, addDays(start, days));
  if (!found) return [];
  const mapped = found.raw
    .filter((e) => e.allDay)
    .map((e) => ({
      id: String(e.id),
      time: '',
      title: e.title || '(untitled)',
      where: '',
      place: e.location || null,
      allDay: true,
      date: ymd(asDate(e.startDate)),
    }));
  return dedupeEvents(mapped) as (CalendarEvent & { date: string })[];
}
