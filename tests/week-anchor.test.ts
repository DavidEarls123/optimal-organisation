import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/domain/state';
import { createWeek, ensureWeek } from '../src/domain/week';
import {
  addDays, dayDateIso, isoOf, isoWeekId, mondayOf, mondayOfWeekId, parseISO,
} from '../src/domain/dates';
import type { AppState } from '../src/domain/types';

/** Thursday 15 October 2026. Its week is 2026-W42, Monday the 12th, and the
 *  week after it begins on Monday the 19th — not the 22nd. */
const THU = new Date(2026, 9, 15);

test('the fourth of January is in week one, so a week id names a Monday', () => {
  assert.equal(mondayOfWeekId('2026-W42'), '2026-10-12');
  assert.equal(mondayOfWeekId('2026-W43'), '2026-10-19');
  // Every id a year can hold comes back as a Monday that belongs to it.
  for (let wk = 1; wk <= 52; wk += 1) {
    const id = `2026-W${String(wk).padStart(2, '0')}`;
    const monday = mondayOfWeekId(id);
    assert.ok(monday, id);
    assert.equal(parseISO(monday).getDay(), 1, `${id} is a Monday`);
    assert.equal(isoWeekId(parseISO(monday)), id);
  }
  assert.equal(mondayOfWeekId('not-a-week'), null);
  assert.equal(mondayOfWeekId('2026-W00'), null);
  assert.equal(mondayOfWeekId('2026-W54'), null);
});

test('a week made from a Thursday is still anchored to its Monday', () => {
  const s = createInitialState(THU, 'run');
  const w = createWeek(s, '2026-10-15', 'run');
  assert.equal(w.monday, '2026-10-12');
});

test('ensureWeek takes any day of the week and files it under the right Monday', () => {
  const s = createInitialState(THU, 'run');
  // Picking Thursday the 22nd in the calendar is asking for the week of the
  // 19th, which is the week the 22nd is in.
  const id = ensureWeek(s, '2026-10-22');
  assert.equal(id, '2026-W43');
  assert.equal(s.weeks[id].monday, '2026-10-19');
  // And the seven days it draws are that Monday onwards.
  assert.equal(dayDateIso(s.weeks[id].monday, 0), '2026-10-19');
  assert.equal(dayDateIso(s.weeks[id].monday, 6), '2026-10-25');
});

test('the week after this one starts on the next Monday, not seven days from today', () => {
  const s = createInitialState(THU, 'run');
  const here = s.weeks[isoWeekId(mondayOf(THU))];
  assert.equal(here.monday, '2026-10-12', 'this week is anchored to Monday');

  // Exactly what the forward arrow does: seven days on from where this week
  // starts. Anchored to the Thursday it was made on, this gave the 22nd.
  const next = ensureWeek(s, isoOf(addDays(parseISO(here.monday), 7)));
  assert.equal(next, '2026-W43');
  assert.equal(s.weeks[next].monday, '2026-10-19');
});

test('a week already stored against the wrong day is put back on its Monday', () => {
  // What a phone is carrying right now: the button that goes back to today,
  // pressed on a Thursday, anchored the week to the Thursday.
  const s = createInitialState(THU, 'run');
  s.weeks['2026-W42'].monday = '2026-10-15';
  s.weeks['2026-W43'] = createWeek(s, '2026-10-19', 'run');
  s.weeks['2026-W43'].monday = '2026-10-22';

  const fixed = migrate(JSON.parse(JSON.stringify(s)) as Partial<AppState>);
  assert.ok(fixed);
  assert.equal(fixed.weeks['2026-W42'].monday, '2026-10-12');
  assert.equal(fixed.weeks['2026-W43'].monday, '2026-10-19');
});

test('repairing the anchor leaves the days themselves alone', () => {
  // Which of the seven a task is on is its own: it is what was drawn under
  // Monday and what was meant by it, however the week was anchored.
  const s = createInitialState(THU, 'run');
  s.weeks['2026-W42'].monday = '2026-10-15';
  s.weeks['2026-W42'].tasks[0] = [
    { id: 't1', text: 'Monday thing', state: 'open', plan: false, track: null, sec: 's1' },
  ];
  s.weeks['2026-W42'].complete[3] = true;

  const fixed = migrate(JSON.parse(JSON.stringify(s)) as Partial<AppState>);
  assert.ok(fixed);
  const w = fixed.weeks['2026-W42'];
  assert.equal(w.monday, '2026-10-12');
  assert.deepEqual(w.tasks[0].map((t) => t.text), ['Monday thing']);
  assert.equal(w.complete[3], true);
});

test('a week whose anchor is missing or nonsense is given one', () => {
  const s = createInitialState(THU, 'run');
  delete (s.weeks['2026-W42'] as { monday?: string }).monday;
  const fixed = migrate(JSON.parse(JSON.stringify(s)) as Partial<AppState>);
  assert.ok(fixed);
  assert.equal(fixed.weeks['2026-W42'].monday, '2026-10-12');
});
