import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/domain/state';
import {
  addPackCat, addTripCat, askHowMany, buildTripItems, defaultPackList, moveTripCat, packCatchUp,
  packCounts, packGroupsOf, packListOf, packNeeded, packNew, pickPackItem, placeTripItem,
  removePackCat, removeTripCat, renamePackCat, renameTripCat, tripCats, tripOrdered, uid,
} from '../src/domain/week';
import { TRIP_CATEGORIES } from '../src/domain/catalogue';
import type { AppState } from '../src/domain/types';

const TUE = new Date(2026, 8, 15);

/** A trip the way the app makes one: the whole standing list copied in, and
 *  its own headings taken from where that list put things. */
function withTrip(tplId = 'weekend'): { s: AppState; id: string } {
  const s = createInitialState(TUE, 'run');
  const id = uid('tr');
  const items = buildTripItems(s, tplId);
  const cats: string[] = [];
  for (const it of items) if (!cats.includes(it.cat)) cats.push(it.cat);
  s.trips.push({ id, name: 'Lisbon', tplId, start: '2026-10-02', end: '2026-10-05', cats, items });
  return { s, id };
}

test('a trip starts on the standing list’s headings and can go its own way', () => {
  const { s, id } = withTrip();
  const trip = s.trips[0];
  assert.deepEqual(tripCats(trip), packGroupsOf(s).map((g) => g.name),
    'the ones the standing list has, which is where its lines came from');
  assert.equal(addTripCat(trip, 'Papers'), true);
  assert.equal(tripCats(trip)[tripCats(trip).length - 1], 'Papers');
  assert.ok(id);
});

test('a trip with no headings of its own takes them from its own lines', () => {
  // Older trips were saved without any, and the four built-in ones used to
  // stand in — which, now that a trip arrives with the whole standing list,
  // would file most of it under nothing at all.
  const { s } = withTrip();
  const trip = s.trips[0];
  const was = tripCats(trip);
  delete trip.cats;
  assert.deepEqual(tripCats(trip), was);
  trip.items = [];
  assert.deepEqual(tripCats(trip), TRIP_CATEGORIES, 'and with no lines either, the old four');
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

test('the standard list takes a heading, and keeps the ones it had', () => {
  const s = createInitialState(TUE, 'run');
  const before = packListOf(s).map((g) => g.name);
  const gid = addPackCat(s, 'Papers');
  assert.ok(gid);
  assert.deepEqual(packListOf(s).map((g) => g.name), [...before, 'Papers']);
  assert.equal(addPackCat(s, 'papers'), null, 'and not the same one twice');
  assert.equal(addPackCat(s, '   '), null, 'and a heading of nothing is not a heading');
});

test('a heading removed from the standard list stays removed', () => {
  // It used to be put back every time the list was read, so removing one
  // lasted until you next looked at it.
  const s = createInitialState(TUE, 'run');
  const [first] = packListOf(s);
  assert.equal(removePackCat(s, first.id), true);
  assert.ok(!packListOf(s).some((g) => g.id === first.id), 'still gone when read again');
});

test('renaming a standard heading keeps its place and its lines', () => {
  const s = createInitialState(TUE, 'run');
  const list = packListOf(s);
  const was = list[1].items.map((x) => x.text);
  assert.equal(renamePackCat(s, list[1].id, 'Getting there'), true);
  assert.equal(packListOf(s)[1].name, 'Getting there', 'in the same place');
  assert.deepEqual(packListOf(s)[1].items.map((x) => x.text), was, 'with what was under it');
  assert.equal(renamePackCat(s, list[1].id, list[0].name), false, 'and not onto another');
});

test('the last standard heading will not be removed', () => {
  const s = createInitialState(TUE, 'run');
  const ids = packListOf(s).map((g) => g.id);
  for (const gid of ids.slice(1)) removePackCat(s, gid);
  assert.equal(removePackCat(s, ids[0]), false);
  assert.equal(packListOf(s).length, 1);
});

test('a trip is built from the headings the standard list has now', () => {
  const s = createInitialState(TUE, 'run');
  const gid = addPackCat(s, 'Papers');
  assert.ok(gid);
  packListOf(s).find((g) => g.id === gid)?.items.push({ id: 'p1', text: 'Passport' });
  const [first] = packListOf(s);
  removePackCat(s, first.id);
  const items = buildTripItems(s, 'weekend');
  assert.ok(items.some((x) => x.cat === 'Papers' && x.text === 'Passport'));
  assert.ok(!items.some((x) => x.cat === first.name), 'and not the one taken away');
});

test('a trip starts with the whole list and nothing chosen', () => {
  // The point of the whole thing: everything you own is on every trip, and
  // which of it you are taking is this trip's question.
  const { s } = withTrip();
  const trip = s.trips[0];
  const standard = packGroupsOf(s).reduce((a, g) => a + g.items.length, 0);
  assert.ok(trip.items.length >= standard, 'the lot came in');
  const fromList = trip.items.filter((x) => !x.need);
  assert.equal(fromList.length, standard, 'and none of it is chosen');
  assert.deepEqual(packCounts(trip), { need: trip.items.length - standard, done: 0 });
});

test('the kind of trip pre-ticks its own bits and nothing else', () => {
  const { s } = withTrip('race');
  const chosen = packNeeded(s.trips[0]).map((x) => x.text);
  assert.ok(chosen.includes('Collect race number'), 'picking a race trip says it has one');
  assert.ok(!chosen.includes('Book outbound'), 'and says nothing about the rest');
});

test('a line that asks how many says so on the trip too', () => {
  // Copied onto the trip, so changing the standing list later cannot leave a
  // trip holding an amount for something that has stopped asking.
  const s = createInitialState(TUE, 'run');
  const list = packListOf(s);
  const asks = list.flatMap((g) => g.items).find((x) => x.qty);
  assert.ok(asks, 'the built-in list has some');
  const items = buildTripItems(s, 'weekend');
  assert.equal(items.find((x) => x.text === asks.text)?.qty, true);
});

test('choosing a line can carry how many, and dropping it clears everything', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const socks = trip.items.find((x) => x.qty);
  assert.ok(socks);

  assert.equal(pickPackItem(trip, socks.id, true, '  5  '), true);
  assert.equal(socks.need, true);
  assert.equal(socks.amount, '5', 'tidied, because it is a number not an essay');

  socks.done = true;
  assert.equal(pickPackItem(trip, socks.id, false), true);
  assert.equal(socks.need, false);
  assert.equal(socks.done, false, 'a line you are not taking is not a line you packed');
  assert.equal(socks.amount, undefined, 'and an amount left behind would surprise you later');
});

test('how many is cut to something you could read on a label', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  const it = trip.items[0];
  pickPackItem(trip, it.id, true, 'x'.repeat(50));
  assert.equal(it.amount?.length, 12);
  pickPackItem(trip, it.id, true, '   ');
  assert.equal(it.amount, undefined, 'and nothing written is no answer at all');
});

