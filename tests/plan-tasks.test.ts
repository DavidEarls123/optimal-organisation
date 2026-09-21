import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/state';
import { planFromList, planTaskList, planTasks } from '../src/domain/week';
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
  plan[1].push(['Long run', 'run', 1]);
  plan[5].push(['Long run', 'run', 1]);
  const list = planTaskList(plan);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].days, [1, 5]);
  assert.equal(list[0].track, 'run');
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

test('the same words with a different tag stay two tasks', () => {
  const plan = empty();
  plan[0].push(['Session', 'gym', 0]);
  plan[0].push(['Session', 'run', 0]);
  assert.equal(planTaskList(plan).length, 2);
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
  const back = planFromList([{ text: 'Someday', track: null, si: 0, days: [] }]);
  assert.deepEqual(back, empty());
});

test('a task with no name is dropped', () => {
  const back = planFromList([{ text: '   ', track: null, si: 0, days: [0, 1] }]);
  assert.deepEqual(back, empty());
});

test('a name is trimmed on the way in, so it matches itself later', () => {
  const back = planFromList([{ text: '  Physio  ', track: null, si: 0, days: [0] }]);
  assert.deepEqual(back[0], [['Physio', null, 0]]);
  assert.equal(planTaskList(back).length, 1);
});

test('a day that means nothing is ignored rather than growing the week', () => {
  const back = planFromList([{ text: 'Physio', track: null, si: 0, days: [0, 9, -2] }]);
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
    { text: 'Physio', track: null, si: 0, days: [0, 1, 2, 3, 4, 5, 6] },
    { text: 'Big shop', track: null, si: 0, days: [5] },
  ]);
  assert.deepEqual(planTasks(s, id, 2).map((x) => x.text), ['Physio'], 'Wednesday');
  assert.deepEqual(planTasks(s, id, 5).map((x) => x.text), ['Physio', 'Big shop'], 'Saturday');
});

test('a standard task lands under the heading it was given', () => {
  const s = createInitialState(TUE, 'run');
  const id = Object.keys(s.templates)[0];
  const secs = s.templates[id].sections ?? s.sections;
  s.templates[id].plan = planFromList([
    { text: 'Evening walk', track: null, si: secs.length - 1, days: [0] },
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
