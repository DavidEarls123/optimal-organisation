import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/state';
import { elapsedDays, isAheadWeek, weekScore } from '../src/domain/scoring';
import { ensureWeek } from '../src/domain/week';
import type { AppState, Task } from '../src/domain/types';

const MON = new Date(2026, 8, 14);
const WED = new Date(2026, 8, 16);
const WEEK = '2026-W38';

/** A week with one habit wanted every day and one task a day, nothing done. */
function plain(): AppState {
  const s = createInitialState(MON, 'run');
  const w = s.weeks[WEEK];
  w.habits = {};
  for (let d = 0; d < 7; d += 1) {
    w.tasks[d] = [{ id: `t${d}`, text: `Task ${d}`, state: 'open', plan: false,
      track: null, sec: s.sections[0].id }] as Task[];
  }
  return s;
}

const tick = (s: AppState, day: number, habitId: string) => {
  (s.weeks[WEEK].habits[day] ??= {})[habitId] = true;
};
const doTask = (s: AppState, day: number) => {
  const x = (s.weeks[WEEK].tasks[day] ?? [])[0];
  if (x) { x.state = 'done'; x.doneAt = 1; }
};

test('the first morning of a week has no pace to report, rather than nought', () => {
  const sc = weekScore(plain(), plain().weeks[WEEK], MON);
  assert.equal(sc.pending, true, 'nothing has come due yet');
});

test('a day you are still in is never counted as missed', () => {
  const s = plain();
  // Monday and Tuesday done, Wednesday untouched — and it is Wednesday.
  doTask(s, 0);
  doTask(s, 1);
  for (const h of s.habits.filter((x) => x.active)) { tick(s, 0, h.id); tick(s, 1, h.id); }
  const sc = weekScore(s, s.weeks[WEEK], WED);
  assert.equal(sc.pending, false);
  assert.ok(sc.pace > 0.99, `everything that was due is done, so pace is full — got ${sc.pace}`);
});

test('a day you are still in can still earn', () => {
  const a = plain();
  doTask(a, 0);
  const before = weekScore(a, a.weeks[WEEK], WED).banked;
  doTask(a, 2);                       // today
  const after = weekScore(a, a.weeks[WEEK], WED).banked;
  assert.ok(after > before, 'ticking something today counts straight away');
});

test('a day that is over and was missed does count against you', () => {
  const s = plain();
  doTask(s, 0);                       // Monday done, Tuesday missed
  const sc = weekScore(s, s.weeks[WEEK], WED);
  assert.ok(sc.pace < 1, `Tuesday is over and was not done — got ${sc.pace}`);
});

test('banked still counts the whole week, today and the rest of it', () => {
  const s = plain();
  doTask(s, 0);
  const sc = weekScore(s, s.weeks[WEEK], WED);
  assert.ok(sc.banked < 0.4, 'most of the week is still ahead, and banked says so');
});

test('a week that has not started is not scored as though it were over', () => {
  const s = plain();
  ensureWeek(s, '2026-09-28');
  const ahead = s.weeks['2026-W40'];
  assert.ok(ahead, 'the week exists');
  assert.equal(isAheadWeek(ahead, MON), true);
  assert.equal(elapsedDays(ahead, MON), 0, 'none of its days have happened');
  const sc = weekScore(s, ahead, MON);
  assert.equal(sc.pending, true, 'so there is nothing to say about it yet');
});

test('a week that is over is measured against all of its days', () => {
  const s = plain();
  const over = s.weeks[WEEK];
  assert.equal(elapsedDays(over, new Date(2026, 8, 30)), 7);
  const sc = weekScore(s, over, new Date(2026, 8, 30));
  assert.equal(sc.pending, false);
  assert.ok(sc.pace < 0.2, 'nothing was done in it, and that is now final');
});

test('untracked days are not days you failed to use', () => {
  const s = plain();
  s.weeks[WEEK].untracked[1] = true;          // Tuesday away
  doTask(s, 0);
  for (const h of s.habits.filter((x) => x.active)) tick(s, 0, h.id);
  const sc = weekScore(s, s.weeks[WEEK], WED);
  assert.ok(sc.pace > 0.99, `only Monday was due, and Monday was done — got ${sc.pace}`);
});

test('pace never goes over full, however far ahead you get', () => {
  const s = plain();
  for (let d = 0; d < 7; d += 1) doTask(s, d);
  for (const h of s.habits.filter((x) => x.active)) {
    for (let d = 0; d < 7; d += 1) tick(s, d, h.id);
  }
  const sc = weekScore(s, s.weeks[WEEK], WED);
  assert.ok(sc.pace <= 1, `got ${sc.pace}`);
  assert.ok(sc.banked > 0.99, 'and the whole week is in the bank');
});
