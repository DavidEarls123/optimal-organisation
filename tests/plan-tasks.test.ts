import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/state';
import {
  applyTemplate, clearWeekTasks, copyTemplateInto, hideEvent, planFromList, planTaskList,
  planTasks, showEvents,
} from '../src/domain/week';
import type { PlanEntry } from '../src/domain/types';

const TUE = new Date(2026, 8, 15);
const empty = (): PlanEntry[][] => [[], [], [], [], [], [], []];

test('a task written on every day reads as one task on seven days', () => {
  const plan = empty();
  for (let d = 0; d < 7; d += 1) plan[d].push(['Physio', null, 0]);
  const list = planTaskList(plan);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(list[0].text, 'Physio');
});

test('a task on two days reads as one task on those two', () => {
  const plan = empty();
  plan[1].push(['Long run', null, 1]);
  plan[5].push(['Long run', null, 1]);
  const list = planTaskList(plan);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].days, [1, 5]);
  assert.equal(list[0].si, 1);
});

test('the same words under a different heading stay two tasks', () => {
  const plan = empty();
  plan[0].push(['Stretch', null, 0]);
  plan[0].push(['Stretch', null, 2]);
  const list = planTaskList(plan);
  assert.equal(list.length, 2, 'morning stretch and evening stretch are not one thing');
  assert.deepEqual(list.map((x) => x.si), [0, 2]);
});

test('a tag a template was written with is not carried into the week', () => {
  // Older templates have tags written into their plans. They describe what the
  // week is for on its card; they are not put on your tasks.
  const plan = empty();
  plan[0].push(['Session', 'gym', 0]);
  const list = planTaskList(plan);
  assert.equal(list.length, 1);
  assert.deepEqual(planFromList(list)[0], [['Session', null, 0]]);
});

test('order follows where each task first appears', () => {
  const plan = empty();
  plan[2].push(['Third', null, 0]);
  plan[0].push(['First', null, 0]);
  plan[1].push(['Second', null, 0]);
  plan[3].push(['First', null, 0]);
  assert.deepEqual(planTaskList(plan).map((x) => x.text), ['First', 'Second', 'Third']);
});

test('a scaffold survives being read out and written back', () => {
  const plan = empty();
  plan[0].push(['Physio', null, 0], ['Emails', null, 1]);
  plan[1].push(['Physio', null, 0]);
  plan[4].push(['Shop', null, 2], ['Physio', null, 0]);
  const back = planFromList(planTaskList(plan));
  // Same tasks on the same days, whatever order they come out in.
  for (let d = 0; d < 7; d += 1) {
    assert.deepEqual([...back[d]].sort(), [...plan[d]].sort(), `day ${d}`);
  }
});

test('a task on no days is dropped rather than written nowhere', () => {
  const back = planFromList([{ text: 'Someday', si: 0, days: [] }]);
  assert.deepEqual(back, empty());
});

test('a task with no name is dropped', () => {
  const back = planFromList([{ text: '   ', si: 0, days: [0, 1] }]);
  assert.deepEqual(back, empty());
});

test('a name is trimmed on the way in, so it matches itself later', () => {
  const back = planFromList([{ text: '  Physio  ', si: 0, days: [0] }]);
  assert.deepEqual(back[0], [['Physio', null, 0]]);
  assert.equal(planTaskList(back).length, 1);
});

test('a day that means nothing is ignored rather than growing the week', () => {
  const back = planFromList([{ text: 'Physio', si: 0, days: [0, 9, -2] }]);
  assert.equal(back.length, 7, 'still seven days');
  assert.equal(back[0].length, 1);
  assert.equal(back.reduce((a, x) => a + x.length, 0), 1, 'and nothing landed anywhere else');
});

test('an empty scaffold reads as no standard tasks', () => {
  assert.deepEqual(planTaskList(empty()), []);
});

test('what a template says goes on a day is what a day is built with', () => {
  const s = createInitialState(TUE, 'run');
  const id = Object.keys(s.templates)[0];
  s.templates[id].plan = planFromList([
    { text: 'Physio', si: 0, days: [0, 1, 2, 3, 4, 5, 6] },
    { text: 'Big shop', si: 0, days: [5] },
  ]);
  assert.deepEqual(planTasks(s, id, 2).map((x) => x.text), ['Physio'], 'Wednesday');
  assert.deepEqual(planTasks(s, id, 5).map((x) => x.text), ['Physio', 'Big shop'], 'Saturday');
});

