import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/state';
import { applyTemplate, sectionsOf, templateChange } from '../src/domain/week';
import { habitDone, weekScore } from '../src/domain/scoring';
import type { AppState } from '../src/domain/types';

const TUE = new Date(2026, 8, 15);
const WEEK = '2026-W38';

const fresh = (id = 'run'): AppState => createInitialState(TUE, id);
const tasksOn = (s: AppState, d: number) => s.weeks[WEEK].tasks[d] ?? [];

test('switching template keeps every habit tick, including ones it no longer asks for', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  w.habits[0] = { guitar: true, journal: true };
  w.habits[1] = { guitar: true };

  applyTemplate(s, WEEK, 'deload');

  assert.deepEqual(w.habits[0], { guitar: true, journal: true });
  assert.deepEqual(w.habits[1], { guitar: true });
  assert.equal(habitDone(w, 'guitar'), 2, 'and they still count towards the week');
});

test('a habit the new template drops keeps what was already done', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  w.habitPlan.guitar = { mode: 'count', days: [], n: 3 };
  w.habits[0] = { guitar: true };

  // Take it out of the template entirely, then switch onto that template.
  delete s.templates.deload.targets.guitar;
  s.templates.deload.plans = { ...(s.templates.deload.plans ?? {}) };
  delete s.templates.deload.plans.guitar;
  s.habits = s.habits.filter((h) => h.id !== 'guitar').concat(
    { id: 'guitar', name: 'Guitar practice', short: 'Guitar', active: true },
  );
  applyTemplate(s, WEEK, 'deload');

  assert.equal(w.habits[0].guitar, true, 'the tick is still there');
  assert.equal(habitDone(w, 'guitar'), 1, 'and it is still counted as done');
});

test('a ticked scaffold task survives the switch', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  const first = tasksOn(s, 1).find((x) => x.plan);
  assert.ok(first, 'the run template lays down scaffold tasks');
  first.state = 'done';
  const text = first.text;

  applyTemplate(s, WEEK, 'deload');

  const still = tasksOn(s, 1).find((x) => x.text === text);
  assert.ok(still, 'work already done is not thrown away');
  assert.equal(still.state, 'done');
});

test('nothing on the week is thrown away, ticked or not', () => {
  const s = fresh('run');
  const before = tasksOn(s, 1).map((x) => x.text);
  assert.ok(before.length > 0);
  applyTemplate(s, WEEK, 'deload');
  const after = tasksOn(s, 1).map((x) => x.text);
  for (const text of before) {
    assert.ok(after.includes(text), `${text} was still a thing you meant to do`);
  }
});

test('the new template adds its own on top', () => {
  const s = fresh('deload');
  const before = tasksOn(s, 1).length;
  applyTemplate(s, WEEK, 'run');
  assert.ok(tasksOn(s, 1).length >= before, 'the week grows rather than being rebuilt');
});

test('tasks typed in by hand are never touched', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  w.tasks[2] = [...(w.tasks[2] ?? []),
    { id: 'mine', text: 'Ring the dentist', state: 'open', plan: false, track: null, sec: 's1' }];

  applyTemplate(s, WEEK, 'general');

  assert.ok(tasksOn(s, 2).some((x) => x.id === 'mine'));
});

test('the same task is not laid down twice when it is already there and done', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  const same = tasksOn(s, 1).find((x) => x.plan);
  assert.ok(same);
  same.state = 'done';

  applyTemplate(s, WEEK, 'run');   // the template it is already on

  const matches = tasksOn(s, 1).filter((x) => x.text === same.text);
  assert.equal(matches.length, 1, 'kept once, not added again alongside itself');
});

test('the plan changes to the new template', () => {
  const s = fresh('run');
  applyTemplate(s, WEEK, 'deload');
  assert.equal(s.weeks[WEEK].templateId, 'deload');
});

test('a switch onto a template that does not exist changes nothing', () => {
  const s = fresh('run');
  assert.equal(applyTemplate(s, WEEK, 'nope'), false);
  assert.equal(s.weeks[WEEK].templateId, 'run');
});

test('the change is described before it happens', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  const one = tasksOn(s, 1).find((x) => x.plan);
  assert.ok(one);
  one.state = 'done';
  w.tasks[2] = [...(w.tasks[2] ?? []),
    { id: 'mine', text: 'Ring the dentist', state: 'open', plan: false, track: null, sec: 's1' }];
  w.habits[0] = { guitar: true };

  const c = templateChange(s, WEEK, 'deload');
  assert.ok(c);
  assert.equal(c.keptDone, 1);
  assert.ok(c.keptOwn >= 1);
  assert.ok(c.adds > 0, 'and says how many it would add');
  assert.deepEqual(c.removedButDone.filter((id) => id === 'guitar'), []);
});

test('a template can be all habits without scoring zero for having no tasks', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  s.templates.run.weights = { habits: 1, tasks: 0 };
  for (let d = 0; d < 7; d += 1) w.tasks[d] = [];
  // Every habit the week asks for, done.
  for (let d = 0; d < 7; d += 1) {
    w.habits[d] = Object.fromEntries(Object.keys(w.habitPlan).map((id) => [id, true]));
  }
  assert.ok(weekScore(s, w, TUE).banked > 0.9);
});

test('a template can be all tasks without the habits side dragging it down', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  s.templates.run.weights = { habits: 0, tasks: 1 };
  w.habitPlan = {};
  for (let d = 0; d < 7; d += 1) {
    w.tasks[d] = (w.tasks[d] ?? []).map((x) => ({ ...x, state: 'done' as const }));
  }
  assert.equal(weekScore(s, w, TUE).banked, 1);
});

test('a week asking nothing at all scores zero rather than full marks', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  w.habitPlan = {};
  for (let d = 0; d < 7; d += 1) w.tasks[d] = [];
  assert.equal(weekScore(s, w, TUE).banked, 0);
});

test('a week takes its headings from its template', () => {
  const s = fresh('run');
  s.templates.deload.sections = [
    { id: 'am', name: 'Morning' }, { id: 'pm', name: 'Rest of the day' },
  ];
  applyTemplate(s, WEEK, 'deload');
  assert.deepEqual(sectionsOf(s, WEEK).map((x) => x.name), ['Morning', 'Rest of the day']);
});

test('a task filed under a heading the new template lacks is rehomed, not lost', () => {
  const s = fresh('run');
  const w = s.weeks[WEEK];
  const gone = s.sections[2].id;
  w.tasks[3] = [{ id: 'mine', text: 'Stretch', state: 'open', plan: false, track: null, sec: gone }];
  s.templates.deload.sections = [{ id: 'am', name: 'Morning' }];

  applyTemplate(s, WEEK, 'deload');

  const still = (s.weeks[WEEK].tasks[3] ?? []).find((x) => x.id === 'mine');
  assert.ok(still, 'the task is still there');
  assert.equal(still.sec, 'am', 'under the only heading that now exists');
});

test('a template without its own headings uses the standard ones', () => {
  const s = fresh('run');
  delete s.templates.run.sections;
  assert.deepEqual(sectionsOf(s, WEEK).map((x) => x.name), s.sections.map((x) => x.name));
});

test('editing a template’s headings does not disturb a week already built', () => {
  const s = fresh('run');
  const before = sectionsOf(s, WEEK).map((x) => x.name);
  s.templates.run.sections = [{ id: 'one', name: 'All day' }];
  assert.deepEqual(sectionsOf(s, WEEK).map((x) => x.name), before,
    'the week kept the copy it was built with');
});
