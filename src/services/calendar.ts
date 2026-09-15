import * as Calendar from 'expo-calendar';
import type { CalendarEvent } from '../domain/types';
import { parseISO, addDays } from '../domain/dates';

/** Reading the phone's calendar is the whole integration story.
 *  Outlook synced to iOS shows up here, and so does a Runna plan — Runna
 *  publishes an iCalendar feed it syncs into Apple, Google and Outlook
 *  calendars, so planned sessions arrive without any API work. */

let granted: boolean | null = null;

export type CalendarAccess = 'granted' | 'ask' | 'blocked';

/** Reads the current state without prompting, so the UI can say something
 *  useful instead of silently showing no events. */
export async function calendarAccess(): Promise<CalendarAccess> {
  try {
    const p = await Calendar.getCalendarPermissionsAsync();
    granted = p.granted;
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'ask' : 'blocked';
  } catch {
    return 'blocked';
  }
}

/** Prompts, if iOS will still let us. Returns the state afterwards. */
export async function askForCalendar(): Promise<CalendarAccess> {
  try {
    const p = await Calendar.requestCalendarPermissionsAsync();
    granted = p.granted;
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'ask' : 'blocked';
  } catch {
    return 'blocked';
  }
}

export async function ensureCalendarPermission(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    granted = status === 'granted';
  } catch {
    granted = false;
  }
  return granted;
}

/** Names of the calendars being read, so you can tell whether Outlook is among them. */
export async function calendarNames(): Promise<string[]> {
  if (!(await ensureCalendarPermission())) return [];
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return [...new Set(cals.map((c) => c.title).filter(Boolean) as string[])].sort();
  } catch {
    return [];
  }
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

/** Timed events for one day, ordered. All-day events are returned too, flagged,
 *  because those are the ones that become countdowns rather than appointments. */
export async function eventsForDay(dateIso: string): Promise<CalendarEvent[]> {
  if (!(await ensureCalendarPermission())) return [];
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (!cals.length) return [];
    const start = parseISO(dateIso);
    const end = addDays(start, 1);
    const raw = await Calendar.getEventsAsync(cals.map((c) => c.id), start, end);
    const byId = new Map(cals.map((c) => [c.id, c.title ?? '']));
    return raw
      .map((e) => {
        const from = new Date(e.startDate as string | number | Date);
        const calTitle = byId.get(e.calendarId ?? '') ?? '';
        return {
          id: String(e.id),
          time: e.allDay ? '' : hhmm(from),
          title: e.title ?? '(untitled)',
          where: e.location || calTitle,
          allDay: Boolean(e.allDay),
          track: inferTrack(e.title ?? '', calTitle),
        } satisfies CalendarEvent;
      })
      .sort((a, b) => (a.allDay === b.allDay ? a.time.localeCompare(b.time) : a.allDay ? -1 : 1));
  } catch {
    return [];
  }
}

/** All-day entries in the next `days` days become countdowns. */
export async function allDayHorizon(fromIso: string, days = 180): Promise<CalendarEvent[]> {
  if (!(await ensureCalendarPermission())) return [];
  try {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    if (!cals.length) return [];
    const start = parseISO(fromIso);
    const raw = await Calendar.getEventsAsync(cals.map((c) => c.id), start, addDays(start, days));
    return raw
      .filter((e) => e.allDay)
      .map((e) => {
        const d = new Date(e.startDate as string | number | Date);
        return {
          id: String(e.id),
          time: '',
          title: e.title ?? '(untitled)',
          where: '',
          allDay: true,
          date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        } as CalendarEvent & { date: string };
      });
  } catch {
    return [];
  }
}
