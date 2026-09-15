import type { AppState, Habit, Week } from './types';
import { TEMPLATES } from './catalogue';
import { DAY_NAMES, dayIndexIn } from './dates';
import type { WeekTemplate } from './types';

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** The week's template, from the user's own set, falling back to the built-ins. */
export function templateOf(state: AppState, week: Week): WeekTemplate {
  return state.templates?.[week.templateId]
    ?? state.templates?.general
    ?? TEMPLATES[week.templateId]
    ?? TEMPLATES.general;
}

export function activeHabits(state: AppState, week: Week): Habit[] {
  return state.habits.filter((h) => h.active && week.habitPlan[h.id]);
}

/** Days that count. An untracked day asks nothing and costs nothing. */
export function trackedDays(week: Week): number[] {
  return ALL_DAYS.filter((d) => !week.untracked[d]);
}

/** 0=Mon..6=Sun for today, or -1 when today is before this week, 6 when after. */
export function todayIndex(week: Week, today: Date): number {
  const i = dayIndexIn(week.monday, today);
  if (i >= 0) return i;
  return new Date(week.monday) < today ? 6 : -1;
}

export function isCurrentWeek(week: Week, today: Date): boolean {
  return dayIndexIn(week.monday, today) >= 0;
}

/** Tracked days elapsed so far — the denominator for "pace". */
export function elapsedDays(week: Week, today: Date): number {
  const td = trackedDays(week);
  if (!isCurrentWeek(week, today)) return td.length;
  const ti = todayIndex(week, today);
  return td.filter((d) => d <= ti).length;
}

/** What a habit asks of one particular day.
 *  - `today`  pinned to this day: every day, or a chosen day that includes it
 *  - `anyday` owed this week but not to any day in particular (N times a week)
 *  - `off`    not this day: a chosen-days habit elsewhere, or an untracked day */
export type DayStatus = 'today' | 'anyday' | 'off';

export function habitDayStatus(week: Week, habitId: string, day: number): DayStatus {
  const p = week.habitPlan[habitId];
  if (!p || week.untracked[day]) return 'off';
  if (p.mode === 'every') return 'today';
  if (p.mode === 'days') return p.days.includes(day) ? 'today' : 'off';
  return 'anyday';
}

/** Only what is pinned to the day. This is what decides whether a day is finished:
 *  a "5 times a week, any day" habit is a weekly matter, and holding every single
 *  day open until it is done would mean no day is ever complete. */
export function plannedOn(week: Week, habitId: string, day: number): boolean {
  return habitDayStatus(week, habitId, day) === 'today';
}

/** Whether the habit can be ticked on this day at all — used by the wall chart. */
export function scheduledOn(week: Week, habitId: string, day: number): boolean {
  const p = week.habitPlan[habitId];
  if (!p) return false;
  if (week.untracked[day]) return false;
  return p.mode === 'days' ? p.days.includes(day) : true;
}

/** How many times this habit is expected this week, after untracked days are removed. */
export function habitTarget(week: Week, habitId: string): number {
  const p = week.habitPlan[habitId];
  if (!p) return 0;
  const td = trackedDays(week);
  if (p.mode === 'every') return td.length;
  if (p.mode === 'days') return p.days.filter((d) => td.includes(d)).length;
  return Math.min(p.n, td.length);
}

/** Ticks on tracked days. A tick on an unscheduled day still counts. */
export function habitDone(week: Week, habitId: string): number {
  return trackedDays(week).filter((d) => week.habits[d]?.[habitId]).length;
}

export function planLabel(week: Week, habitId: string): string {
  const p = week.habitPlan[habitId];
  if (!p) return '';
  if (p.mode === 'every') return 'Every day';
  if (p.mode === 'days') return p.days.map((d) => DAY_NAMES[d].slice(0, 2)).join(' ');
  return `${p.n}× a week`;
}

