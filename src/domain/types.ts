/** Core data shapes. These mirror the prototype's model, which survived six rounds
 *  of changes unaltered in structure — treat them as the schema of record. */

export type HabitMode = 'every' | 'days' | 'count';

/** How often a habit is expected in ONE week. Stored per week, so amending a week
 *  never touches any other week. */
export interface HabitPlan {
  mode: HabitMode;
  /** Day indexes 0=Mon..6=Sun. Only meaningful when mode==='days'. */
  days: number[];
  /** Times per week. Only meaningful when mode==='count'. */
  n: number;
}

export interface Habit {
  id: string;
  name: string;
  short: string;
  /** Disabling keeps the habit and its whole history; re-enabling is the same habit. */
  active: boolean;
  /** Ticking this habit opens a picker instead of toggling. */
  /** Ticking this habit opens something instead of just toggling:
   *  'watch' picks from the watchlist, 'weight' asks for a number. */
  picks?: 'watch' | 'weight';
  /** Fallback plan when the week template says nothing about this habit. */
  def?: HabitPlan;
}

export interface Section { id: string; name: string }

export interface Trackable {
  id: string;
  name: string;
  /** Index into the 12-colour categorical palette. */
  ci: number;
}

export type TaskState = 'open' | 'done';

export interface Task {
  id: string;
  text: string;
  state: TaskState;
  /** True when the task came from the week template rather than being typed by hand. */
  plan: boolean;
  /** Trackable id; ticking a tagged task logs a session. */
  track: string | null;
  sec: string;
  /** When it was ticked, as a count of milliseconds. Only used to order the
   *  done pile: the one you just finished sits at the top of it. */
  doneAt?: number;
  /** Anything that did not fit in the name. A task with one is marked on the
   *  day with a dot, so you can see there is more without it being in the way. */
  note?: string;
}

/** How much a task's note can hold. Long enough for an address, a packing list
 *  or what somebody actually asked for; short enough to stay a note. */
export const NOTE_LIMIT = 600;

/** Two ticks, not one. `need` is the weekly decision about what to buy;
 *  `done` is what happened in the shop. A thing you did not need this week is
 *  not a thing you failed to buy. */
export interface ShopItem { id: string; text: string; need: boolean; done: boolean }
export interface ShopGroup { id: string; name: string; items: ShopItem[] }

/** The standing list every week starts from: the headings, and the things you
 *  buy often enough to be worth having written down already. */
export interface ShopTemplate { groups: ShopGroup[] }

export interface WatchItem {
  id: string;
  title: string;
  kind: 'film' | 'tv';
  /** A film is done once watched; a series is done only when you finish it. */
  done: boolean;
}

export interface Week {
  /** ISO date (YYYY-MM-DD) of the Monday. */
  monday: string;
  templateId: string;
  /** This week's headings, copied from its template when the week was built.
   *  Kept on the week so changing a template later does not silently move
   *  tasks already filed under a heading that has gone. */
  sections?: Section[];
  focus: string;
  habitPlan: Record<string, HabitPlan>;
  /** dayIndex -> habitId -> ticked */
  habits: Record<number, Record<string, boolean>>;
  tasks: Record<number, Task[]>;
  /** Holidays and write-offs: these days ask nothing and cost nothing. */
  untracked: Record<number, boolean>;
  complete: Record<number, boolean>;
  /** dayIndex -> watchlist item ids picked that evening. */
  watched: Record<number, string[]>;
  /** dayIndex -> habitId -> minutes past midnight when it was ticked.
   *  Only what the phone was showing at the time; never backfilled. */
  at?: Record<number, Record<string, number>>;
  /** dayIndex -> habitId -> the number the habit asked for, e.g. a weight.
   *  Stored in kilograms whatever the display unit, so changing units later
   *  does not silently rewrite history. */
  readings?: Record<number, Record<string, number>>;
  shop?: ShopGroup[];
  shopCopiedFrom?: string | null;
}

export interface TripItem { id: string; cat: string; text: string; done: boolean }

export interface Trip {
  id: string;
  name: string;
  tplId: string;
  start: string;
  end: string;
  items: TripItem[];
}

export interface CountdownEvent {
  id: string;
  name: string;
  date: string;
  source: 'calendar' | 'added';
}

export interface AppState {
  habits: Habit[];
  /** The week templates, seeded from the built-ins and editable from then on. */
  templates: Record<string, WeekTemplate>;
  /** Picker order. Ids not listed still work; they sort to the end. */
  templateOrder: string[];
  sections: Section[];
  trackables: Trackable[];
  /** Keyed by ISO week id, e.g. "2026-W38". Weeks are created on demand. */
  weeks: Record<string, Week>;
  watch: WatchItem[];
  trips: Trip[];
  events: CountdownEvent[];
  sample: boolean;
  /** Everything the app remembers about how you want it to behave. */
  prefs: Prefs;
  /** The standing shopping list new weeks are built from. */
  shopTemplate?: ShopGroup[];
  /** The standing checklist new trips are built from, by category. */
  tripTemplate?: Record<string, string[]>;
  version: number;
}

export interface Prefs {
  /** 'system' follows the phone; the other two override it. */
  theme: 'system' | 'light' | 'dark';
  /** What a weight is shown and entered in. */
  weightUnit: 'kg' | 'lb';
  /** How big the writing is, everywhere. */
  textSize: TextSize;
}

/** Three sizes, because a phone in one hand at arm's length is not the same as
 *  a phone on a desk, and neither is anybody's eyesight. */
export type TextSize = 'small' | 'medium' | 'large' | 'xl';

export const TEXT_SIZES: { key: TextSize; name: string; note: string }[] = [
  { key: 'small', name: 'Small', note: 'More on the screen at once' },
  { key: 'medium', name: 'Medium', note: 'How the app was drawn' },
  { key: 'large', name: 'Large', note: 'Easier to read, less on a page' },
  { key: 'xl', name: 'XL', note: 'As big as it goes — read it at arm’s length' },
];

export const DEFAULT_PREFS: Prefs = { theme: 'system', weightUnit: 'kg', textSize: 'medium' };

/** [text, trackableId | null, sectionIndex] */
export type PlanEntry = [string, string | null, number];

export interface WeekTemplate {
  id: string;
  name: string;
  /** The goal this kind of week serves — Hypertrophy, Taper, Recovery and so
   *  on. Chosen from a list, or typed. */
  tag: string;
  blurb: string;
  why: string;
  note?: string;
  weights: { habits: number; tasks: number };
  /** Standard weekly counts per habit id. 7+ becomes "every day".
   *  How the built-ins are written; `plans` overrides it once edited. */
  targets: Record<string, number>;
  /** Full plans per habit id, which can express chosen days. Takes precedence. */
  plans?: Record<string, HabitPlan>;
  /** Seven days of scaffold tasks. */
  plan: PlanEntry[][];
  /** The headings a day is split into on this kind of week. Absent means the
   *  app's standard three; a template that sets its own overrides them. */
  sections?: Section[];
}

/** A calendar entry read from the phone, never written by this app. */
export interface CalendarEvent {
  id: string;
  time: string;
  title: string;
  where: string;
  allDay: boolean;
  /** Set when the entry looks like a planned session (e.g. from Runna). */
  track?: string | null;
  /** The entry's own location, where it has one. `where` falls back to the
   *  calendar's name for display; this does not, so two entries can be told
   *  apart by place without the calendar name getting in the way. */
  place?: string | null;
  /** The day it falls on, when a list spans more than one. */
  date?: string;
  /** How many identical copies were collapsed into this one. 1 when unique. */
  copies?: number;
}
