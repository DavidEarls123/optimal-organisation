import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState, emptyState, migrate } from '../src/domain/state';
import {
  countPlan, daysPlan, ensurePlanCoverage, ensureWeek, everyPlan,
  deleteTemplate, duplicateTemplate, moveTask, planFromTemplate, prevWeekIdOf,
  saveWeekAsTemplate, setTemplatePlan, shopListFor, templatePlanFor, templateSummary,
  templateTraining,
} from '../src/domain/week';
import {
  activeHabits, dayAllDone, dayOutstanding, elapsedDays, habitDone, habitTarget,
  habitDayStatus, planLabel, plannedOn, scheduledOn, streak, templateOf,
  trackWeekCount, watchCount, weekScore,
} from '../src/domain/scoring';
import { isoWeekId, mondayOf, isoOf, daysUntil, previousWeekId } from '../src/domain/dates';

const TUE = new Date(2026, 8, 15);            // Tue 15 Sep 2026, in week 38
const WEEK38 = '2026-W38';

function fresh(templateId = 'run') {
  const s = createInitialState(TUE, templateId);
  return s;
}

test('a fresh state has exactly this week, on the chosen template', () => {
  const s = fresh();
  assert.deepEqual(Object.keys(s.weeks), [WEEK38]);
  assert.equal(s.weeks[WEEK38].monday, '2026-09-14');
  assert.equal(s.weeks[WEEK38].templateId, 'run');
});

test('template targets become the week plan; 7+ means every day', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  assert.equal(w.habitPlan.tabs_am.mode, 'every');
  assert.equal(w.habitPlan.recovery.mode, 'count');
  assert.equal(w.habitPlan.recovery.n, 5);
});

test('a habit the template ignores falls back to its own default (Read book = Mon-Fri)', () => {
  const s = fresh();
  const plan = s.weeks[WEEK38].habitPlan.read;
  assert.equal(plan.mode, 'days');
  assert.deepEqual(plan.days, [0, 1, 2, 3, 4]);
  assert.equal(planLabel(s.weeks[WEEK38], 'read'), 'Mo Tu We Th Fr');
});

test('an untracked day lowers the target rather than counting as a miss', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  assert.equal(habitTarget(w, 'tabs_am'), 7);
  w.untracked[4] = true;                       // Friday off
  assert.equal(habitTarget(w, 'tabs_am'), 6);
  assert.equal(scheduledOn(w, 'tabs_am', 4), false);
});

test('untracked days also shrink a chosen-days target', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.habitPlan.meditate = daysPlan([0, 2, 4, 6]);
  assert.equal(habitTarget(w, 'meditate'), 4);
  w.untracked[4] = true;                       // Friday was one of the chosen days
  assert.equal(habitTarget(w, 'meditate'), 3);
});

test('a count target can never exceed the tracked days available', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.habitPlan.guitar = countPlan(7);
  [1, 2, 3].forEach((d) => { w.untracked[d] = true; });
  assert.equal(habitTarget(w, 'guitar'), 4);
});

test('ticking a habit on an unscheduled day still counts towards the week', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.habitPlan.meditate = daysPlan([0, 2, 4, 6]);
  assert.equal(scheduledOn(w, 'meditate', 1), false);   // Tuesday not chosen
  w.habits[1] = { meditate: true };
  assert.equal(habitDone(w, 'meditate'), 1);
});

test('ticks on untracked days are ignored entirely', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.habits[4] = { tabs_am: true };
  assert.equal(habitDone(w, 'tabs_am'), 1);
  w.untracked[4] = true;
  assert.equal(habitDone(w, 'tabs_am'), 0);
});

test('pace measures against days elapsed; banked measures against the whole week', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.tasks = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  // Every habit ticked on Mon and Tue, which is all that has happened by Tuesday.
  const ids = activeHabits(s, w).map((h) => h.id);
  w.habits[0] = Object.fromEntries(ids.map((id) => [id, true]));
  w.habits[1] = Object.fromEntries(ids.map((id) => [id, true]));
  const sc = weekScore(s, w, TUE);
  assert.equal(sc.elapsed, 2);
  assert.ok(sc.pace > 0.9, `pace should be near perfect, got ${sc.pace}`);
  assert.ok(sc.banked < sc.pace, 'banked must trail pace mid-week');
});

