import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/domain/state';
import { nudgeTask, orderedTasks, placeTask } from '../src/domain/week';
import type { AppState, Task } from '../src/domain/types';

const TUE = new Date(2026, 8, 15);
const WEEK = '2026-W38';
const DAY = 1;

/** A day laid out by hand: three sections, tasks named for where they start. */
function laid(): { s: AppState; secs: string[] } {
  const s = createInitialState(TUE, 'run');
  const secs = s.sections.map((x) => x.id);
  s.weeks[WEEK].tasks[DAY] = [
    { id: 'a', text: 'a', state: 'open', plan: false, track: null, sec: secs[0] },
    { id: 'b', text: 'b', state: 'open', plan: false, track: null, sec: secs[0] },
    { id: 'c', text: 'c', state: 'open', plan: false, track: null, sec: secs[1] },
    { id: 'd', text: 'd', state: 'open', plan: false, track: null, sec: secs[2] },
  ] as Task[];
  return { s, secs };
}

const order = (s: AppState) => (s.weeks[WEEK].tasks[DAY] ?? []).map((t) => t.id).join('');
const secOf = (s: AppState, id: string) =>
  (s.weeks[WEEK].tasks[DAY] ?? []).find((t) => t.id === id)?.sec;

test('down inside a section swaps with the next task', () => {
  const { s } = laid();
  nudgeTask(s, WEEK, DAY, 'a', 1);
  assert.equal(order(s), 'bacd');
});

test('up inside a section swaps with the one above', () => {
  const { s } = laid();
  nudgeTask(s, WEEK, DAY, 'b', -1);
  assert.equal(order(s), 'bacd');
});

test('down off the end of a section moves into the top of the next', () => {
  const { s, secs } = laid();
  const landed = nudgeTask(s, WEEK, DAY, 'b', 1);
  assert.equal(landed, secs[1], 'reports the section it landed in');
  assert.equal(secOf(s, 'b'), secs[1]);
  assert.equal(order(s), 'abcd', 'it sits above c, at the top of that section');
});

test('up off the top of a section moves into the bottom of the one before', () => {
  const { s, secs } = laid();
  nudgeTask(s, WEEK, DAY, 'c', -1);
  assert.equal(secOf(s, 'c'), secs[0]);
  assert.equal(order(s), 'abcd', 'it sits below b, at the bottom of that section');
});

test('a task can be walked from the first section to the last', () => {
  const { s, secs } = laid();
  for (let i = 0; i < 6; i += 1) nudgeTask(s, WEEK, DAY, 'a', 1);
  assert.equal(secOf(s, 'a'), secs[2]);
});

test('the very top of the day will not move up', () => {
  const { s } = laid();
  assert.equal(nudgeTask(s, WEEK, DAY, 'a', -1), null);
  assert.equal(order(s), 'abcd');
});

test('the very bottom of the day will not move down', () => {
  const { s } = laid();
  assert.equal(nudgeTask(s, WEEK, DAY, 'd', 1), null);
  assert.equal(order(s), 'abcd');
});

test('it steps through a section that has nothing in it', () => {
  const { s, secs } = laid();
  s.weeks[WEEK].tasks[DAY] = (s.weeks[WEEK].tasks[DAY] ?? []).filter((t) => t.sec !== secs[1]);
  nudgeTask(s, WEEK, DAY, 'b', 1);
  assert.equal(secOf(s, 'b'), secs[1], 'lands in the empty middle section');
  nudgeTask(s, WEEK, DAY, 'b', 1);
  assert.equal(secOf(s, 'b'), secs[2], 'and carries on out of it');
  assert.equal(order(s), 'abd', 'still above the task already there');
});

test('no task by that id changes nothing', () => {
  const { s } = laid();
  assert.equal(nudgeTask(s, WEEK, DAY, 'nope', 1), null);
  assert.equal(order(s), 'abcd');
});

test('every task survives a nudge', () => {
  const { s } = laid();
  for (const dir of [1, 1, -1, 1, -1, -1] as const) nudgeTask(s, WEEK, DAY, 'b', dir);
  assert.equal((s.weeks[WEEK].tasks[DAY] ?? []).length, 4);
});

test('discarded tasks from an older version are cleared out on load', () => {
  const s = createInitialState(TUE, 'run');
  s.weeks[WEEK].tasks[DAY] = [
    { id: 'a', text: 'a', state: 'open', plan: false, track: null, sec: s.sections[0].id },
    { id: 'b', text: 'b', state: 'dropped', plan: false, track: null, sec: s.sections[0].id },
  ] as unknown as Task[];
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.ok(back);
  assert.deepEqual((back.weeks[WEEK].tasks[DAY] ?? []).map((t) => t.id), ['a']);
});

test('a task state that means nothing now is read as open, not dropped silently', () => {
  const s = createInitialState(TUE, 'run');
  s.weeks[WEEK].tasks[DAY] = [
    { id: 'a', text: 'a', state: 'weird', plan: false, track: null, sec: s.sections[0].id },
  ] as unknown as Task[];
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.equal(back?.weeks[WEEK].tasks[DAY]?.[0].state, 'open');
});

