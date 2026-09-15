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
  picks?: 'watch';
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

export type TaskState = 'open' | 'done' | 'dropped';

export interface Task {
  id: string;
  text: string;
  state: TaskState;
  /** True when the task came from the week template rather than being typed by hand. */
  plan: boolean;
  /** Trackable id; ticking a tagged task logs a session. */
  track: string | null;
  sec: string;
}

export interface ShopItem { id: string; text: string; done: boolean }
export interface ShopGroup { id: string; name: string; items: ShopItem[] }

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
  sections: Section[];
  trackables: Trackable[];
  /** Keyed by ISO week id, e.g. "2026-W38". Weeks are created on demand. */
  weeks: Record<string, Week>;
  watch: WatchItem[];
  trips: Trip[];
  events: CountdownEvent[];
  sample: boolean;
  version: number;
}

/** [text, trackableId | null, sectionIndex] */
export type PlanEntry = [string, string | null, number];

export interface WeekTemplate {
  id: string;
  name: string;
  tag: string;
  blurb: string;
  why: string;
  note?: string;
  weights: { habits: number; tasks: number };
  /** Standard weekly counts per habit id. 7+ becomes "every day". */
  targets: Record<string, number>;
  /** Seven days of scaffold tasks. */
  plan: PlanEntry[][];
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
}
