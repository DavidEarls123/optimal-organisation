import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/domain/state';
import { backupFilename, parseBackup, serialise, summarise } from '../src/domain/backup';
import { ensureWeek, moveTask } from '../src/domain/week';
import { habitTarget, trackWeekCount, watchCount } from '../src/domain/scoring';

const TUE = new Date(2026, 8, 15);
const WEEK38 = '2026-W38';

/** A state with enough in it that a lossy round trip would show. */
function lived() {
  const s = createInitialState(TUE, 'run');
  const w = s.weeks[WEEK38];
  w.focus = 'Last big week before the taper.';
  w.habits[0] = { tabs_am: true, calories: true, run: true };
  w.habits[1] = { tabs_am: true };
  w.untracked[4] = true;
  w.complete[0] = true;
  w.watched[1] = ['w1', 'w2'];
  w.at = { 0: { tabs_am: 435, calories: 1170 }, 1: { tabs_am: 448 } };
  w.readings = { 0: { weight: 81.4 }, 3: { weight: 80.9 } };
  w.habitPlan.meditate = { mode: 'days', days: [0, 2, 4, 6], n: 4 };
  w.tasks[1] = [
    { id: 't1', text: 'Intervals', state: 'done', plan: true, track: 'run', sec: 's3' },
    { id: 't2', text: 'Typed in', state: 'open', plan: false, track: null, sec: 's1' },
  ];
  w.shop = [{ id: 'g1', name: 'Breakfast', items: [{ id: 'i1', text: 'Oats', done: true }] }];
  s.watch = [
    { id: 'w1', title: 'Dune: Part Two', kind: 'film', done: true },
    { id: 'w2', title: 'The Bear', kind: 'tv', done: false },
  ];
  s.trips = [{ id: 'tr1', name: 'Lisbon', tplId: 'holiday', start: '2026-10-23', end: '2026-10-27',
    items: [{ id: 'c1', cat: 'Flights', text: 'Book outbound', done: true }] }];
  s.events = [{ id: 'e1', name: 'Manchester Half', date: '2026-10-11', source: 'calendar' }];
  ensureWeek(s, '2026-09-21');
  moveTask(s, WEEK38, 1, 't1', '2026-09-24');
  return s;
}

test('a backup round trip preserves the state exactly', () => {
  const before = lived();
  const res = parseBackup(serialise(before));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.deepEqual(res.state, JSON.parse(JSON.stringify(before)));
});

test('the restored state still computes the same answers', () => {
  const before = lived();
  const res = parseBackup(serialise(before));
  assert.ok(res.ok);
  if (!res.ok) return;
  const a = before.weeks[WEEK38];
  const b = res.state.weeks[WEEK38];
  assert.equal(habitTarget(b, 'tabs_am'), habitTarget(a, 'tabs_am'));
  assert.equal(habitTarget(b, 'meditate'), habitTarget(a, 'meditate'));
  assert.equal(trackWeekCount(res.state.weeks['2026-W39'], 'run'),
               trackWeekCount(before.weeks['2026-W39'], 'run'));
  assert.equal(watchCount(res.state, 'w1'), watchCount(before, 'w1'));
});

test('the envelope says what you are about to restore', () => {
  const s = lived();
  const env = JSON.parse(serialise(s, TUE));
  assert.equal(env.kind, 'optimal-week-backup');
  assert.equal(env.format, 1);
  assert.equal(env.exportedAt, TUE.toISOString());
  assert.deepEqual(env.summary, summarise(s));
  assert.equal(env.summary.weeks, 2);
  assert.equal(env.summary.firstWeek, WEEK38);
  assert.equal(env.summary.lastWeek, '2026-W39');
  assert.equal(env.summary.watchlist, 2);
  assert.equal(env.summary.trips, 1);
});

test('untracked days, ticks and watched entries survive the trip', () => {
  const res = parseBackup(serialise(lived()));
  assert.ok(res.ok);
  if (!res.ok) return;
  const w = res.state.weeks[WEEK38];
  assert.equal(w.untracked[4], true);
  assert.equal(w.complete[0], true);
  assert.deepEqual(w.watched[1], ['w1', 'w2']);
  assert.equal(w.tasks[1].find((t) => t.id === 't2')?.state, 'open');
  assert.equal(w.shop?.[0].items[0].done, true);
});

test('tick times and weight readings survive the trip', () => {
  const res = parseBackup(serialise(lived()));
  assert.ok(res.ok);
  if (!res.ok) return;
  const w = res.state.weeks[WEEK38];
  assert.equal(w.at?.[0].tabs_am, 435);
  assert.equal(w.at?.[1].tabs_am, 448);
  assert.equal(w.readings?.[3].weight, 80.9);
});

test('a disabled habit comes back disabled, with its plan intact', () => {
  const s = lived();
  s.habits.find((h) => h.id === 'calories')!.active = false;
  s.weeks[WEEK38].habitPlan.calories = { mode: 'count', days: [], n: 6 };
  const res = parseBackup(serialise(s));
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.state.habits.find((h) => h.id === 'calories')!.active, false);
  assert.equal(res.state.weeks[WEEK38].habitPlan.calories.n, 6);
});

test('junk is refused rather than half-applied', () => {
  for (const [text, hint] of [
    ['not json at all', 'JSON'],
    ['{}', 'not a Week One backup'],
    ['[]', 'not a Week One backup'],
    ['null', 'does not contain a backup'],
    ['{"kind":"something-else","state":{"weeks":{}}}', 'not a Week One backup'],
  ] as const) {
    const res = parseBackup(text);
    assert.equal(res.ok, false, `should refuse: ${text}`);
    if (!res.ok) assert.match(res.reason, new RegExp(hint, 'i'));
  }
});

test('a backup from a newer app version is refused, not guessed at', () => {
  const env = JSON.parse(serialise(lived()));
  env.format = 99;
  const res = parseBackup(JSON.stringify(env));
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /newer version/i);
});

test('a backup of the right kind but with no weeks is refused', () => {
  const res = parseBackup(JSON.stringify({
    kind: 'optimal-week-backup', format: 1, state: { habits: [], sections: [] },
  }));
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.reason, /missing its week data/i);
});

test('an older backup is repaired by the same migration as stored state', () => {
  const res = parseBackup(JSON.stringify({
    kind: 'optimal-week-backup',
    format: 1,
    state: {
      weeks: {
        '2026-W38': {
          monday: '2026-09-14', templateId: 'run', focus: '',
          habitPlan: {}, habits: {},
          tasks: { 0: [{ id: 'a', text: 'Run', state: 'done', plan: true, sec: 'long-gone' }] },
        },
      },
    },
  }));
  assert.ok(res.ok);
  if (!res.ok) return;
  const t = res.state.weeks['2026-W38'].tasks[0][0];
  assert.equal(t.sec, res.state.sections[0].id);
  assert.equal(t.track, null);
  assert.ok(res.state.habits.length > 0);
});

test('filenames sort chronologically and are safe on any filesystem', () => {
  const a = backupFilename(new Date(2026, 8, 15, 9, 5));
  const b = backupFilename(new Date(2026, 11, 1, 18, 30));
  assert.equal(a, 'optimal-week-2026-09-15-0905.json');
  assert.ok(a < b, 'names sort by date');
  assert.match(a, /^[a-z0-9.-]+$/);
});