test('a line that is not there cannot be chosen', () => {
  const { s } = withTrip();
  assert.equal(pickPackItem(s.trips[0], 'nope', true), false);
});

test('packing is what you chose, in the order the headings are in', () => {
  const { s } = withTrip();
  const trip = s.trips[0];
  trip.cats = ['Second', 'First'];
  trip.items = [
    { id: 'a', cat: 'First', text: 'A', done: false, need: true },
    { id: 'b', cat: 'Second', text: 'B', done: false, need: true },
    { id: 'c', cat: 'First', text: 'C', done: false, need: false },
  ];
  assert.deepEqual(packNeeded(trip).map((x) => x.id), ['b', 'a']);
  assert.deepEqual(packCounts(trip), { need: 2, done: 0 });
  trip.items[0].done = true;
  assert.deepEqual(packCounts(trip), { need: 2, done: 1 });
});

test('what you add to the standing list afterwards can be caught up', () => {
  const { s, id } = withTrip();
  assert.equal(packNew(s, id), 0, 'the trip began with the lot, so nothing is new');

  const gid = addPackCat(s, 'Papers');
  assert.ok(gid);
  packListOf(s).find((g) => g.id === gid)?.items
    .push({ id: 'p1', text: 'Passport' }, { id: 'p2', text: 'Insurance', qty: true });
  assert.equal(packNew(s, id), 2);

  assert.equal(packCatchUp(s, id), 2);
  assert.equal(packNew(s, id), 0, 'and nothing the second time');
  const trip = s.trips[0];
  assert.ok(tripCats(trip).includes('Papers'), 'with the heading it needed');
  const brought = trip.items.filter((x) => x.cat === 'Papers');
  assert.deepEqual(brought.map((x) => x.need), [false, false], 'unchosen, as the rest was');
  assert.equal(brought.find((x) => x.text === 'Insurance')?.qty, true);
});

test('catching up never disturbs what you chose or wrote', () => {
  const { s, id } = withTrip();
  const trip = s.trips[0];
  pickPackItem(trip, trip.items[0].id, true, '2');
  trip.items[0].done = true;
  trip.items[1].note = 'the one in the hall';
  const kept = trip.items.map((x) => ({ ...x }));

  const gid = addPackCat(s, 'Papers');
  packListOf(s).find((g) => g.id === gid)?.items.push({ id: 'p1', text: 'Passport' });
  packCatchUp(s, id);

  for (const had of kept) {
    assert.deepEqual(s.trips[0].items.find((x) => x.id === had.id), had, had.text);
  }
});

test('a line on the standing list can be told to ask how many, or not to', () => {
  const s = createInitialState(TUE, 'run');
  const it = packListOf(s).flatMap((g) => g.items).find((x) => !x.qty);
  assert.ok(it);
  assert.equal(askHowMany(s, it.id, true), true);
  assert.equal(it.qty, true);
  assert.equal(askHowMany(s, it.id, false), true);
  assert.equal(it.qty, undefined, 'off is absent, not false, so it never clutters a backup');
  assert.equal(askHowMany(s, 'nope', true), false);
});

