import type { AppState, HabitPlan, PlanEntry, ShopGroup, Task, Week, TripItem, Section } from './types';
import {
  SHOP_TEMPLATE, TEMPLATES, TRIP_BASE, TRIP_CATEGORIES, TRIP_TEMPLATES,
} from './catalogue';
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
  // A template's scaffold refers to its own headings, or the standard ones.
  const from = t.sections?.length ? t.sections : state.sections;
  const secs = from.length ? from : [{ id: 's1', name: 'Morning' }];
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
    at: {},
    readings: {},
    sections: (state.templates[templateId]?.sections ?? state.sections)
      .map((x) => ({ ...x })),
  };
  for (let d = 0; d < 7; d += 1) w.tasks[d] = planTasks(state, templateId, d);
  return w;
}

/** A week springs into existence the moment something is scheduled into it.
 *  It inherits the template of the most recent earlier week. Mutates `state`. */
export function ensureWeek(state: AppState, mondayIso: string): string {
  const id = isoWeekId(parseISO(mondayIso));
  if (!state.weeks[id]) {
    state.weeks[id] = createWeek(state, mondayIso, latestTemplateId(state));
  }
  return id;
}

/** The template the newest week is on — the one most recently decided. A week
 *  made now, whenever it falls, starts from that rather than from whatever
 *  happened to be running nearest to it in the calendar. It is changeable on
 *  the week itself either way. */
export function latestTemplateId(state: AppState): string {
  const ids = Object.keys(state.weeks).sort();
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const tid = state.weeks[ids[i]]?.templateId;
    if (tid && state.templates[tid]) return tid;
  }
  return state.templateOrder[0] ?? 'general';
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

/** A week's list is a fresh copy: same headings and same things written down,
 *  but nothing marked needed and nothing bought. Last week's shopping is not
 *  this week's shopping. */
function copyShop(groups: ShopGroup[]): ShopGroup[] {
  return groups.map((g) => ({
    id: uid('g'),
    name: g.name,
    items: g.items.map((it) => ({ id: uid('i'), text: it.text, need: false, done: false })),
  }));
}

/** The standing list, seeded from the built-in headings the first time. */
export function shopTemplateOf(state: AppState): ShopGroup[] {
  if (!Array.isArray(state.shopTemplate)) {
    state.shopTemplate = SHOP_TEMPLATE.map((g) => ({
      id: uid('g'),
      name: g.name,
      items: g.items.map((text) => ({ id: uid('i'), text, need: false, done: false })),
    }));
  }
  return state.shopTemplate;
}

/** This week's list. Built from the standing template the first time it is
 *  opened, or carried over from last week if there is one, so the things you
 *  always buy are already written down and you only decide what you need. */
export function shopListFor(state: AppState, weekId: string): ShopGroup[] {
  const w = state.weeks[weekId];
  if (!w) return [];
  if (!Array.isArray(w.shop)) {
    const pid = prevWeekIdOf(state, weekId);
    const prev = pid ? state.weeks[pid] : null;
    if (prev && Array.isArray(prev.shop) && prev.shop.length) {
      w.shop = copyShop(prev.shop);
      w.shopCopiedFrom = pid;
    } else {
      w.shop = copyShop(shopTemplateOf(state));
      w.shopCopiedFrom = null;
    }
  }
  return w.shop;
}

/** Adds anything in the standard list that the week is missing, under the
 *  right heading, creating the heading if it is not there. Never removes and
 *  never touches a tick.
 *
 *  `only` limits it to the headings named, because bringing the whole standard
 *  list in is rarely what you want after the first time — and doing it on
 *  every read meant a heading you deleted came straight back. */
export function mergeTemplateInto(
  list: ShopGroup[], template: ShopGroup[], only?: string[],
): number {
  const wanted = only ? new Set(only.map((n) => n.trim().toLowerCase())) : null;
  let added = 0;
  for (const src of template) {
    const key = src.name.trim().toLowerCase();
    if (wanted && !wanted.has(key)) continue;
    let into = list.find((g) => g.name.trim().toLowerCase() === key);
    if (!into) {
      into = { id: uid('g'), name: src.name, items: [] };
      list.push(into);
    }
    const have = new Set(into.items.map((i) => i.text.trim().toLowerCase()));
    for (const it of src.items) {
      const t = it.text.trim().toLowerCase();
      if (!t || have.has(t)) continue;
      have.add(t);
      into.items.push({ id: uid('i'), text: it.text, need: false, done: false });
      added += 1;
    }
  }
  return added;
}

