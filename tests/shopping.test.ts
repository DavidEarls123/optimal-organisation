import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, migrate } from '../src/domain/state';
import {
  buildTripItems, ensureWeek, marksOn, resetShopFromTemplate, shopCounts, shopListFor,
  shopTemplateOf, shoppingList, tripTemplateOf,
} from '../src/domain/week';
import { TRIP_CATEGORIES } from '../src/domain/catalogue';
import type { AppState, ShopGroup } from '../src/domain/types';

const TUE = new Date(2026, 8, 15);
const WEEK = '2026-W38';
const fresh = (): AppState => createInitialState(TUE, 'run');

test('the standard list starts with the seven headings', () => {
  const s = fresh();
  assert.deepEqual(shopTemplateOf(s).map((g) => g.name), [
    'Breakfast', 'Lunch', 'Dinner', 'Snacks', 'Home', 'Personal', 'Miscellaneous',
  ]);
});

test('a first week is built from the standard list, needing nothing', () => {
  const s = fresh();
  const list = shopListFor(s, WEEK);
  assert.ok(list.length > 0);
  assert.ok(list.some((g) => g.items.length > 0), 'the things you always buy are written down');
  assert.equal(list.every((g) => g.items.every((i) => !i.need && !i.done)), true,
    'but nothing is decided for you');
});

test('what you need is separate from what you got', () => {
  const s = fresh();
  const list = shopListFor(s, WEEK);
  const g = list.find((x) => x.items.length >= 2)!;
  g.items[0].need = true;
  g.items[1].need = true;
  g.items[0].done = true;
  assert.deepEqual(shopCounts(list), { need: 2, got: 1 });
});

test('the shopping list is only what is needed, and drops empty headings', () => {
  const s = fresh();
  const list = shopListFor(s, WEEK);
  const g = list.find((x) => x.items.length >= 2)!;
  g.items[0].need = true;

  const trolley = shoppingList(list);
  assert.equal(trolley.length, 1, 'one heading has anything in it');
  assert.equal(trolley[0].items.length, 1);
  assert.equal(trolley[0].items[0].id, g.items[0].id);
});

test('nothing needed means nothing to walk round with', () => {
  const s = fresh();
  assert.deepEqual(shoppingList(shopListFor(s, WEEK)), []);
});

test('things you did not need are not counted as things you failed to buy', () => {
  const s = fresh();
  const list = shopListFor(s, WEEK);
  const g = list.find((x) => x.items.length >= 3)!;
  g.items[0].need = true;
  g.items[0].done = true;
  assert.deepEqual(shopCounts(list), { need: 1, got: 1 }, 'complete, despite the untouched items');
});

test('next week carries the list over with every decision reset', () => {
  const s = fresh();
  const list = shopListFor(s, WEEK);
  const g = list.find((x) => x.items.length >= 1)!;
  g.items[0].need = true;
  g.items[0].done = true;
  g.items.push({ id: 'extra', text: 'Birthday card', need: true, done: false });

  const nextId = ensureWeek(s, '2026-09-21');
  const next = shopListFor(s, nextId);

  assert.ok(next.some((x) => x.items.some((i) => i.text === 'Birthday card')),
    'what you added last week is still written down');
  assert.equal(next.every((x) => x.items.every((i) => !i.need && !i.done)), true,
    'but last week’s shopping is not this week’s shopping');
  assert.deepEqual(shopCounts(next), { need: 0, got: 0 });
});

test('editing the standard list does not touch a week already built', () => {
  const s = fresh();
  const list = shopListFor(s, WEEK);
  const before = list.reduce((a, g) => a + g.items.length, 0);
  shopTemplateOf(s)[0].items.push({ id: 'new', text: 'Kippers', need: false, done: false });
  assert.equal(list.reduce((a, g) => a + g.items.length, 0), before);
});

test('rebuilding a week from the standard list replaces it', () => {
  const s = fresh();
  const list = shopListFor(s, WEEK);
  list[0].items[0].need = true;
  list.push({ id: 'g-extra', name: 'One off', items: [] });

  assert.equal(resetShopFromTemplate(s, WEEK), true);

  const after = s.weeks[WEEK].shop as ShopGroup[];
  assert.ok(!after.some((g) => g.name === 'One off'));
  assert.deepEqual(shopCounts(after), { need: 0, got: 0 });
});

test('a list saved with one tick is read as needed, not as already bought', () => {
  // Before the second tick existed, a ticked item meant "on the list".
  const s = fresh();
  shopListFor(s, WEEK);
  const raw = JSON.parse(JSON.stringify(s));
  raw.weeks[WEEK].shop = [{ id: 'g1', name: 'Dinner', items: [
    { id: 'i1', text: 'Mince', done: true },
    { id: 'i2', text: 'Pasta', done: false },
  ] }];

  const back = migrate(raw)!;
  const items = (back.weeks[WEEK].shop as ShopGroup[])[0].items;
  assert.equal(items[0].need, true);
  assert.equal(items[0].done, true, 'and what was bought stays bought');
  assert.equal(items[1].need, true, 'everything on the old list was on the list');
  assert.equal(items[1].done, false);
});

test('the standard trip checklist starts from the built-in one', () => {
  const s = fresh();
  const tpl = tripTemplateOf(s);
  assert.deepEqual(Object.keys(tpl), TRIP_CATEGORIES);
  assert.ok(tpl.Flights.includes('Check in online'));
});

test('a trip is built from your checklist plus what that kind adds', () => {
  const s = fresh();
  tripTemplateOf(s).Flights.push('Seat booked');
  const items = buildTripItems(s, 'race');
  const flights = items.filter((x) => x.cat === 'Flights').map((x) => x.text);
  assert.ok(flights.includes('Seat booked'), 'yours');
  assert.ok(flights.includes('Race kit in hand luggage — never the hold'), 'and the kind’s');
});

test('an item in both your list and the kind is only added once', () => {
  const s = fresh();
  tripTemplateOf(s).Flights.push('Race kit in hand luggage — never the hold');
  const flights = buildTripItems(s, 'race').filter((x) => x.cat === 'Flights');
  const dupes = flights.filter((x) => x.text.startsWith('Race kit'));
  assert.equal(dupes.length, 1);
});

test('removing something from the checklist keeps it off new trips', () => {
  const s = fresh();
  const tpl = tripTemplateOf(s);
  tpl.Flights = tpl.Flights.filter((x) => x !== 'Check in online');
  const flights = buildTripItems(s, 'weekend').map((x) => x.text);
  assert.ok(!flights.includes('Check in online'));
});

test('a day inside a trip is marked, and so is the day a countdown lands on', () => {
  const s = fresh();
  s.trips = [{ id: 'tr', name: 'Lisbon', tplId: 'holiday', start: '2026-09-16',
    end: '2026-09-18', items: [] }];
  s.events = [{ id: 'e', name: 'Dentist', date: '2026-09-20', source: 'added' }];

  assert.deepEqual(marksOn(s, '2026-09-17'), { trips: ['Lisbon'], events: [] },
    'the middle of a trip counts, not just the first day');
  assert.deepEqual(marksOn(s, '2026-09-18'), { trips: ['Lisbon'], events: [] }, 'and the last day');
  assert.deepEqual(marksOn(s, '2026-09-19'), { trips: [], events: [] });
  assert.deepEqual(marksOn(s, '2026-09-20'), { trips: [], events: ['Dentist'] });
});
