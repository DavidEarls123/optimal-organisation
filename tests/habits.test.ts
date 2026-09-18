import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/domain/state';
import { countPlan, moveHabit, placeHabit } from '../src/domain/week';
import {
  clockLabel, fromKg, pacing, readings, timing, toKg,
} from '../src/domain/scoring';
import type { AppState, Week } from '../src/domain/types';

const TUE = new Date(2026, 8, 15);
const WEEK = '2026-W38';

function fresh(): { s: AppState; w: Week } {
  const s = createInitialState(TUE, 'run');
  const w = s.weeks[WEEK];
  w.habitPlan.guitar = countPlan(3);
  w.habits = {};
  w.at = {};
  w.readings = {};
  return { s, w };
}

test('a flexible habit with the week ahead of it is not at risk', () => {
  const { w } = fresh();
  const p = pacing(w, 'guitar', 0);           // Monday, none done
  assert.equal(p.target, 3);
  assert.equal(p.left, 3);
  assert.equal(p.daysLeft, 7);
  assert.equal(p.atRisk, false);
  assert.equal(p.impossible, false);
});

test('three owed with three days left is at risk, not impossible', () => {
  const { w } = fresh();
  const p = pacing(w, 'guitar', 4);           // Friday, none done
  assert.equal(p.daysLeft, 3);
  assert.equal(p.left, 3);
  assert.equal(p.atRisk, true);
  assert.equal(p.impossible, false);
});

test('three owed with two days left cannot be finished', () => {
  const { w } = fresh();
  const p = pacing(w, 'guitar', 5);           // Saturday — the case that prompted this
  assert.equal(p.daysLeft, 2);
  assert.equal(p.impossible, true);
});

test('a day already ticked does not count as a day still available', () => {
  const { w } = fresh();
  w.habits[5] = { guitar: true };
  const p = pacing(w, 'guitar', 5);
  assert.equal(p.done, 1);
  assert.equal(p.left, 2);
  assert.equal(p.daysLeft, 1, 'Saturday is spent, only Sunday is left');
  assert.equal(p.impossible, true);
});

test('untracked days are not days you can do it on', () => {
  const { w } = fresh();
  w.untracked[6] = true;
  const p = pacing(w, 'guitar', 5);
  assert.equal(p.daysLeft, 1);
});

test('finishing the target leaves nothing owed and no warning', () => {
  const { w } = fresh();
  w.habits = { 0: { guitar: true }, 1: { guitar: true }, 2: { guitar: true } };
  const p = pacing(w, 'guitar', 5);
  assert.equal(p.left, 0);
  assert.equal(p.atRisk, false);
  assert.equal(p.impossible, false);
});

test('no timings recorded means no timing, not a zero', () => {
  const { w } = fresh();
  assert.equal(timing([w], 'guitar'), null);
});

test('timing averages the ticks and measures how much they move', () => {
  const { w } = fresh();
  w.at = { 0: { guitar: 420 }, 1: { guitar: 480 }, 2: { guitar: 540 } };  // 07:00, 08:00, 09:00
  const t = timing([w], 'guitar')!;
  assert.equal(t.n, 3);
  assert.equal(t.mean, 480);
  assert.equal(t.spread, 40, 'mean absolute deviation of 60, 0, 60');
  assert.equal(t.earliest, 420);
  assert.equal(t.latest, 540);
});

test('a habit done at the same time every day has no spread', () => {
  const { w } = fresh();
  w.at = { 0: { guitar: 400 }, 1: { guitar: 400 } };
  assert.equal(timing([w], 'guitar')!.spread, 0);
});

test('nonsense timings are ignored rather than dragging the average', () => {
  const { w } = fresh();
  w.at = { 0: { guitar: 420 }, 1: { guitar: 99999 }, 2: { guitar: -5 } };
  const t = timing([w], 'guitar')!;
  assert.equal(t.n, 1);
  assert.equal(t.mean, 420);
});

test('clock labels read as times', () => {
  assert.equal(clockLabel(0), '00:00');
  assert.equal(clockLabel(485), '08:05');
  assert.equal(clockLabel(1439), '23:59');
});

test('readings come back oldest first, with their dates', () => {
  const { w } = fresh();
  w.readings = { 3: { weight: 80 }, 0: { weight: 81.5 } };
  assert.deepEqual(readings([w], 'weight'), [
    ['2026-09-14', 81.5],
    ['2026-09-17', 80],
  ]);
});

