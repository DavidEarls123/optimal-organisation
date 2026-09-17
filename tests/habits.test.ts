import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/state';
import { countPlan } from '../src/domain/week';
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
