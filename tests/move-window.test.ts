import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveChoices, sortForDisplay } from '../src/domain/week';
import type { Task } from '../src/domain/types';

const TODAY = '2026-09-15';   // Tuesday

const isos = (from: string, today = TODAY) => moveChoices(from, today).map((x) => x.iso);

test('the strip is a window around the day, seven wide', () => {
  assert.equal(moveChoices('2026-09-20', TODAY).length, 7);
});

test('a day well ahead gets three either side of it', () => {
  assert.deepEqual(isos('2026-09-23'), [
    '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23',
    '2026-09-24', '2026-09-25', '2026-09-26',
  ]);
});

test('days already gone are not offered', () => {
  const out = isos('2026-09-16');
  assert.ok(out.every((iso) => iso >= TODAY), 'nothing before today');
  assert.equal(out[0], TODAY, 'the window starts at today instead');
});

test('losing the past does not make the strip shorter', () => {
  assert.equal(isos('2026-09-15').length, 7, 'standing on today');
  assert.equal(isos('2026-09-16').length, 7, 'or the day after');
});

test('standing on today, the window runs a week forward', () => {
  assert.deepEqual(isos(TODAY), [
    '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
    '2026-09-19', '2026-09-20', '2026-09-21',
  ]);
});

test('the window crosses into next month without complaint', () => {
  assert.deepEqual(isos('2026-09-30').slice(3), [
    '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
  ]);
});

test('the day being moved from is marked, and so is today', () => {
  const out = moveChoices('2026-09-17', TODAY);
  assert.equal(out.filter((x) => x.isFrom).length, 1);
  assert.equal(out.find((x) => x.isFrom)!.iso, '2026-09-17');
  assert.equal(out.find((x) => x.isToday)!.iso, TODAY);
});

test('each choice carries its weekday and its date', () => {
  const wed = moveChoices('2026-09-16', TODAY).find((x) => x.iso === '2026-09-16')!;
  assert.equal(wed.day, 2, 'Monday is 0, so Wednesday is 2');
  assert.equal(wed.date, 16);
});

test('a day far in the past still only offers days from today', () => {
  const out = isos('2026-01-05');
  assert.equal(out[0], TODAY);
  assert.equal(out.length, 7);
});

const task = (id: string, state: Task['state'], doneAt?: number): Task => ({
  id, text: id, state, plan: false, track: null, sec: 's1', ...(doneAt ? { doneAt } : {}),
});

test('still-to-do tasks keep the order you put them in', () => {
  const out = sortForDisplay([task('a', 'open'), task('b', 'open'), task('c', 'open')]);
  assert.deepEqual(out.map((x) => x.id), ['a', 'b', 'c']);
});

test('ticked tasks sink, most recently ticked at the top of them', () => {
  const out = sortForDisplay([
    task('first', 'done', 100),
    task('open', 'open'),
    task('latest', 'done', 300),
    task('middle', 'done', 200),
  ]);
  assert.deepEqual(out.map((x) => x.id), ['open', 'latest', 'middle', 'first'],
    'the first thing you finished ends up at the very bottom');
});

test('a task ticked before times were recorded sorts to the bottom, not the top', () => {
  const out = sortForDisplay([task('old', 'done'), task('new', 'done', 500)]);
  assert.deepEqual(out.map((x) => x.id), ['new', 'old']);
});

test('nothing is lost or invented in the sort', () => {
  const input = [task('a', 'done', 2), task('b', 'open'), task('c', 'done', 1)];
  assert.equal(sortForDisplay(input).length, 3);
  assert.deepEqual(input.map((x) => x.id), ['a', 'b', 'c'], 'and the original is untouched');
});
