import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/domain/state';
import {
  addTripCat, buildTripItems, moveTripCat, placeTripItem, removeTripCat, renameTripCat,
  packImport, packOffer, tripCats, tripOrdered, uid,
  addPackCat, defaultPackList, removePackCat, renamePackCat, tripTemplateOf,
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

test('the standard checklist takes a heading, and keeps the ones it had', () => {
  const s = createInitialState(TUE, 'run');
  const before = Object.keys(tripTemplateOf(s));
  assert.equal(addPackCat(s, 'Documents'), true);
  assert.deepEqual(Object.keys(tripTemplateOf(s)), [...before, 'Documents']);
  assert.equal(addPackCat(s, 'documents'), false, 'and not the same one twice');
});

test('a heading removed from the standard checklist stays removed', () => {
  // It used to be put back every time the list was read, so removing one
  // lasted until you next looked at it.
  const s = createInitialState(TUE, 'run');
  const [first] = Object.keys(tripTemplateOf(s));
  assert.equal(removePackCat(s, first), true);
  assert.ok(!Object.keys(tripTemplateOf(s)).includes(first), 'still gone when read again');
});

test('renaming a standard heading keeps its place and its items', () => {
  const s = createInitialState(TUE, 'run');
  const cats = Object.keys(tripTemplateOf(s));
  const was = [...tripTemplateOf(s)[cats[1]]];
  assert.equal(renamePackCat(s, cats[1], 'Getting there'), true);
  const now = Object.keys(tripTemplateOf(s));
  assert.equal(now[1], 'Getting there', 'in the same place');
  assert.deepEqual(tripTemplateOf(s)['Getting there'], was, 'with what was under it');
  assert.equal(renamePackCat(s, 'Getting there', cats[0]), false, 'and not onto another');
});

test('the last standard heading will not be removed', () => {
  const s = createInitialState(TUE, 'run');
  const cats = Object.keys(tripTemplateOf(s));
  for (const cat of cats.slice(1)) removePackCat(s, cat);
  assert.equal(removePackCat(s, cats[0]), false);
  assert.equal(Object.keys(tripTemplateOf(s)).length, 1);
});

test('a trip is built from the headings the standard list has now', () => {
  const s = createInitialState(TUE, 'run');
  addPackCat(s, 'Documents');
  tripTemplateOf(s).Documents.push('Passport');
  const [first] = Object.keys(tripTemplateOf(s));
  removePackCat(s, first);
  const items = buildTripItems(s, 'weekend');
  assert.ok(items.some((x) => x.cat === 'Documents' && x.text === 'Passport'));
  assert.ok(!items.some((x) => x.cat === first), 'and not the one taken away');
});

test('the standard checklist offers itself a heading at a time', () => {
  const { s, id } = withTrip();
  // Built from it, so there is nothing new to bring in.
  for (const o of packOffer(s, id)) assert.equal(o.adds, 0, o.name);

  addPackCat(s, 'Documents');
  tripTemplateOf(s).Documents.push('Passport', 'Insurance');
  const offer = packOffer(s, id);
  const docs = offer.find((o) => o.name === 'Documents');
  assert.ok(docs);
  assert.equal(docs.adds, 2);
  assert.equal(docs.isNew, true, 'the trip has not got that heading yet');
});

test('bringing one in adds its heading and only what is missing', () => {
  const { s, id } = withTrip();
  addPackCat(s, 'Documents');
  tripTemplateOf(s).Documents.push('Passport');
  const before = s.trips[0].items.length;

  assert.equal(packImport(s, id, ['Documents']), 1);
  assert.equal(s.trips[0].items.length, before + 1);
  assert.ok(tripCats(s.trips[0]).includes('Documents'));
  assert.equal(packImport(s, id, ['Documents']), 0, 'and nothing the second time');
});

test('only the headings you choose come in', () => {
  const { s, id } = withTrip();
  addPackCat(s, 'Documents');
  addPackCat(s, 'Medicines');
  tripTemplateOf(s).Documents.push('Passport');
  tripTemplateOf(s).Medicines.push('Antihistamines');

  packImport(s, id, ['Documents']);
  assert.ok(s.trips[0].items.some((x) => x.text === 'Passport'));
  assert.ok(!s.trips[0].items.some((x) => x.text === 'Antihistamines'));
});

test('bringing in never disturbs what you have ticked or written', () => {
  const { s, id } = withTrip();
  s.trips[0].items[0].done = true;
  const kept = s.trips[0].items.map((x) => ({ ...x }));
  addPackCat(s, 'Documents');
  tripTemplateOf(s).Documents.push('Passport');
  packImport(s, id, ['Documents']);
  for (const had of kept) {
    assert.deepEqual(s.trips[0].items.find((x) => x.id === had.id), had, had.text);
  }
});

test('the checklist a phone with none starts from is a real list', () => {
  // The screen draws this before anything is stored, so it has to stand on
  // its own rather than being a shape waiting to be filled.
  const d = defaultPackList();
  assert.ok(Object.keys(d).length > 0);
  for (const [cat, items] of Object.entries(d)) assert.ok(Array.isArray(items), cat);
});

test('showing the default list does not write it', () => {
  const s = createInitialState(TUE, 'run');
  defaultPackList();
  assert.equal(s.tripTemplate, undefined, 'nothing was stored by looking');
});

test('a list with no headings at all is given the standard ones back', () => {
  const s = createInitialState(TUE, 'run');
  s.tripTemplate = {};
  assert.ok(Object.keys(tripTemplateOf(s)).length > 0);
});

test('asking what the standard checklist offers does not write anything down', () => {
  // It is asked while the page is being drawn, and a function that creates
  // the thing it is asked about creates it where nobody is listening: the
  // screen does not redraw and the disk never hears about it.
  const { s, id } = withTrip();
  s.tripTemplate = undefined;
  const before = JSON.stringify(s);

  const offer = packOffer(s, id);

  assert.equal(s.tripTemplate, undefined, 'nothing was stored');
  assert.equal(JSON.stringify(s), before, 'nothing at all changed');
  assert.deepEqual(offer.map((o) => o.name), Object.keys(defaultPackList()),
    'and it still answers, from the defaults');
});