test('dragging a task down two places lands it there', () => {
  const { s } = laid();
  placeTask(s, WEEK, DAY, 'a', 2);
  assert.equal(order(s), 'bcad');
});

test('dragging to the top of the day makes it the first task', () => {
  const { s, secs } = laid();
  placeTask(s, WEEK, DAY, 'd', 0);
  assert.equal(order(s), 'dabc');
  assert.equal(secOf(s, 'd'), secs[0], 'and it belongs to the section it landed in');
});

test('dragging into another section changes its heading', () => {
  const { s, secs } = laid();
  placeTask(s, WEEK, DAY, 'a', 2);          // between c and d
  assert.equal(secOf(s, 'a'), secs[1], 'takes the section of the task above it');
});

test('dragging to the very bottom takes the last section', () => {
  const { s, secs } = laid();
  placeTask(s, WEEK, DAY, 'a', 3);
  assert.equal(order(s), 'bcda');
  assert.equal(secOf(s, 'a'), secs[2]);
});

test('an index past the end is clamped rather than losing the task', () => {
  const { s } = laid();
  placeTask(s, WEEK, DAY, 'a', 99);
  assert.equal(order(s), 'bcda');
  assert.equal((s.weeks[WEEK].tasks[DAY] ?? []).length, 4);
});

test('a negative index is clamped to the top', () => {
  const { s } = laid();
  placeTask(s, WEEK, DAY, 'c', -4);
  assert.equal(order(s), 'cabd');
});

test('dropping a task where it already is changes nothing', () => {
  const { s, secs } = laid();
  placeTask(s, WEEK, DAY, 'b', 1);
  assert.equal(order(s), 'abcd');
  assert.equal(secOf(s, 'b'), secs[0]);
});

test('dragging the only task in the day leaves it alone', () => {
  const { s, secs } = laid();
  s.weeks[WEEK].tasks[DAY] = [(s.weeks[WEEK].tasks[DAY] ?? [])[0]];
  placeTask(s, WEEK, DAY, 'a', 0);
  assert.equal(order(s), 'a');
  assert.equal(secOf(s, 'a'), secs[0]);
});

test('an unknown task id is refused', () => {
  const { s } = laid();
  assert.equal(placeTask(s, WEEK, DAY, 'nope', 1), null);
  assert.equal(order(s), 'abcd');
});

test('the drawn order is section by section, whatever the array says', () => {
  const { s, secs } = laid();
  const arr = s.weeks[WEEK].tasks[DAY] ?? [];
  s.weeks[WEEK].tasks[DAY] = [arr[3], arr[1], arr[2], arr[0]];   // d b c a
  assert.deepEqual(orderedTasks(s, WEEK, DAY).map((t) => t.id), ['b', 'a', 'c', 'd']);
  assert.equal(secs.length, 3);
});

test('the drawn order sinks ticked tasks inside each section', () => {
  const { s, secs } = laid();
  const arr = s.weeks[WEEK].tasks[DAY] ?? [];
  arr[0].state = 'done';          // a, first in section one
  arr[0].doneAt = 100;
  assert.deepEqual(orderedTasks(s, WEEK, DAY).map((t) => t.id), ['b', 'a', 'c', 'd'],
    'a sinks below b, but stays in its own section');
  assert.equal(secs.length, 3);
});

test('a drop index lands where the same index is drawn', () => {
  const { s } = laid();
  const arr = s.weeks[WEEK].tasks[DAY] ?? [];
  arr[0].state = 'done';
  arr[0].doneAt = 100;
  // Drawn: b a c d. Dropping 'd' at index 1 must put it between b and a.
  placeTask(s, WEEK, DAY, 'd', 1);
  assert.deepEqual(orderedTasks(s, WEEK, DAY).map((t) => t.id), ['b', 'd', 'a', 'c']);
});

test('the drawn order is stable, so reading it twice gives the same answer', () => {
  const { s } = laid();
  const arr = s.weeks[WEEK].tasks[DAY] ?? [];
  arr[1].state = 'done';
  arr[1].doneAt = 50;
  const once = orderedTasks(s, WEEK, DAY).map((t) => t.id);
  s.weeks[WEEK].tasks[DAY] = orderedTasks(s, WEEK, DAY);
  assert.deepEqual(orderedTasks(s, WEEK, DAY).map((t) => t.id), once);
});

test('a task under a heading that no longer exists is still drawn, at the end', () => {
  const { s } = laid();
  (s.weeks[WEEK].tasks[DAY] ?? [])[2].sec = 'gone';
  const ids = orderedTasks(s, WEEK, DAY).map((t) => t.id);
  assert.equal(ids.length, 4, 'nothing vanishes');
  assert.equal(ids[ids.length - 1], 'c');
});
