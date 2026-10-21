import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyBox, fileLine, typed } from '../src/domain/composing';

const LIMIT = 120;
/** Typing a word one letter at a time, the way a box actually hears it. */
const type = (box: typeof emptyBox, word: string) =>
  word.split('').reduce((b, _c, i) => typed(b, word.slice(0, i + 1)), box);

test('a line is filed and the box is left empty', () => {
  const r = fileLine(type(emptyBox, 'Gym'), 'Gym', LIMIT);
  assert.equal(r.add, 'Gym');
  assert.equal(r.done, false);
  assert.equal(r.box.text, '');
});

test('the correction that Return accepted does not come back as a line', () => {
  // The bug, in order: type the misspelling, Return reports the corrected
  // text, and the change carrying that correction arrives afterwards.
  let box = type(emptyBox, 'taks');
  const r = fileLine(box, 'task', LIMIT);
  assert.equal(r.add, 'task', 'what the box said it held, not what we remembered');
  box = r.box;

  box = typed(box, 'task');
  assert.equal(box.text, '', 'the echo of its own Return is dropped');

  // And a second Return now has nothing in the box, so it means you are done
  // rather than making the task again.
  const again = fileLine(box, '', LIMIT);
  assert.equal(again.add, null);
  assert.equal(again.done, true);
});

test('one change only: the same words typed again are yours', () => {
  const first = fileLine(type(emptyBox, 'Gym'), 'Gym', LIMIT);
  let box = typed(first.box, 'Gym');          // the echo, swallowed
  box = type(box, 'Gym');                     // typed again, on purpose
  assert.equal(box.text, 'Gym');
  const second = fileLine(box, 'Gym', LIMIT);
  assert.equal(second.add, 'Gym', 'two of the same thing is a thing people want');
});

test('a Return that arrives twice adds once', () => {
  const box = type(emptyBox, 'Gym');
  const first = fileLine(box, 'Gym', LIMIT);
  assert.equal(first.add, 'Gym');
  const second = fileLine(first.box, 'Gym', LIMIT);
  assert.equal(second.add, null, 'the same Return reported again is still one Return');
  assert.equal(second.done, false, 'and it does not close the box either');
});

test('nothing written means you are finished', () => {
  const r = fileLine(emptyBox, '', LIMIT);
  assert.equal(r.add, null);
  assert.equal(r.done, true);
});

test('spaces are nothing written', () => {
  const r = fileLine(type(emptyBox, '   '), '   ', LIMIT);
  assert.equal(r.add, null);
  assert.equal(r.done, true);
});

test('a line is trimmed and cut to the limit', () => {
  const r = fileLine(emptyBox, `  ${'x'.repeat(200)}  `, LIMIT);
  assert.equal(r.add?.length, LIMIT);
  const s = fileLine(emptyBox, '  Gym  ', LIMIT);
  assert.equal(s.add, 'Gym');
  assert.equal(s.box.filed, '  Gym  ',
    'what it remembers filing is what the box held, not the tidied line');
});

test('the echo is matched against what the box held, untidied', () => {
  // The change event repeats the box's own text, spaces and all, so that is
  // what has to be remembered to recognise it.
  const r = fileLine(emptyBox, '  Gym  ', LIMIT);
  const after = typed(r.box, '  Gym  ');
  assert.equal(after.text, '');
});