export function dayScore(state: AppState, week: Week, day: number): number {
  if (week.untracked[day]) return 0;
  const ids = activeHabits(state, week).filter((h) => plannedOn(week, h.id, day)).map((h) => h.id);
  const ticked = week.habits[day] ?? {};
  const hp = ids.length ? ids.filter((id) => ticked[id]).length / ids.length : 1;
  const tasks = week.tasks[day] ?? [];
  const done = tasks.filter((t) => t.state === 'done').length;
  const tp = tasks.length ? done / tasks.length : 1;
  const w = templateOf(state, week).weights;
  return hp * w.habits + tp * w.tasks;
}

export function dayOutstanding(state: AppState, week: Week, day: number): number {
  const ticked = week.habits[day] ?? {};
  const h = activeHabits(state, week).filter((x) => plannedOn(week, x.id, day) && !ticked[x.id]).length;
  const t = (week.tasks[day] ?? []).filter((x) => x.state === 'open').length;
  return h + t;
}

export function dayAllDone(state: AppState, week: Week, day: number): boolean {
  return dayOutstanding(state, week, day) === 0;
}

export interface WeekScore {
  /** Against where you should be by now. */
  pace: number;
  /** Against the whole week; only reaches 100% on Sunday night. */
  banked: number;
  habitsDone: number;
  habitsTarget: number;
  tasksDone: number;
  tasksOpen: number;
  trackedCount: number;
  elapsed: number;
}

export function weekScore(state: AppState, week: Week, today: Date): WeekScore {
  const t = templateOf(state, week);
  const td = trackedDays(week);
  const el = elapsedDays(week, today);
  const ti = todayIndex(week, today);
  const current = isCurrentWeek(week, today);

  let done = 0;
  let target = 0;
  let expected = 0;
  for (const h of activeHabits(state, week)) {
    const tg = habitTarget(week, h.id);
    if (!tg) continue;
    target += tg;
    expected += td.length ? (tg * el) / td.length : 0;
    done += Math.min(tg, habitDone(week, h.id));
  }

  let ticked = 0;
  let open = 0;
  let tickedAll = 0;
  let openAll = 0;
  for (const d of td) {
    for (const x of week.tasks[d] ?? []) {
      if (x.state === 'done') tickedAll += 1;
      else openAll += 1;
      if (current && d > ti) continue;
      if (x.state === 'done') ticked += 1;
      else open += 1;
    }
  }

  const hPace = expected ? Math.min(1, done / expected) : 0;
  const hBanked = target ? done / target : 0;
  const tPace = ticked + open ? ticked / (ticked + open) : 1;
  const tBanked = tickedAll + openAll ? tickedAll / (tickedAll + openAll) : 1;

  return {
    pace: hPace * t.weights.habits + tPace * t.weights.tasks,
    banked: hBanked * t.weights.habits + tBanked * t.weights.tasks,
    habitsDone: done,
    habitsTarget: target,
    tasksDone: tickedAll,
    tasksOpen: openAll,
    trackedCount: td.length,
    elapsed: el,
  };
}

/** Consecutive tracked days up to today with this habit ticked. */
export function streak(week: Week, habitId: string, today: Date): number {
  const ti = todayIndex(week, today);
  const days = trackedDays(week).filter((d) => !isCurrentWeek(week, today) || d <= ti);
  let n = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (week.habits[days[i]]?.[habitId]) n += 1;
    else break;
  }
  return n;
}

/** Sessions of one trackable logged in one week; untracked days are excluded. */
export function trackWeekCount(week: Week, trackId: string): number {
  let n = 0;
  for (const d of trackedDays(week)) {
    for (const x of week.tasks[d] ?? []) {
      if (x.track === trackId && x.state === 'done') n += 1;
    }
  }
  return n;
}

/** Evenings this title has been picked, across every week. */
export function watchCount(state: AppState, itemId: string): number {
  let n = 0;
  for (const w of Object.values(state.weeks)) {
    for (const arr of Object.values(w.watched ?? {})) {
      if ((arr ?? []).includes(itemId)) n += 1;
    }
  }
  return n;
}
