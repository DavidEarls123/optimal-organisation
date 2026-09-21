import type { AppState, Habit, Week } from './types';
import { TEMPLATES } from './catalogue';
import { DAY_NAMES, dayDateIso, dayIndexIn, isoOf } from './dates';
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
  if (isCurrentWeek(week, today)) {
    const ti = todayIndex(week, today);
    return td.filter((d) => d <= ti).length;
  }
  // A week still to come has had none of its days, and scoring one as though
  // it were over said you had missed everything in it before it began.
  return isAheadWeek(week, today) ? 0 : td.length;
}

/** A week whose Monday has not arrived yet. */
export function isAheadWeek(week: Week, today: Date): boolean {
  return week.monday > isoOf(today);
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
  /** Against where you should be by the end of the last day that is over. */
  pace: number;
  /** True when nothing has come due yet, so pace is not a number worth
   *  printing: the first day of a week, or a week still to come. */
  pending: boolean;
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

  // Pace is measured against the days that are over. The day you are standing
  // in is not one of them: at eight in the morning nothing on it is late, and
  // a week that reads nought per cent over breakfast is not telling you
  // anything true. Today can still earn — what is ticked counts the moment it
  // is ticked — it just cannot yet be held against you.
  const ahead = isAheadWeek(week, today);
  const over = current ? Math.max(0, el - 1) : el;

  let done = 0;
  let target = 0;
  let expected = 0;
  for (const h of activeHabits(state, week)) {
    const tg = habitTarget(week, h.id);
    if (!tg) continue;
    target += tg;
    expected += td.length ? (tg * over) / td.length : 0;
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
      // Days that are over are the only ones pace knows about: not the future,
      // not a week that has not begun, and not the day you are standing in.
      if (ahead || (current && d >= ti)) {
        if (current && d === ti && x.state === 'done') ticked += 1;
        continue;
      }
      if (x.state === 'done') ticked += 1;
      else open += 1;
    }
  }

  const hPace = expected ? Math.min(1, done / expected) : 1;
  const hBanked = target ? done / target : 0;
  const tPace = ticked + open ? Math.min(1, ticked / (ticked + open)) : 1;
  const tBanked = tickedAll + openAll ? tickedAll / (tickedAll + openAll) : 1;

  // Nothing has come due yet, so there is no pace to report — as against a
  // pace of nought, which would be a judgement on a week that has not had the
  // chance to go wrong.
  const pending = expected === 0 && ticked + open === 0;

  // A template is allowed to be all habits or all tasks. When a side asks
  // nothing of you it cannot be scored, so its weight goes to the other side
  // rather than dragging the week to zero for work that was never set.
  const anyHabits = target > 0;
  const anyTasks = tickedAll + openAll > 0;
  const blend = (h: number, tk: number) => {
    if (anyHabits && anyTasks) return h * t.weights.habits + tk * t.weights.tasks;
    if (anyHabits) return h;
    if (anyTasks) return tk;
    return 0;
  };

  return {
    pace: blend(hPace, tPace),
    pending,
    banked: blend(hBanked, tBanked),
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

/** How a flexible habit is doing against its target, with the week's shape
 *  taken into account. A "3 times a week" habit on Saturday with none done is
 *  not merely behind — it is out of room, and the tile should say so. */
export interface Pacing {
  done: number;
  target: number;
  /** Tracked days still available, today included. */
  daysLeft: number;
  /** Still owed. */
  left: number;
  /** True when there are fewer days left than sessions owed. */
  atRisk: boolean;
  /** True when it cannot be finished any more. */
  impossible: boolean;
}

export function pacing(week: Week, habitId: string, today: number): Pacing {
  const target = habitTarget(week, habitId);
  const done = habitDone(week, habitId);
  const left = Math.max(0, target - done);
  let daysLeft = 0;
  for (let d = today; d < 7; d += 1) {
    if (!week.untracked[d] && !(week.habits[d] ?? {})[habitId]) daysLeft += 1;
  }
  return {
    done, target, daysLeft, left,
    atRisk: left > 0 && left >= daysLeft && daysLeft > 0,
    impossible: left > daysLeft,
  };
}

/** What time of day a habit usually gets done, and how much it moves around.
 *  Both in minutes past midnight; `spread` is the mean absolute deviation,
 *  which survives a small number of samples better than a standard deviation. */
export interface Timing { n: number; mean: number; spread: number; earliest: number; latest: number }

export function timing(weeks: Week[], habitId: string): Timing | null {
  const mins: number[] = [];
  for (const w of weeks) {
    for (const map of Object.values(w.at ?? {})) {
      const m = map?.[habitId];
      if (typeof m === 'number' && m >= 0 && m < 1440) mins.push(m);
    }
  }
  if (!mins.length) return null;
  const mean = mins.reduce((a, b) => a + b, 0) / mins.length;
  const spread = mins.reduce((a, b) => a + Math.abs(b - mean), 0) / mins.length;
  return {
    n: mins.length,
    mean,
    spread,
    earliest: Math.min(...mins),
    latest: Math.max(...mins),
  };
}

export function clockLabel(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Every reading for a habit, oldest first, as [ISO date, value in kg]. */
export function readings(weeks: Week[], habitId: string): [string, number][] {
  const out: [string, number][] = [];
  for (const w of weeks) {
    for (const [day, map] of Object.entries(w.readings ?? {})) {
      const v = map?.[habitId];
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      out.push([dayDateIso(w.monday, Number(day)), v]);
    }
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

export const KG_PER_LB = 0.45359237;
export const toKg = (v: number, unit: 'kg' | 'lb') => (unit === 'kg' ? v : v * KG_PER_LB);
export const fromKg = (kg: number, unit: 'kg' | 'lb') => (unit === 'kg' ? kg : kg / KG_PER_LB);