/** What each heading of the standard list would add to this week: the heading
 *  name, how many new items it brings, and whether the week has it at all.
 *  Lets the picker say what a choice costs before it is made. */
export function templateOffer(
  list: ShopGroup[], template: ShopGroup[],
): { name: string; adds: number; isNew: boolean }[] {
  return template.map((src) => {
    const key = src.name.trim().toLowerCase();
    const into = list.find((g) => g.name.trim().toLowerCase() === key);
    const have = new Set((into?.items ?? []).map((i) => i.text.trim().toLowerCase()));
    const adds = src.items.filter((i) => {
      const t = i.text.trim().toLowerCase();
      return t && !have.has(t);
    }).length;
    return { name: src.name, adds, isNew: !into };
  });
}

/** How often each thing has actually been bought, across every week.
 *  Counted from the weeks themselves rather than a running total, so it can
 *  never drift from what happened. */
export function mostBought(state: AppState, limit = 12): { text: string; n: number }[] {
  const seen = new Map<string, { text: string; n: number }>();
  for (const w of Object.values(state.weeks)) {
    for (const g of w.shop ?? []) {
      for (const it of g.items ?? []) {
        if (!it.done) continue;
        const key = it.text.trim().toLowerCase();
        if (!key) continue;
        const row = seen.get(key);
        if (row) row.n += 1;
        else seen.set(key, { text: it.text.trim(), n: 1 });
      }
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.n - a.n || a.text.localeCompare(b.text))
    .slice(0, limit);
}

/** Things bought often that are not on this week's list at all. */
export function missingRegulars(state: AppState, weekId: string, min = 3): string[] {
  const list = state.weeks[weekId]?.shop ?? [];
  const have = new Set<string>();
  for (const g of list) for (const it of g.items) have.add(it.text.trim().toLowerCase());
  return mostBought(state, 50)
    .filter((x) => x.n >= min && !have.has(x.text.toLowerCase()))
    .slice(0, 6)
    .map((x) => x.text);
}

/** Puts the standing list back over this week's, keeping anything needed. */
export function resetShopFromTemplate(state: AppState, weekId: string): boolean {
  const w = state.weeks[weekId];
  if (!w) return false;
  w.shop = copyShop(shopTemplateOf(state));
  w.shopCopiedFrom = null;
  return true;
}

/** Everything marked needed, by heading, with empty headings left out —
 *  the list you actually walk round the shop with. */
export function shoppingList(groups: ShopGroup[]): ShopGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => it.need) }))
    .filter((g) => g.items.length > 0);
}

