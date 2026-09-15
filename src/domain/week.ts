import type { AppState, HabitPlan, PlanEntry, ShopGroup, Task, Week } from './types';
import { TEMPLATES } from './catalogue';
import { addDays, isoOf, isoWeekId, mondayOf, parseISO, previousWeekId } from './dates';

let seq = 0;
/** Ids only need to be unique within this device's store. */
export function uid(prefix = 'x'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export const everyPlan = (): HabitPlan => ({ mode: 'every', days: [0, 1, 2, 3, 4, 5, 6], n: 7 });
export const countPlan = (n: number): HabitPlan => ({ mode: 'count', days: [], n });
export const daysPlan = (days: number[]): HabitPlan => ({
  mode: 'days',
  days: [...days].sort((a, b) => a - b),
  n: days.length,
});

export function clonePlan(p: HabitPlan): HabitPlan {
  return { mode: p.mode, days: [...p.days], n: p.n };
}

/** A template's standard targets become this week's editable plan.
 *  A habit the template says nothing about falls back to its own default. */
export function planFromTemplate(state: AppState, templateId: string): Record<string, HabitPlan> {
  const t = state.templates?.[templateId] ?? TEMPLATES[templateId] ?? TEMPLATES.general;
  const out: Record<string, HabitPlan> = {};
  for (const h of state.habits) {
    if (!h.active) continue;
    const stored = t.plans?.[h.id];
    const n = t.targets[h.id];
    out[h.id] = stored ? clonePlan(stored)
      : n !== undefined ? (n >= 7 ? everyPlan() : countPlan(n))
      : h.def ? clonePlan(h.def)
      : countPlan(3);
  }
  return out;
}

export function planTasks(state: AppState, templateId: string, dayIndex: number): Task[] {
  const t = state.templates?.[templateId] ?? TEMPLATES[templateId] ?? TEMPLATES.general;
  const secs = state.sections.length ? state.sections : [{ id: 's1', name: 'Morning' }];
  const entries: PlanEntry[] = t.plan[dayIndex] ?? [];
  return entries.map(([text, track, si]) => ({
    id: uid('p'),
    text,
    state: 'open' as const,
    plan: true,
    track: track ?? null,
    sec: (secs[si] ?? secs[0]).id,
  }));
}

export function createWeek(state: AppState, mondayIso: string, templateId: string): Week {
  const w: Week = {
    monday: mondayIso,
    templateId,
    focus: '',
    habitPlan: planFromTemplate(state, templateId),
    habits: {},
    tasks: {},
    untracked: {},
    complete: {},
    watched: {},
  };
  for (let d = 0; d < 7; d += 1) w.tasks[d] = planTasks(state, templateId, d);
  return w;
}

/** A week springs into existence the moment something is scheduled into it.
 *  It inherits the template of the most recent earlier week. Mutates `state`. */
export function ensureWeek(state: AppState, mondayIso: string): string {
  const id = isoWeekId(parseISO(mondayIso));
  if (!state.weeks[id]) {
    const earlier = Object.keys(state.weeks).sort().filter((x) => x < id).pop();
    const templateId = earlier ? state.weeks[earlier].templateId : 'general';
    state.weeks[id] = createWeek(state, mondayIso, templateId);
  }
  return id;
}

export function weekIds(state: AppState): string[] {
  return Object.keys(state.weeks).sort();
}

/** The immediately preceding calendar week, if it exists in the store. */
export function prevWeekIdOf(state: AppState, weekId: string): string | null {
  const w = state.weeks[weekId];
  if (!w) return null;
  const pid = previousWeekId(w.monday);
  return state.weeks[pid] ? pid : null;
}

/** Any habit that is active but missing from this week's plan gets one. */
export function ensurePlanCoverage(state: AppState, weekId: string): boolean {
  const w = state.weeks[weekId];
  if (!w) return false;
  let changed = false;
  for (const h of state.habits) {
    if (h.active && !w.habitPlan[h.id]) {
      w.habitPlan[h.id] = h.def ? clonePlan(h.def) : countPlan(3);
      changed = true;
    }
  }
  return changed;
}

function copyShop(groups: ShopGroup[]): ShopGroup[] {
  return groups.map((g) => ({
    id: uid('g'),
    name: g.name,
    items: g.items.map((it) => ({ id: uid('i'), text: it.text, done: false })),
  }));
}

/** The shopping list copies forward from last week the first time you open it.
 *  After that it is this week's list and nothing else touches it. */
export function shopListFor(state: AppState, weekId: string): ShopGroup[] {
  const w = state.weeks[weekId];
  if (!w) return [];
  if (!Array.isArray(w.shop)) {
    const pid = prevWeekIdOf(state, weekId);
    const prev = pid ? state.weeks[pid] : null;
    w.shop = prev && Array.isArray(prev.shop) ? copyShop(prev.shop) : [];
    w.shopCopiedFrom = prev && prev.shop && prev.shop.length ? pid : null;
  }
  return w.shop;
}

export interface MoveResult {
  weekId: string;
  dayIndex: number;
  sectionId: string;
}

/** Reschedule a task to any date, creating the target week if needed.
 *  The task keeps its section; if that heading is gone it lands in the first one. */
export function moveTask(
  state: AppState,
  fromWeekId: string,
  fromDay: number,
  taskId: string,
  targetDateIso: string,
): MoveResult | null {
  const from = state.weeks[fromWeekId];
  if (!from) return null;
  const arr = from.tasks[fromDay] ?? [];
  const i = arr.findIndex((t) => t.id === taskId);
  if (i < 0) return null;

  const target = parseISO(targetDateIso);
  const mon = mondayOf(target);
  const weekId = ensureWeek(state, isoOf(mon));
  const dayIndex = Math.round((target.getTime() - mon.getTime()) / 86400000);

  const [task] = arr.splice(i, 1);
  if (!state.sections.some((s) => s.id === task.sec)) {
    task.sec = state.sections[0]?.id ?? 's1';
  }
  const dest = state.weeks[weekId];
  dest.tasks[dayIndex] = [...(dest.tasks[dayIndex] ?? []), task];
  return { weekId, dayIndex, sectionId: task.sec };
}

/** Make this week the definition of its template: the habit plan as it now stands,
 *  and the plan tasks as they now stand. Other weeks already built from the old
 *  version keep what they have — only weeks created afterwards follow the new one. */
export function saveWeekAsTemplate(state: AppState, weekId: string): boolean {
  const w = state.weeks[weekId];
  if (!w) return false;
  const tpl = state.templates?.[w.templateId];
  if (!tpl) return false;

  // Store the plans whole. A weekly count cannot say Mon/Wed/Fri, and flattening
  // it would quietly lose which days.
  const plans: Record<string, HabitPlan> = {};
  for (const h of state.habits) {
    if (!h.active) continue;
    const plan = w.habitPlan[h.id];
    if (plan) plans[h.id] = clonePlan(plan);
  }
  tpl.plans = plans;

  const secIndex = new Map(state.sections.map((sec, i) => [sec.id, i]));
  tpl.plan = [0, 1, 2, 3, 4, 5, 6].map((d) =>
    (w.tasks[d] ?? [])
      .filter((x) => x.plan && x.state !== 'dropped')
      .map((x) => [x.text, x.track ?? null, secIndex.get(x.sec) ?? 0] as PlanEntry));

  return true;
}

/** What a template currently asks of one habit, whether it was written as a
 *  count or edited into a full plan. */
export function templatePlanFor(state: AppState, templateId: string, habitId: string): HabitPlan {
  const t = state.templates[templateId];
  const stored = t?.plans?.[habitId];
  if (stored) return clonePlan(stored);
  const n = t?.targets?.[habitId];
  if (n !== undefined) return n >= 7 ? everyPlan() : countPlan(n);
  const h = state.habits.find((x) => x.id === habitId);
  return h?.def ? clonePlan(h.def) : countPlan(3);
}

/** Edit a template directly, without going anywhere near a week. */
export function setTemplatePlan(
  state: AppState, templateId: string, habitId: string, plan: HabitPlan,
): void {
  const t = state.templates[templateId];
  if (!t) return;
  t.plans ??= {};
  t.plans[habitId] = clonePlan(plan);
  delete t.targets[habitId];
}

/** A copy of an existing template, under a new id, placed after it in the picker. */
export function duplicateTemplate(state: AppState, fromId: string, name: string): string | null {
  const src = state.templates[fromId];
  if (!src) return null;
  const id = uid('tpl');
  state.templates[id] = { ...JSON.parse(JSON.stringify(src)), id, name };
  const at = state.templateOrder.indexOf(fromId);
  state.templateOrder.splice(at < 0 ? state.templateOrder.length : at + 1, 0, id);
  return id;
}

/** Weeks already using it keep working — templateOf falls back — but it leaves
 *  the picker. Refuses to remove the last one. */
export function deleteTemplate(state: AppState, id: string): boolean {
  if (state.templateOrder.length <= 1) return false;
  delete state.templates[id];
  state.templateOrder = state.templateOrder.filter((x) => x !== id);
  return true;
}

export function nextWeekMonday(mondayIso: string, delta: number): string {
  return isoOf(addDays(parseISO(mondayIso), delta * 7));
}
