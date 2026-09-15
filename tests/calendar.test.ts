import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupeEvents } from '../src/domain/calendar';
import type { CalendarEvent } from '../src/domain/types';

function ev(p: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return { time: '07:00', title: 'Easy run', where: '', allDay: false, ...p };
}

test('the same session arriving twice shows once', () => {
  const out = dedupeEvents([
    ev({ id: 'a', where: 'Runna' }),
    ev({ id: 'b', where: 'Outlook' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'a');
  assert.equal(out[0].copies, 2);
});

test('two different sessions on one day both stay', () => {
  const out = dedupeEvents([
    ev({ id: 'a', time: '07:00', title: 'Easy run' }),
    ev({ id: 'b', time: '18:00', title: 'Intervals' }),
  ]);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((e) => e.id), ['a', 'b']);
});

test('the same session done twice in a day stays twice', () => {
  const out = dedupeEvents([
    ev({ id: 'a', time: '07:00', title: 'Easy run' }),
    ev({ id: 'b', time: '18:00', title: 'Easy run' }),
  ]);
  assert.equal(out.length, 2);
});

test('two different sessions at the same time both stay', () => {
  const out = dedupeEvents([
    ev({ id: 'a', title: 'Easy run' }),
    ev({ id: 'b', title: 'Long run' }),
  ]);
  assert.equal(out.length, 2);
});

test('spacing and capitalisation do not make a second copy', () => {
  const out = dedupeEvents([
    ev({ id: 'a', title: 'Easy Run' }),
    ev({ id: 'b', title: '  easy   run ' }),
  ]);
  assert.equal(out.length, 1);
});

test('identically named entries in different places both stay', () => {
  const out = dedupeEvents([
    ev({ id: 'a', title: 'Standup', place: 'Room 1' }),
    ev({ id: 'b', title: 'Standup', place: 'Room 2' }),
  ]);
  assert.equal(out.length, 2);
});

test('a copy that names no place is still a copy', () => {
  const out = dedupeEvents([
    ev({ id: 'a', title: 'Standup', place: 'Room 1' }),
    ev({ id: 'b', title: 'Standup' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].copies, 2);
});

test('the kept copy gains detail the others had', () => {
  const out = dedupeEvents([
    ev({ id: 'a', where: 'Runna' }),
    ev({ id: 'b', where: 'Track', place: 'Track', track: 'run' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].track, 'run');
  assert.equal(out[0].place, 'Track');
  assert.equal(out[0].where, 'Track');
});

test('a repeating entry is not collapsed across days', () => {
  const out = dedupeEvents([
    ev({ id: 'a', allDay: true, time: '', title: 'Holiday', date: '2026-09-15' }),
    ev({ id: 'b', allDay: true, time: '', title: 'Holiday', date: '2026-09-16' }),
    ev({ id: 'c', allDay: true, time: '', title: 'Holiday', date: '2026-09-16' }),
  ]);
  assert.deepEqual(out.map((e) => e.id), ['a', 'b']);
  assert.equal(out[1].copies, 2);
});

test('an all-day copy does not collapse into a timed entry of the same name', () => {
  const out = dedupeEvents([
    ev({ id: 'a', allDay: true, time: '', title: 'Race' }),
    ev({ id: 'b', time: '09:00', title: 'Race' }),
  ]);
  assert.equal(out.length, 2);
});

test('the originals are left alone', () => {
  const input = [ev({ id: 'a' }), ev({ id: 'b' })];
  dedupeEvents(input);
  assert.equal(input[0].copies, undefined);
});