test('a fully untracked week scores without dividing by zero', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  [0, 1, 2, 3, 4, 5, 6].forEach((d) => { w.untracked[d] = true; });
  const sc = weekScore(s, w, TUE);
  assert.equal(sc.trackedCount, 0);
  assert.ok(Number.isFinite(sc.pace));
  assert.ok(Number.isFinite(sc.banked));
});

test('a task is either done or still open — there is no third state', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.tasks[0] = [
    { id: 'a', text: 'done', state: 'done', plan: false, track: null, sec: 's1' },
    { id: 'b', text: 'not yet', state: 'open', plan: false, track: null, sec: 's1' },
  ];
  for (let d = 1; d < 7; d += 1) w.tasks[d] = [];
  const sc = weekScore(s, w, TUE);
  assert.equal(sc.tasksDone, 1);
  assert.equal(sc.tasksOpen, 1);
});

test('a deleted task leaves no trace in the score', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.tasks[0] = [
    { id: 'a', text: 'done', state: 'done', plan: false, track: null, sec: 's1' },
    { id: 'b', text: 'a mistake', state: 'open', plan: false, track: null, sec: 's1' },
  ];
  for (let d = 1; d < 7; d += 1) w.tasks[d] = [];
  w.tasks[0] = w.tasks[0].filter((t) => t.id !== 'b');
  const sc = weekScore(s, w, TUE);
  assert.equal(sc.tasksDone, 1);
  assert.equal(sc.tasksOpen, 0, 'deleting is not the same as failing');
});

test('a day is complete only when its scheduled habits and live tasks are done', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.tasks[1] = [
    { id: 'a', text: 'run', state: 'open', plan: true, track: 'run', sec: 's1' },
    { id: 'b', text: 'also open', state: 'open', plan: false, track: null, sec: 's1' },
  ];
  const ids = activeHabits(s, w).filter((h) => scheduledOn(w, h.id, 1)).map((h) => h.id);
  w.habits[1] = Object.fromEntries(ids.map((id) => [id, true]));
  assert.equal(dayOutstanding(s, w, 1), 2);
  assert.equal(dayAllDone(s, w, 1), false);
  w.tasks[1][1].state = 'done';
  w.tasks[1][0].state = 'done';
  assert.equal(dayAllDone(s, w, 1), true);
});

test('streaks count back over tracked days only', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.habits[0] = { tabs_am: true };
  w.habits[1] = { tabs_am: true };
  assert.equal(streak(w, 'tabs_am', TUE), 2);
  w.habits[0] = {};
  assert.equal(streak(w, 'tabs_am', TUE), 1);
});

test('a tagged task logs a session when ticked, and not before', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.tasks[1] = [{ id: 'r', text: 'Intervals', state: 'open', plan: true, track: 'run', sec: 's3' }];
  assert.equal(trackWeekCount(w, 'run'), 0);
  w.tasks[1][0].state = 'done';
  assert.equal(trackWeekCount(w, 'run'), 1);
  w.untracked[1] = true;
  assert.equal(trackWeekCount(w, 'run'), 0, 'untracked days drop out of the session count');
});

test('moving a task to another week creates that week and keeps the section', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.tasks[1] = [{ id: 't1', text: 'Intervals', state: 'open', plan: true, track: 'run', sec: 's3' }];
  const res = moveTask(s, WEEK38, 1, 't1', '2026-09-24');   // Thursday of week 39
  assert.ok(res);
  const r = res!;
  assert.equal(r.weekId, '2026-W39');
  assert.equal(r.dayIndex, 3);
  assert.equal(r.sectionId, 's3');
  assert.equal(s.weeks[WEEK38].tasks[1].length, 0);
  const moved = s.weeks['2026-W39'].tasks[3].find((t) => t.id === 't1');
  assert.ok(moved, 'task landed on Thursday of the new week');
  assert.equal(moved!.sec, 's3');
});

