/** What a box you are adding lines in holds, and what it has already filed.
 *
 *  Pure, and here rather than beside the box it describes, because the order
 *  the events arrive in is the whole problem and the only way to be sure about
 *  an order is to write it down and test it.
 *
 *  The sequence that goes wrong: you type "taks", the keyboard offers "task",
 *  you press Return. iOS accepts the correction into the box and reports the
 *  Return — and the change reaches JavaScript *after* that. So the box is
 *  emptied by the Return and then told, a moment later, that it contains
 *  "task". Accepting that puts the line you just filed back in the box, it
 *  looks as though nothing happened, you press Return again, and now there
 *  are two of it.
 *
 *  So a box remembers the one thing it last filed. The next change carrying
 *  exactly that is the echo of its own Return and is dropped. One change only:
 *  whatever comes after it is you typing, even if you type the same thing
 *  again. */
export interface Box {
  /** What is in it. */
  text: string;
  /** What it held when it was last filed, until one change has gone by. */
  filed: string | null;
}

export const emptyBox: Box = { text: '', filed: null };

/** A change from the box. */
export function typed(box: Box, said: string): Box {
  if (box.filed !== null && said === box.filed) return { ...box, filed: null };
  return { text: said, filed: null };
}

/** Return, or the button. `said` is what the box itself reports holding, which
 *  beats what we last remembered of it; without it, what we remembered.
 *
 *  Returns the line to add, if any, and whether this means you are finished —
 *  which is what nothing written means. */
export function fileLine(box: Box, said: string | undefined, limit: number): {
  box: Box; add: string | null; done: boolean;
} {
  const raw = said ?? box.text;
  // A Return that repeats what was just filed, with nothing typed in between,
  // is that Return arriving twice. Once is enough.
  if (box.filed !== null && raw === box.filed) return { box, add: null, done: false };
  const line = raw.trim().slice(0, limit);
  if (!line) return { box: { text: '', filed: null }, add: null, done: true };
  return { box: { text: '', filed: raw }, add: line, done: false };
}
