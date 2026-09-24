import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/state';
import {
  addTripCat, buildTripItems, moveTripCat, placeTripItem, removeTripCat, renameTripCat,
  tripCats, tripMissing, tripOrdered, tripTopUp, uid,
} from '../src/domain/week';
import { TRIP_CATEGORIES } from '../src/domain/catalogue';
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

test('a trip starts on the standard headings and can go its own way', () => {
  const { s, id } = withTrip();
  const trip = s.trips[0];
  assert.deepEqual(tripCats(trip), TRIP_CATEGORIES, 'the standard ones, until it says otherwise');
  assert.equal(addTripCat(trip, 'Documents'), true);
  assert.equal(tripCats(trip)[tripCats(trip).length - 1], 'Documents');
  assert.ok(id);
});

test('a heading is not added twice, whatever the case', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  assert.equal(addTripCat(trip, 'Flights'), false);
  assert.equal(addTripCat(trip, 'FLIGHTS'), false);
  assert.equal(addTripCat(trip, '   '), false, 'and a heading of nothing is not a heading');
});

test('renaming a heading takes everything under it along', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const was = trip.items.filter((x) => x.cat === 'Flights').map((x) => x.id);
  assert.ok(was.length, 'there is something under it to move');
  assert.equal(renameTripCat(trip, 'Flights', 'Getting there'), true);
  assert.ok(!tripCats(trip).includes('Flights'));
  for (const x of was) {
    assert.equal(trip.items.find((y) => y.id === x)?.cat, 'Getting there');
  }
});

test('a heading cannot be renamed onto another one', () => {
  const { s } = withTrip();
  assert.equal(renameTripCat(s.trips[0], 'Flights', 'Activities'), false);
});

test('removing a heading rehomes its items rather than losing them', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const before = trip.items.length;
  const moving = trip.items.filter((x) => x.cat === 'Accommodation').map((x) => x.id);
  assert.equal(removeTripCat(trip, 'Accommodation'), true);
  assert.equal(trip.items.length, before, 'nothing was thrown away');
  for (const x of moving) {
    assert.equal(trip.items.find((y) => y.id === x)?.cat, 'Flights', 'the heading above it');
  }
});

test('the first heading rehomes downwards, and the last one standing stays', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const moving = trip.items.filter((x) => x.cat === 'Flights').map((x) => x.id);
  removeTripCat(trip, 'Flights');
  assert.equal(trip.items.find((y) => y.id === moving[0])?.cat, 'Accommodation');
  trip.cats = ['Only one'];
  assert.equal(removeTripCat(trip, 'Only one'), false, 'a list with no headings is not a list');
});

test('headings move up and down, and stop at the ends', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const [first, second] = tripCats(trip);
  assert.equal(moveTripCat(trip, second, -1), true);
  assert.deepEqual(tripCats(trip).slice(0, 2), [second, first]);
  assert.equal(moveTripCat(trip, second, -1), false, 'the top will not go up');
  const last = tripCats(trip)[tripCats(trip).length - 1];
  assert.equal(moveTripCat(trip, last, 1), false, 'nor the bottom down');
});

test('the drawn order follows the headings, however the array is shuffled', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  trip.items = [...trip.items].reverse();
  const cats = tripCats(trip);
  const seen = tripOrdered(trip).map((x) => cats.indexOf(x.cat));
  assert.deepEqual(seen, [...seen].sort((a, b) => a - b), 'each heading’s items sit together');
  assert.equal(tripOrdered(trip).length, trip.items.length, 'and all of them are drawn');
});

test('an item under a heading that is gone is still drawn, at the end', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  trip.items[0].cat = 'Nowhere';
  const drawn = tripOrdered(trip);
  assert.equal(drawn.length, trip.items.length);
  assert.equal(drawn[drawn.length - 1].cat, 'Nowhere');
});

test('an item dragged into another heading joins it', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const first = tripOrdered(trip)[0];
  placeTripItem(trip, first.id, 0, 'Activities');
  assert.equal(trip.items.find((x) => x.id === first.id)?.cat, 'Activities');
  assert.equal(tripOrdered(trip).length, trip.items.length, 'and nothing is lost on the way');
});

test('an item dropped past the end lands at the end', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const first = tripOrdered(trip)[0];
  placeTripItem(trip, first.id, 999);
  assert.equal(tripOrdered(trip)[trip.items.length - 1].id, first.id);
});

test('a heading a trip does not have is refused rather than filed under it', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const first = tripOrdered(trip)[0];
  placeTripItem(trip, first.id, 0, 'Not a heading');
  assert.ok(tripCats(trip).includes(trip.items.find((x) => x.id === first.id)?.cat ?? ''));
});

test('topping up still works once a trip has headings of its own', () => {
  const { s, id } = withTrip('weekend');
  addTripCat(s.trips[0], 'Documents');
  const missing = tripMissing(s, id, 'race');
  assert.equal(tripTopUp(s, id, 'race'), missing);
});