test('a moved task falls back to the first section when its heading is gone', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.tasks[1] = [{ id: 't1', text: 'Orphan', state: 'open', plan: false, track: null, sec: 'deleted' }];
  const res = moveTask(s, WEEK38, 1, 't1', '2026-09-17');
  assert.equal(res!.sectionId, s.sections[0].id);
});

test('a week created on demand inherits the previous template', () => {
  const s = fresh('taper');
  ensureWeek(s, '2026-09-21');
  assert.equal(s.weeks['2026-W39'].templateId, 'taper');
  assert.equal(s.weeks['2026-W39'].tasks[5][0].text, 'RACE DAY');
});

test('the shopping list copies forward once, then the weeks are independent', () => {
  const s = fresh();
  s.weeks[WEEK38].shop = [
    { id: 'g1', name: 'Breakfast', items: [{ id: 'i1', text: 'Oats', done: true }] },
  ];
  ensureWeek(s, '2026-09-21');
  const next = shopListFor(s, '2026-W39');
  assert.equal(next.length, 1);
  assert.equal(next[0].name, 'Breakfast');
  assert.equal(next[0].items[0].text, 'Oats');
  assert.equal(next[0].items[0].done, false, 'copied items start unticked');
  assert.equal(s.weeks['2026-W39'].shopCopiedFrom, WEEK38);

  next[0].items[0].text = 'Porridge oats';
  next.push({ id: 'g2', name: 'Lunch', items: [] });
  assert.equal(s.weeks[WEEK38].shop![0].items[0].text, 'Oats', 'last week is untouched');
  assert.equal(s.weeks[WEEK38].shop!.length, 1);
});

test('the shopping list does not re-copy on later reads', () => {
  const s = fresh();
  s.weeks[WEEK38].shop = [{ id: 'g1', name: 'Breakfast', items: [] }];
  ensureWeek(s, '2026-09-21');
  shopListFor(s, '2026-W39');
  s.weeks['2026-W39'].shop!.length = 0;
  assert.equal(shopListFor(s, '2026-W39').length, 0);
});

test('watch counts tally a series across days and weeks', () => {
  const s = fresh();
  ensureWeek(s, '2026-09-21');
  s.weeks[WEEK38].watched[1] = ['w2'];
  s.weeks[WEEK38].watched[2] = ['w2', 'w1'];
  s.weeks['2026-W39'].watched[0] = ['w2'];
  assert.equal(watchCount(s, 'w2'), 3);
  assert.equal(watchCount(s, 'w1'), 1);
  assert.equal(watchCount(s, 'nope'), 0);
});

test('disabling a habit keeps its plan so re-enabling restores the same habit', () => {
  const s = fresh();
  const w = s.weeks[WEEK38];
  w.habitPlan.calories = countPlan(6);
  const calories = s.habits.find((h) => h.id === 'calories')!;
  calories.active = false;
  assert.ok(!activeHabits(s, w).some((h) => h.id === 'calories'));
  assert.equal(habitTarget(w, 'calories'), 6, 'the plan survives being switched off');
  calories.active = true;
  assert.ok(activeHabits(s, w).some((h) => h.id === 'calories'));
  assert.equal(w.habitPlan.calories.n, 6, 'and comes back exactly as it was');
});

test('a habit added later is given a plan in every week it is missing from', () => {
  const s = fresh();
  s.habits.push({ id: 'stretch', name: 'Stretch', short: 'Stretch', active: true });
  assert.equal(ensurePlanCoverage(s, WEEK38), true);
  assert.equal(s.weeks[WEEK38].habitPlan.stretch.n, 3);
  assert.equal(ensurePlanCoverage(s, WEEK38), false, 'second pass is a no-op');
});

test('previous week is found by date, not by insertion order', () => {
  const s = fresh();
  ensureWeek(s, '2026-09-28');                   // skip a week
  assert.equal(prevWeekIdOf(s, '2026-W40'), null);
  ensureWeek(s, '2026-09-21');
  assert.equal(prevWeekIdOf(s, '2026-W40'), '2026-W39');
  assert.equal(prevWeekIdOf(s, WEEK38), null);
});

