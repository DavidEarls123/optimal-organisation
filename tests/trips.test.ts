import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/state';
import { buildTripItems, tripMissing, tripTopUp, uid } from '../src/domain/week';
import type { AppState } from '../src/domain/types';

const TUE = new Date(2026, 8, 15);

function withTrip(tplId = 'weekend'): { s: AppState; id: string } {
  const s = createInitialState(TUE, 'run');
  const id = uid('tr');
  s.trips.push({
    id, name: 'Lisbon', tplId, start: '2026-10-02', end: '2026-10-05',
    items: buildTripItems(s, tplId),
  });
  return { s, id };
}

test('a trip built from its kind is missing nothing from it', () => {
  const { s, id } = withTrip();
  assert.equal(tripMissing(s, id), 0);
  assert.equal(tripTopUp(s, id), 0);
});

test('a kind with more on its list shows what a trip has not got', () => {
  // A weekend away carries the standing list; a race trip adds to it.
  const { s, id } = withTrip('weekend');
  const before = s.trips[0].items.length;
  const missing = tripMissing(s, id, 'race');
  assert.ok(missing > 0, 'a race trip asks for things a weekend does not');
  assert.equal(tripTopUp(s, id, 'race'), missing, 'it adds exactly what it said was missing');
  assert.equal(s.trips[0].items.length, before + missing);
  assert.ok(s.trips[0].items.some((x) => x.text.includes('race number')));
});

test('topping up never touches what is already there', () => {
  const { s, id } = withTrip('weekend');
  s.trips[0].items[0].done = true;
  const kept = s.trips[0].items.map((x) => ({ ...x }));
  tripTopUp(s, id, 'race');
  for (const had of kept) {
    const now = s.trips[0].items.find((x) => x.id === had.id);
    assert.deepEqual(now, had, `${had.text} is untouched`);
  }
});

test('topping up twice adds nothing the second time', () => {
  const { s, id } = withTrip('weekend');
  tripTopUp(s, id, 'race');
  const after = s.trips[0].items.length;
  assert.equal(tripTopUp(s, id, 'race'), 0);
  assert.equal(s.trips[0].items.length, after);
});

test('an item written by hand counts as having it, however it is cased', () => {
  const { s, id } = withTrip();
  const one = s.trips[0].items[0];
  const kind = one.cat;
  s.trips[0].items = s.trips[0].items.filter((x) => x.id !== one.id);
  s.trips[0].items.push({ id: uid('c'), cat: kind, text: one.text.toUpperCase(), done: false });
  assert.equal(tripMissing(s, id), 0, 'the same thing shouted is still the same thing');
});

test('a trip that is gone tops up nothing rather than throwing', () => {
  const { s } = withTrip();
  assert.equal(tripMissing(s, 'nope'), 0);
  assert.equal(tripTopUp(s, 'nope'), 0);
});

test('a kind that means nothing falls back rather than emptying the list', () => {
  const { s, id } = withTrip();
  const before = s.trips[0].items.length;
  tripTopUp(s, id, 'not-a-kind');
  assert.ok(s.trips[0].items.length >= before, 'nothing was taken away');
});