test('a standard task lands under the heading it was given', () => {
  const s = createInitialState(TUE, 'run');
  const id = Object.keys(s.templates)[0];
  const secs = s.templates[id].sections ?? s.sections;
  s.templates[id].plan = planFromList([
    { text: 'Evening walk', si: secs.length - 1, days: [0] },
  ]);
  assert.equal(planTasks(s, id, 0)[0].sec, secs[secs.length - 1].id);
});

test('a heading that is no longer there falls back rather than vanishing', () => {
  const s = createInitialState(TUE, 'run');
  const id = Object.keys(s.templates)[0];
  s.templates[id].plan = planFromList([{ text: 'Orphan', track: null, si: 99, days: [0] }]);
  const made = planTasks(s, id, 0);
  assert.equal(made.length, 1);
  assert.ok(made[0].sec, 'it is filed somewhere real');
});

test('copying a template takes its shape and leaves its name behind', () => {
  const s = createInitialState(TUE, 'run');
  const [a, b] = Object.keys(s.templates);
  const into = s.templates[a];
  const from = s.templates[b];
  const out = copyTemplateInto(into, from);
  assert.equal(out.id, into.id, 'it is still the same template');
  assert.equal(out.name, into.name, 'and still called what it was called');
  assert.deepEqual(out.plan, from.plan, 'but it does what the other one does');
  assert.deepEqual(out.weights, from.weights);
  assert.equal(out.tag, from.tag);
});

test('a copied template can be edited without reaching back into the original', () => {
  const s = createInitialState(TUE, 'run');
  const [a, b] = Object.keys(s.templates);
  const from = s.templates[b];
  const was = JSON.parse(JSON.stringify(from.plan));
  const out = copyTemplateInto(s.templates[a], from);
  out.plan[0].push(['Something new', null, 0]);
  if (out.sections) out.sections[0].name = 'Changed';
  assert.deepEqual(from.plan, was, 'the one it was copied from is untouched');
});

test('clearing a week takes the tasks and leaves everything you recorded', () => {
  const s = createInitialState(TUE, 'run');
  const w = s.weeks['2026-W38'];
  w.habits[0] = { anything: true };
  w.complete[1] = true;
  const before = [0, 1, 2, 3, 4, 5, 6].reduce((a, d) => a + (w.tasks[d] ?? []).length, 0);
  assert.ok(before > 0, 'there was something to clear');

  assert.equal(clearWeekTasks(s, '2026-W38'), before, 'it says how much it took');
  for (let d = 0; d < 7; d += 1) assert.deepEqual(w.tasks[d], [], `day ${d}`);
  assert.deepEqual(w.habits[0], { anything: true }, 'the ticks stay');
  assert.equal(w.complete[1], true, 'and so does the day you marked done');
});

test('clearing a week that is not there changes nothing', () => {
  const s = createInitialState(TUE, 'run');
  assert.equal(clearWeekTasks(s, '2099-W01'), 0);
});

test('a cleared week takes only what the next template lays down', () => {
  const s = createInitialState(TUE, 'run');
  const other = Object.keys(s.templates).find((x) => x !== s.weeks['2026-W38'].templateId);
  assert.ok(other);
  clearWeekTasks(s, '2026-W38');
  applyTemplate(s, '2026-W38', other);
  const w = s.weeks['2026-W38'];
  for (let d = 0; d < 7; d += 1) {
    const wanted = planTasks(s, other, d).map((x) => x.text).sort();
    assert.deepEqual((w.tasks[d] ?? []).map((x) => x.text).sort(), wanted, `day ${d}`);
  }
});

test('hiding a calendar entry remembers it, and showing brings them all back', () => {
  const s = createInitialState(TUE, 'run');
  hideEvent(s, 'ev-1');
  hideEvent(s, 'ev-2');
  assert.deepEqual(s.hiddenEvents, ['ev-1', 'ev-2']);
  assert.equal(showEvents(s), 2);
  assert.deepEqual(s.hiddenEvents, []);
});

test('hiding the same entry twice does not remember it twice', () => {
  const s = createInitialState(TUE, 'run');
  hideEvent(s, 'ev-1');
  hideEvent(s, 'ev-1');
  assert.deepEqual(s.hiddenEvents, ['ev-1']);
});

test('an entry with no id is not hidden, because that would hide everything', () => {
  const s = createInitialState(TUE, 'run');
  hideEvent(s, '');
  assert.deepEqual(s.hiddenEvents ?? [], []);
});

test('the list of hidden entries does not grow without end', () => {
  const s = createInitialState(TUE, 'run');
  for (let i = 0; i < 600; i += 1) hideEvent(s, `ev-${i}`);
  assert.equal((s.hiddenEvents ?? []).length, 400);
  assert.equal((s.hiddenEvents ?? [])[399], 'ev-599', 'and it is the recent ones that stay');
});