test('migrate repairs a state saved before fields existed', () => {
  const old = {
    weeks: {
      '2026-W38': {
        monday: '2026-09-14', templateId: 'run', focus: '',
        habitPlan: { tabs_am: everyPlan() },
        habits: { 0: { tabs_am: true } },
        tasks: { 0: [{ id: 'a', text: 'Run', state: 'done', plan: true, sec: 'gone-section' }] },
      },
    },
  };
  const s = migrate(old as never)!;
  assert.ok(s);
  const t = s.weeks['2026-W38'].tasks[0][0];
  assert.equal(t.sec, s.sections[0].id, 'orphaned section is repaired');
  assert.equal(t.track, null, 'missing track becomes null');
  assert.deepEqual(s.weeks['2026-W38'].untracked, {});
  assert.deepEqual(s.weeks['2026-W38'].watched, {});
  assert.ok(s.habits.length > 0);
});

test('migrate refuses junk rather than corrupting a fresh install', () => {
  assert.equal(migrate(null), null);
  assert.equal(migrate({} as never), null);
  assert.equal(migrate({ weeks: undefined } as never), null);
});

test('date helpers hold at a year boundary', () => {
  assert.equal(isoWeekId(new Date(2027, 0, 1)), '2026-W53');
  assert.equal(isoOf(mondayOf(new Date(2027, 0, 1))), '2026-12-28');
  assert.equal(previousWeekId('2027-01-04'), '2026-W53');
  assert.equal(daysUntil('2026-09-24', TUE), 9);
  assert.equal(daysUntil('2026-09-15', TUE), 0);
  assert.equal(daysUntil('2026-09-14', TUE), -1);
});

test('saving a week as its template captures the plan and the tagged sessions', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK38];
  w.habitPlan.guitar = countPlan(6);
  w.habitPlan.recovery = everyPlan();
  w.tasks[1] = [
    { id: 'a', text: 'Intervals', state: 'done', plan: true, track: 'run', sec: 's3' },
    { id: 'b', text: 'Typed in by hand', state: 'open', plan: false, track: null, sec: 's1' },
  ];
  assert.equal(saveWeekAsTemplate(s, WEEK38), true);

  const tpl = s.templates.run;
  assert.equal(tpl.plans!.guitar.n, 6);
  assert.equal(tpl.plans!.recovery.mode, 'every');
  assert.deepEqual(tpl.plan[1], [['Intervals', 'run', 2]],
    'only planned tasks are kept, with their tag and section');
});

test('saving a template leaves weeks already built from it alone', () => {
  const s = fresh('run');
  ensureWeek(s, '2026-09-21');
  const before = JSON.parse(JSON.stringify(s.weeks['2026-W39'].habitPlan));
  s.weeks[WEEK38].habitPlan.guitar = countPlan(7);
  saveWeekAsTemplate(s, WEEK38);
  assert.deepEqual(s.weeks['2026-W39'].habitPlan, before);
});

test('a renamed template keeps working for the weeks that use it', () => {
  const s = fresh('run');
  s.templates.run.name = 'Marathon Block';
  const w = s.weeks[WEEK38];
  assert.equal(templateOf(s, w).name, 'Marathon Block');
  assert.equal(templateOf(s, w).weights.habits, 0.65, 'and keeps its weighting');
});

test('migrate seeds templates for a state saved before they were editable', () => {
  const s = migrate({
    weeks: {
      '2026-W38': {
        monday: '2026-09-14', templateId: 'run', focus: '',
        habitPlan: {}, habits: {}, tasks: {},
      },
    },
  } as never)!;
  assert.ok(s.templates.run, 'the built-ins are seeded in');
  assert.ok(s.templateOrder.includes('run'));
  assert.equal(s.templateOrder.every((id) => s.templates[id]), true,
    'the order never names a template that is not there');
});