export function shopCounts(groups: ShopGroup[]): { need: number; got: number } {
  let need = 0;
  let got = 0;
  for (const g of groups) {
    for (const it of g.items) {
      if (!it.need) continue;
      need += 1;
      if (it.done) got += 1;
    }
  }
  return { need, got };
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
  // The heading it was filed under may not exist on the week it is going to.
  const there = sectionsOf(state, weekId);
  if (!there.some((x) => x.id === task.sec)) task.sec = there[0]?.id ?? 's1';
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

  const secIndex = new Map(sectionsOf(state, weekId).map((sec, i) => [sec.id, i]));
  tpl.plan = [0, 1, 2, 3, 4, 5, 6].map((d) =>
    (w.tasks[d] ?? [])
      .filter((x) => x.plan)
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

/** How many ticks a template asks of one habit in a week. */
export function templateCountFor(state: AppState, templateId: string, habitId: string): number {
  const p = templatePlanFor(state, templateId, habitId);
  return p.mode === 'every' ? 7 : p.mode === 'days' ? p.days.length : p.n;
}

/** Everything the picker card needs, read the same way the week is built, so the
 *  preview cannot drift from what picking it would actually do. */
export function templateSummary(state: AppState, templateId: string): {
  weeklyTicks: number; everyDay: number; counts: Record<string, number>;
} {
  let weeklyTicks = 0;
  let everyDay = 0;
  const counts: Record<string, number> = {};
  for (const h of state.habits) {
    if (!h.active) continue;
    const n = templateCountFor(state, templateId, h.id);
    counts[h.id] = n;
    weeklyTicks += n;
    if (n >= 7) everyDay += 1;
  }
  return { weeklyTicks, everyDay, counts };
}

/** How much tagged training a template lays down in a week, in the order the
 *  trackables are listed. This is what actually tells one template from
 *  another — a run block from a deload — so it is what the picker shows.
 *  It counts the plan the same way `planTasks` does, so the card cannot
 *  promise sessions that picking the template would not deliver. */
export function templateTraining(
  state: AppState, templateId: string,
): { id: string; name: string; n: number }[] {
  const t = state.templates?.[templateId] ?? TEMPLATES[templateId] ?? TEMPLATES.general;
  const n: Record<string, number> = {};
  for (let d = 0; d < 7; d += 1) {
    for (const [, track] of t.plan[d] ?? []) {
      if (track) n[track] = (n[track] ?? 0) + 1;
    }
  }
  return state.trackables
    .filter((k) => n[k.id])
    .map((k) => ({ id: k.id, name: k.name, n: n[k.id] }));
}

/** Nudges a task one place up or down through the day, crossing from one
 *  section into the next when it reaches the end of its own. The day reads as
 *  one list top to bottom, so that is how it reorders — moving a task out of
 *  Morning and into Afternoon should not need the reschedule panel.
 *
 *  Returns the section it ended up in, or null if it could not move (already
 *  at the very top or the very bottom of the day). */
export function nudgeTask(
  state: AppState, weekId: string, day: number, id: string, dir: -1 | 1,
): string | null {
  const w = state.weeks[weekId];
  if (!w) return null;
  const arr = w.tasks[day] ?? [];
  const secIds = sectionsOf(state, weekId).map((x) => x.id);
  if (!secIds.length) return null;

  // Read the day the way it is drawn: section by section, in order.
  const rank = (t: Task) => {
    const i = secIds.indexOf(t.sec);
    return i < 0 ? 0 : i;
  };
  const flat = [...arr].sort((a, b) => rank(a) - rank(b));

  const task = flat.find((t) => t.id === id);
  if (!task) return null;
  const si = rank(task);
  const inSec = flat.filter((t) => rank(t) === si);
  const at = inSec.indexOf(task);

  const neighbour = inSec[at + dir];
  if (neighbour) {
    const i = flat.indexOf(task);
    const j = flat.indexOf(neighbour);
    [flat[i], flat[j]] = [flat[j], flat[i]];
    w.tasks[day] = flat;
    return task.sec;
  }

  // At the edge of its section: step into the neighbouring one.
  const target = si + dir;
  if (target < 0 || target >= secIds.length) return null;
  task.sec = secIds[target];

  const rest = flat.filter((t) => t !== task);
  // Going up lands at the bottom of the section above, going down at the top
  // of the one below, so the task keeps moving one place at a time.
  const idx = dir === -1
    ? rest.findIndex((t) => rank(t) > target)
    : rest.findIndex((t) => rank(t) >= target);
  rest.splice(idx < 0 ? rest.length : idx, 0, task);
  w.tasks[day] = rest;
  return task.sec;
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

/** What changing a week's template would do, so it can be said out loud before
 *  it happens rather than discovered afterwards. */
export interface TemplateChange {
  /** Tasks the new template would add that are not already on the week. */
  adds: number;
  /** Tasks already ticked. Kept, like everything else. */
  keptDone: number;
  /** Tasks still open. Kept, like everything else. */
  keptOwn: number;
  /** Habits the new plan asks for that the old one did not. */
  added: string[];
  /** Habits the old plan asked for that the new one does not. */
  removed: string[];
  /** Of those, the ones already ticked this week — kept, and still counted. */
  removedButDone: string[];
}

export function templateChange(
  state: AppState, weekId: string, templateId: string,
): TemplateChange | null {
  const w = state.weeks[weekId];
  if (!w) return null;
  const next = planFromTemplate(state, templateId);
  const before = new Set(Object.keys(w.habitPlan));
  const after = new Set(Object.keys(next));

  let adds = 0;
  let keptDone = 0;
  let keptOwn = 0;
  const here = new Set<string>();
  for (let d = 0; d < 7; d += 1) {
    for (const x of w.tasks[d] ?? []) {
      here.add(`${d}:${x.text.trim().toLowerCase()}`);
      if (x.state === 'done') keptDone += 1;
      else keptOwn += 1;
    }
  }
  // Nothing is dropped any more; what changes is what gets added.
  for (let d = 0; d < 7; d += 1) {
    for (const x of planTasks(state, templateId, d)) {
      if (!here.has(`${d}:${x.text.trim().toLowerCase()}`)) adds += 1;
    }
  }

  const removed = [...before].filter((id) => !after.has(id));
  return {
    adds,
    keptDone,
    keptOwn,
    added: [...after].filter((id) => !before.has(id)),
    removed,
    removedButDone: removed.filter((id) => habitTicks(w, id) > 0),
  };
}

function habitTicks(w: Week, habitId: string): number {
  let n = 0;
  for (const map of Object.values(w.habits ?? {})) if (map?.[habitId]) n += 1;
  return n;
}

/** Puts a week on a different template. The template is a set of presets, not
 *  a reset: it changes what is asked of you from here, and takes nothing away
 *  that you have already done.
 *
 *  Ticks are never touched — including ticks for habits the new template does
 *  not ask for. Doing something and then changing your mind about whether it
 *  was required does not un-do it. Scaffold tasks you have ticked stay for the
 *  same reason; only the ones still sitting open are swapped for the new
 *  template's, and anything you typed in yourself is left alone. */
export function applyTemplate(state: AppState, weekId: string, templateId: string): boolean {
  const w = state.weeks[weekId];
  if (!w || !state.templates[templateId]) return false;

  w.templateId = templateId;
  w.habitPlan = planFromTemplate(state, templateId);
  // Take the new template's headings, and rehome any task filed under one it
  // does not have rather than leaving it drawn nowhere.
  const next = (state.templates[templateId]?.sections ?? state.sections).map((x) => ({ ...x }));
  w.sections = next;
  const ok = new Set(next.map((x) => x.id));
  for (let d = 0; d < 7; d += 1) {
    for (const x of w.tasks[d] ?? []) {
      if (!ok.has(x.sec)) x.sec = next[0]?.id ?? 's1';
    }
  }

  for (let d = 0; d < 7; d += 1) {
    const had = w.tasks[d] ?? [];
    // Nothing is thrown away. Changing template changes what the week asks of
    // you, not what is written on it — a task you put there, or one an earlier
    // template suggested and you kept, is still a thing you meant to do.
    const already = new Set(had.map((x) => x.text.trim().toLowerCase()));
    const fresh = planTasks(state, templateId, d)
      .filter((x) => !already.has(x.text.trim().toLowerCase()));
    w.tasks[d] = [...fresh, ...had];
  }
  return true;
}

/** The standing trip checklist: the things you do for every trip, whatever
 *  kind it is. Seeded from the built-in list the first time, editable after. */
export function tripTemplateOf(state: AppState): Record<string, string[]> {
  if (!state.tripTemplate || typeof state.tripTemplate !== 'object') {
    state.tripTemplate = Object.fromEntries(
      TRIP_CATEGORIES.map((cat) => [cat, [...(TRIP_BASE[cat] ?? [])]]),
    );
  }
  for (const cat of TRIP_CATEGORIES) {
    if (!Array.isArray(state.tripTemplate[cat])) state.tripTemplate[cat] = [];
  }
  return state.tripTemplate;
}

/** A new trip's checklist: your standing list, plus whatever that kind of trip
 *  adds on top. The kind's extras are not editable — they are the point of
 *  picking a kind — but nothing stops you deleting them once the trip exists. */
export function buildTripItems(state: AppState, tplId: string): TripItem[] {
  const base = tripTemplateOf(state);
  const kind = TRIP_TEMPLATES[tplId] ?? TRIP_TEMPLATES.weekend;
  const out: TripItem[] = [];
  for (const cat of TRIP_CATEGORIES) {
    const seen = new Set<string>();
    for (const text of [...(base[cat] ?? []), ...(kind.extra[cat] ?? [])]) {
      const key = text.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ id: uid('c'), cat, text, done: false });
    }
  }
  return out;
}

/** Trips and countdowns falling on a given date, for marking up a day. */
export function marksOn(state: AppState, dateIso: string): {
  trips: string[]; events: string[];
} {
  return {
    trips: state.trips
      .filter((x) => x.start <= dateIso && dateIso <= x.end)
      .map((x) => x.name),
    events: state.events.filter((x) => x.date === dateIso).map((x) => x.name),
  };
}

/** The day read the way it is drawn: section by section, in order. */
export function orderedTasks(state: AppState, weekId: string, day: number): Task[] {
  const w = state.weeks[weekId];
  if (!w) return [];
  const secIds = sectionsOf(state, weekId).map((x) => x.id);
  const all = w.tasks[day] ?? [];
  // Exactly what the day draws, section by section and ticked work sunk
  // inside each. A drop index counted against any other order points at a
  // different row than the one under your finger.
  const out: Task[] = [];
  for (const id of secIds) out.push(...sortForDisplay(all.filter((x) => x.sec === id)));
  const known = new Set(secIds);
  out.push(...sortForDisplay(all.filter((x) => !known.has(x.sec))));
  return out;
}

/** Drops a task at a position in that drawn order, taking the section of
 *  wherever it lands. Dragging something into the middle of Afternoon makes it
 *  an afternoon task; there is no separate step for that.
 *
 *  `toIndex` is an index into the order *without* the dragged task, which is
 *  what a list being dragged through actually looks like. */
export function placeTask(
  state: AppState, weekId: string, day: number, id: string, toIndex: number,
): string | null {
  const w = state.weeks[weekId];
  if (!w) return null;
  const secIds = sectionsOf(state, weekId).map((x) => x.id);
  if (!secIds.length) return null;

  const flat = orderedTasks(state, weekId, day);
  const task = flat.find((t) => t.id === id);
  if (!task) return null;

  const rest = flat.filter((t) => t !== task);
  const at = Math.max(0, Math.min(rest.length, Math.round(toIndex)));

  // Take the section of the neighbour above, or of the one below when landing
  // at the very top. With nothing either side, nothing moves sections.
  const above = rest[at - 1];
  const below = rest[at];
  const sec = above ? above.sec : below ? below.sec : task.sec;
  task.sec = secIds.includes(sec) ? sec : secIds[0];

  rest.splice(at, 0, task);
  w.tasks[day] = rest;
  return task.sec;
}

/** The headings a week is split into: its own if it has them, otherwise its
 *  template's, otherwise the app's standard three. Everything that draws or
 *  files a task goes through this, so there is one answer. */
export function sectionsOf(state: AppState, weekId: string): Section[] {
  const w = state.weeks[weekId];
  if (w?.sections?.length) return w.sections;
  const tpl = w ? (state.templates[w.templateId] ?? TEMPLATES[w.templateId]) : null;
  if (tpl?.sections?.length) return tpl.sections;
  return state.sections;
}

/** A section's tasks in the order they are drawn: still to do at the top in
 *  the order you put them, then the done pile with the most recently ticked
 *  first — so a task you finish drops to the top of what is finished, and the
 *  first thing you did that day ends up at the very bottom. */
export function sortForDisplay(tasks: Task[]): Task[] {
  const open = tasks.filter((x) => x.state !== 'done');
  const done = tasks
    .filter((x) => x.state === 'done')
    .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return [...open, ...done];
}

/** The days a task can be moved to from the strip: a window around the day it
 *  is on, with nothing already past offered — there is no point rescheduling
 *  something into a day that has gone. The date picker can still reach back
 *  when a past day is genuinely what you want. */
export function moveChoices(
  fromDateIso: string, todayIso: string, span = 3, size = 7,
): { iso: string; day: number; date: number; isFrom: boolean; isToday: boolean }[] {
  const from = parseISO(fromDateIso);
  const out: string[] = [];
  for (let i = -span; i <= span; i += 1) out.push(isoOf(addDays(from, i)));

  // With the whole window behind us, start again at today rather than the day
  // after it — today is the first day you can still move something to.
  let kept = out.filter((iso) => iso >= todayIso);
  if (!kept.length) kept = [todayIso];
  // Dropping the past shortens the window, so make it up at the far end and
  // the strip stays the same width whichever day you are on.
  while (kept.length < size) {
    kept.push(isoOf(addDays(parseISO(kept[kept.length - 1]), 1)));
  }
  kept = kept.slice(0, size);

  return kept.map((iso) => {
    const d = parseISO(iso);
    return {
      iso,
      day: (d.getDay() + 6) % 7,
      date: d.getDate(),
      isFrom: iso === fromDateIso,
      isToday: iso === todayIso,
    };
  });
}
