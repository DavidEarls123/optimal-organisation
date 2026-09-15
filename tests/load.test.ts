import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideLoad } from '../src/domain/load';
import { createInitialState } from '../src/domain/state';

const TUE = new Date(2026, 8, 15);
const good = () => JSON.stringify(createInitialState(TUE, 'run'));

test('nothing stored at all is a first run', () => {
  assert.equal(decideLoad(null, null).kind, 'fresh');
});

test('a readable state is loaded', () => {
  const out = decideLoad(good(), null);
  assert.equal(out.kind, 'loaded');
  assert.equal(out.kind === 'loaded' && out.from, 'current');
});

test('truncated JSON falls back to the safety copy rather than starting fresh', () => {
  const out = decideLoad('{"weeks":{"2026-W38":', good());
  assert.equal(out.kind, 'loaded');
  assert.equal(out.kind === 'loaded' && out.from, 'backup');
});

test('a state that migrate refuses falls back to the safety copy', () => {
  const out = decideLoad(JSON.stringify({ habits: [], version: 3 }), good());
  assert.equal(out.kind, 'loaded');
  assert.equal(out.kind === 'loaded' && out.from, 'backup');
});

test('a state that makes migrate throw falls back to the safety copy', () => {
  const broken = JSON.parse(good());
  broken.weeks['2026-W38'] = null;
  const out = decideLoad(JSON.stringify(broken), good());
  assert.equal(out.kind, 'loaded');
  assert.equal(out.kind === 'loaded' && out.from, 'backup');
});

test('a week whose tasks are not arrays is repaired rather than thrown out', () => {
  // This used to throw, which meant a wipe. It is now fixed in place, so the
  // day comes back empty instead of the year coming back empty.
  const broken = JSON.parse(good());
  broken.weeks['2026-W38'].tasks = { 0: 'not an array' };
  const out = decideLoad(JSON.stringify(broken), null);
  assert.equal(out.kind, 'loaded');
  assert.deepEqual(out.kind === 'loaded' && out.state.weeks['2026-W38'].tasks[0], []);
});

test('unreadable with no safety copy is never reported as a first run', () => {
  const out = decideLoad('{ this is not json', null);
  assert.equal(out.kind, 'unreadable');
});

test('unreadable hands the bytes back untouched, so nothing is destroyed', () => {
  const raw = '{ this is not json';
  const out = decideLoad(raw, null);
  assert.equal(out.kind === 'unreadable' && out.raw, raw);
});

test('both copies unreadable is unreadable, not fresh', () => {
  assert.equal(decideLoad('nonsense', 'also nonsense').kind, 'unreadable');
});

test('an empty history is treated as unreadable, not as a real empty state', () => {
  // The shape is valid but every week is gone: far more likely a bad write
  // than a real state, and starting fresh here would overwrite the backup.
  const out = decideLoad(JSON.stringify({ ...JSON.parse(good()), weeks: {} }), good());
  assert.equal(out.kind, 'loaded');
  assert.equal(out.kind === 'loaded' && out.from, 'backup');
});

test('the safety copy is used even when the live copy is an empty string', () => {
  const out = decideLoad('', good());
  assert.equal(out.kind, 'loaded');
  assert.equal(out.kind === 'loaded' && out.from, 'backup');
});

test('a loaded state keeps its weeks', () => {
  const out = decideLoad(good(), null);
  assert.ok(out.kind === 'loaded' && Object.keys(out.state.weeks).length > 0);
});