test('a template can be edited directly, without touching any week', () => {
  const s = fresh('run');
  const before = JSON.parse(JSON.stringify(s.weeks[WEEK38].habitPlan));
  setTemplatePlan(s, 'run', 'guitar', countPlan(6));
  setTemplatePlan(s, 'run', 'meditate', daysPlan([0, 3]));
  assert.deepEqual(s.weeks[WEEK38].habitPlan, before, 'this week is untouched');

  ensureWeek(s, '2026-09-21');
  const next = s.weeks['2026-W39'].habitPlan;
  assert.equal(next.guitar.n, 6);
  assert.equal(next.meditate.mode, 'days');
  assert.deepEqual(next.meditate.days, [0, 3]);
});

test('templatePlanFor reads counts, edited plans and habit defaults alike', () => {
  const s = fresh('run');
  assert.equal(templatePlanFor(s, 'run', 'tabs_am').mode, 'every', 'a target of 7 reads as every day');
  assert.equal(templatePlanFor(s, 'run', 'recovery').n, 5, 'a count reads as a count');
  assert.equal(templatePlanFor(s, 'run', 'read').mode, 'days', 'and an unlisted habit falls to its own default');
  setTemplatePlan(s, 'run', 'recovery', daysPlan([1, 3, 5]));
  assert.deepEqual(templatePlanFor(s, 'run', 'recovery').days, [1, 3, 5], 'an edit wins over the count');
});

test('saving a week to its template keeps chosen days at template level now', () => {
  const s = fresh('run');
  s.weeks[WEEK38].habitPlan.meditate = daysPlan([0, 2, 4]);
  saveWeekAsTemplate(s, WEEK38);
  assert.deepEqual(s.templates.run.plans!.meditate.days, [0, 2, 4]);
  ensureWeek(s, '2026-09-21');
  assert.deepEqual(s.weeks['2026-W39'].habitPlan.meditate.days, [0, 2, 4]);
});

test('duplicating a template copies it and lands next to the original', () => {
  const s = fresh('run');
  setTemplatePlan(s, 'run', 'guitar', countPlan(6));
  const id = duplicateTemplate(s, 'run', 'Marathon Peak')!;
  assert.ok(id);
  assert.equal(s.templates[id].name, 'Marathon Peak');
  assert.equal(templatePlanFor(s, id, 'guitar').n, 6, 'it starts as a copy');
  assert.equal(s.templateOrder[s.templateOrder.indexOf('run') + 1], id);

  setTemplatePlan(s, id, 'guitar', countPlan(2));
  assert.equal(templatePlanFor(s, 'run', 'guitar').n, 6, 'and then goes its own way');
});

test('deleting a template leaves the weeks using it intact', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK38];
  assert.equal(deleteTemplate(s, 'run'), true);
  assert.ok(!s.templateOrder.includes('run'));
  assert.equal(w.templateId, 'run', 'the week still names it');
  assert.ok(templateOf(s, w), 'and still scores, by falling back');
  assert.ok(Number.isFinite(weekScore(s, w, TUE).pace));
});

test('the last template cannot be deleted', () => {
  const s = fresh('run');
  for (const id of [...s.templateOrder]) deleteTemplate(s, id);
  assert.equal(s.templateOrder.length, 1, 'one always survives');
});

test('the template summary follows edits, so a preview cannot go stale', () => {
  const s = fresh('run');
  const before = templateSummary(s, 'run');
  assert.equal(before.counts.recovery, 5, 'read from the template targets');

  setTemplatePlan(s, 'run', 'recovery', countPlan(2));
  const after = templateSummary(s, 'run');
  assert.equal(after.counts.recovery, 2, 'and from an edited plan');
  assert.equal(after.weeklyTicks, before.weeklyTicks - 3);

  setTemplatePlan(s, 'run', 'guitar', daysPlan([0, 3]));
  assert.equal(templateSummary(s, 'run').counts.guitar, 2, 'chosen days count as their length');
});