test('a day with no reading is simply absent', () => {
  const { w } = fresh();
  w.readings = { 0: { weight: 80 }, 1: {} };
  assert.equal(readings([w], 'weight').length, 1);
});

test('pounds convert to kilograms and back without drift', () => {
  const kg = toKg(176, 'lb');
  assert.ok(Math.abs(kg - 79.83) < 0.01);
  assert.ok(Math.abs(fromKg(kg, 'lb') - 176) < 1e-9);
  assert.equal(toKg(80, 'kg'), 80);
  assert.equal(fromKg(80, 'kg'), 80);
});

test('a habit can be moved up the list, which is the order the tiles sit in', () => {
  const s = createInitialState(TUE, 'run');
  const [a, b] = s.habits.map((h) => h.id);
  assert.equal(moveHabit(s, b, -1), true);
  assert.deepEqual(s.habits.slice(0, 2).map((h) => h.id), [b, a]);
});

test('a habit can be moved down', () => {
  const s = createInitialState(TUE, 'run');
  const [a, b] = s.habits.map((h) => h.id);
  assert.equal(moveHabit(s, a, 1), true);
  assert.deepEqual(s.habits.slice(0, 2).map((h) => h.id), [b, a]);
});

test('the top of the list will not move up, and the bottom will not move down', () => {
  const s = createInitialState(TUE, 'run');
  const order = s.habits.map((h) => h.id);
  assert.equal(moveHabit(s, order[0], -1), false);
  assert.equal(moveHabit(s, order[order.length - 1], 1), false);
  assert.deepEqual(s.habits.map((h) => h.id), order, 'and nothing moved');
});

test('moving a habit that is not there changes nothing', () => {
  const s = createInitialState(TUE, 'run');
  const order = s.habits.map((h) => h.id);
  assert.equal(moveHabit(s, 'nope', 1), false);
  assert.deepEqual(s.habits.map((h) => h.id), order);
});

test('every habit survives being walked from the bottom to the top', () => {
  const s = createInitialState(TUE, 'run');
  const last = s.habits[s.habits.length - 1].id;
  for (let i = 0; i < s.habits.length + 3; i += 1) moveHabit(s, last, -1);
  assert.equal(s.habits[0].id, last);
  assert.equal(new Set(s.habits.map((h) => h.id)).size, s.habits.length, 'and none were lost');
});

test('an order set by hand survives a save and a load', () => {
  const s = createInitialState(TUE, 'run');
  moveHabit(s, s.habits[2].id, -1);
  const wanted = s.habits.map((h) => h.id);
  const back = migrate(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back?.habits.map((h) => h.id), wanted);
});

test('a habit dropped two places down lands there', () => {
  const s = createInitialState(TUE, 'run');
  const ids = s.habits.map((h) => h.id);
  placeHabit(s, ids[0], 2);
  assert.deepEqual(s.habits.map((h) => h.id),
    [ids[1], ids[2], ids[0], ...ids.slice(3)]);
});

test('a habit dropped at the top becomes the first', () => {
  const s = createInitialState(TUE, 'run');
  const ids = s.habits.map((h) => h.id);
  placeHabit(s, ids[3], 0);
  assert.equal(s.habits[0].id, ids[3]);
  assert.equal(s.habits.length, ids.length, 'and nothing was lost');
});

test('a habit dropped past the end is clamped rather than dropped on the floor', () => {
  const s = createInitialState(TUE, 'run');
  const ids = s.habits.map((h) => h.id);
  placeHabit(s, ids[0], 99);
  assert.equal(s.habits[s.habits.length - 1].id, ids[0]);
  assert.equal(s.habits.length, ids.length);
});

test('a habit dropped where it already is changes nothing', () => {
  const s = createInitialState(TUE, 'run');
  const ids = s.habits.map((h) => h.id);
  placeHabit(s, ids[2], 2);
  assert.deepEqual(s.habits.map((h) => h.id), ids);
});

test('dropping a habit that is not there is refused', () => {
  const s = createInitialState(TUE, 'run');
  const ids = s.habits.map((h) => h.id);
  assert.equal(placeHabit(s, 'nope', 0), false);
  assert.deepEqual(s.habits.map((h) => h.id), ids);
});

test('dragging and the arrows agree on what one step means', () => {
  const a = createInitialState(TUE, 'run');
  const b = createInitialState(TUE, 'run');
  const id = a.habits[1].id;
  moveHabit(a, id, 1);
  placeHabit(b, id, 2);
  assert.deepEqual(a.habits.map((h) => h.id), b.habits.map((h) => h.id));
});