test('the list a phone with none starts from is a real list, with stable ids', () => {
  // The screen draws this before anything is stored, over and over. Made-up
  // ids would differ every time, and the first edit would go looking for one
  // that had already stopped existing.
  const a = defaultPackList();
  const b = defaultPackList();
  assert.ok(a.length > 0);
  assert.deepEqual(a, b, 'the same list, down to the ids');
  const ids = a.flatMap((g) => [g.id, ...g.items.map((x) => x.id)]);
  assert.equal(new Set(ids).size, ids.length, 'and no two of them the same');
  assert.ok(a.flatMap((g) => g.items).some((x) => x.qty), 'and some of it asks how many');
});

test('showing the default list does not write it', () => {
  const s = createInitialState(TUE, 'run');
  const before = JSON.stringify(s);
  packGroupsOf(s);
  defaultPackList();
  assert.equal(s.packList, undefined, 'nothing was stored by looking');
  assert.equal(JSON.stringify(s), before);
});

test('a list stored empty is given the standard one back', () => {
  const s = createInitialState(TUE, 'run');
  s.packList = [];
  assert.ok(packListOf(s).length > 0);
  assert.ok(packGroupsOf(s).length > 0, 'and reading it answers from the defaults meanwhile');
});

test('asking what is new on the standing list does not write anything down', () => {
  // It is asked while the page is being drawn, and a function that creates
  // the thing it is asked about creates it where nobody is listening: the
  // screen does not redraw and the disk never hears about it.
  const { s, id } = withTrip();
  s.packList = undefined;
  const before = JSON.stringify(s);
  assert.equal(packNew(s, id), 0);
  assert.equal(s.packList, undefined, 'nothing was stored');
  assert.equal(JSON.stringify(s), before, 'nothing at all changed');
});

test('an old standing checklist is carried over, headings and all', () => {
  // It used to be headings mapped to plain strings, so a heading could not be
  // renamed without moving everything under it and a line could not ask how
  // many. What is there is kept, in its order, and the old shape goes.
  const s = createInitialState(TUE, 'run');
  const stored = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  stored.tripTemplate = {
    Flights: ['Book outbound', 'Check in online'],
    Mine: ['Noise-cancelling headphones'],
  };

  const out = migrate(stored as Partial<AppState>);
  assert.ok(out);
  assert.deepEqual(out.packList?.map((g) => g.name), ['Flights', 'Mine']);
  assert.deepEqual(out.packList?.[0].items.map((x) => x.text),
    ['Book outbound', 'Check in online']);
  assert.equal(out.packList?.[1].items[0].qty, undefined, 'nothing asked how many before');
  assert.equal((out as Record<string, unknown>).tripTemplate, undefined, 'and the old shape goes');
});

test('a phone with no standing list of its own is given none to store', () => {
  // The defaults answer for it until something is written, the way the
  // shopping list's do — so a backup still comes back exactly as it went.
  const s = createInitialState(TUE, 'run');
  const out = migrate(JSON.parse(JSON.stringify(s)) as Partial<AppState>);
  assert.ok(out);
  assert.equal(out.packList, undefined);
  assert.ok(packGroupsOf(out).length > 0, 'and it still has a list to show');
});

test('everything on a trip made before there was a choice is being taken', () => {
  // A list that came back with nothing chosen would read as a trip you had
  // not packed for.
  const s = createInitialState(TUE, 'run');
  const stored = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  stored.trips = [{
    id: 'tr1', name: 'Lisbon', tplId: 'holiday', start: '2026-10-23', end: '2026-10-27',
    items: [
      { id: 'c1', cat: 'Flights', text: 'Book outbound', done: true },
      { id: 'c2', cat: 'Flights', text: 'Check in online', done: false },
    ],
  }];

  const out = migrate(stored as Partial<AppState>);
  assert.ok(out);
  assert.deepEqual(out.trips[0].items.map((x) => x.need), [true, true]);
  assert.deepEqual(packCounts(out.trips[0]), { need: 2, done: 1 });
});

test('an amount left on a line nobody is taking is cleared on the way in', () => {
  const s = createInitialState(TUE, 'run');
  const stored = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  stored.trips = [{
    id: 'tr1', name: 'Lisbon', tplId: 'holiday', start: '2026-10-23', end: '2026-10-27',
    items: [
      { id: 'c1', cat: 'Clothes', text: 'Socks', done: false, need: false, amount: '5' },
      { id: 'c2', cat: 'Clothes', text: 'Shirts', done: false, need: true, amount: '  3  ' },
      { id: 'c3', cat: 'Clothes', text: 'Shorts', done: false, need: true, amount: 7 },
    ],
  }];

  const out = migrate(stored as Partial<AppState>);
  assert.ok(out);
  const [socks, shirts, shorts] = out.trips[0].items;
  assert.equal(socks.amount, undefined, 'not being taken, so there is nothing to count');
  assert.equal(shirts.amount, '3', 'tidied');
  assert.equal(shorts.amount, undefined, 'and a number that is not text is not an answer');
});