test('what the summary promises is what building a week delivers', () => {
  const s = fresh('run');
  setTemplatePlan(s, 'run', 'recovery', countPlan(2));
  setTemplatePlan(s, 'run', 'meditate', daysPlan([1, 3, 5]));
  const summary = templateSummary(s, 'run');

  ensureWeek(s, '2026-09-21');
  const w = s.weeks['2026-W39'];
  for (const h of s.habits.filter((x) => x.active)) {
    assert.equal(habitTarget(w, h.id), summary.counts[h.id],
      `${h.id}: the card and the built week agree`);
  }
});

test('the training a template card shows is the training a week delivers', () => {
  const s = fresh('run');
  const shown = templateTraining(s, 'run');
  assert.ok(shown.length > 0, 'a run block lays down tagged sessions');

  ensureWeek(s, '2026-09-21');
  const w = s.weeks['2026-W39'];
  const built: Record<string, number> = {};
  for (let d = 0; d < 7; d += 1) {
    for (const task of w.tasks[d] ?? []) {
      if (task.track) built[task.track] = (built[task.track] ?? 0) + 1;
    }
  }
  assert.deepEqual(
    Object.fromEntries(shown.map((k) => [k.id, k.n])), built,
    'the card and the built week agree on every trackable',
  );
});

test('the template cards distinguish a run block from a deload', () => {
  const s = fresh('run');
  const runs = (id: string) => templateTraining(s, id).find((k) => k.id === 'run')?.n ?? 0;
  assert.ok(runs('run') > runs('deload'), 'a run block runs more than a deload');
});

test('template training is listed in trackable order, and skips the unused', () => {
  const s = fresh('run');
  const shown = templateTraining(s, 'run').map((k) => k.id);
  const order = s.trackables.map((k) => k.id).filter((id) => shown.includes(id));
  assert.deepEqual(shown, order);
  assert.ok(shown.every((id) => templateTraining(s, 'run').find((k) => k.id === id)!.n > 0));
});

test('a habit owed any day this week does not hold the day open', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK38];
  w.tasks = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  // Everything pinned to Tuesday is done; only the flexible ones are outstanding.
  const pinned = activeHabits(s, w).filter((h) => plannedOn(w, h.id, 1)).map((h) => h.id);
  w.habits[1] = Object.fromEntries(pinned.map((id) => [id, true]));
  const flexible = activeHabits(s, w).filter((h) => habitDayStatus(w, h.id, 1) === 'anyday');
  assert.ok(flexible.length > 0, 'the run template has N-a-week habits');
  assert.equal(dayOutstanding(s, w, 1), 0);
  assert.equal(dayAllDone(s, w, 1), true);
});

test('a chosen-days habit only holds its own days open', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK38];
  w.tasks = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const h of s.habits) h.active = h.id === 'meditate';
  w.habitPlan = { meditate: daysPlan([0, 2, 4]) };

  assert.equal(habitDayStatus(w, 'meditate', 0), 'today');
  assert.equal(habitDayStatus(w, 'meditate', 1), 'off');
  assert.equal(dayOutstanding(s, w, 0), 1, 'Monday is one of its days');
  assert.equal(dayOutstanding(s, w, 1), 0, 'Tuesday is not');
  assert.equal(dayAllDone(s, w, 1), true);
});

test('an every-day habit holds every tracked day open', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK38];
  w.tasks = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const h of s.habits) h.active = h.id === 'tabs_am';
  w.habitPlan = { tabs_am: everyPlan() };
  for (let d = 0; d < 7; d += 1) assert.equal(dayOutstanding(s, w, d), 1, `day ${d}`);
  w.untracked[3] = true;
  assert.equal(habitDayStatus(w, 'tabs_am', 3), 'off', 'an untracked day asks nothing');
  assert.equal(dayOutstanding(s, w, 3), 0);
});

test('ticking a flexible habit still counts towards the week', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK38];
  assert.equal(habitDayStatus(w, 'recovery', 1), 'anyday');
  w.habits[1] = { recovery: true };
  assert.equal(habitDone(w, 'recovery'), 1, 'the weekly total is what it feeds');
  assert.equal(habitTarget(w, 'recovery'), 5);
});
