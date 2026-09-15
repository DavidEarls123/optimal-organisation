import type { AppState } from './types';
import { migrate } from './state';

/** Deciding what to do with what is on disk is the most dangerous code in the
 *  app: get it wrong and the answer is silently "start fresh", which then gets
 *  written straight over the real data. So the decision is made here, as a pure
 *  function with no storage and no React anywhere near it, and every branch is
 *  tested.
 *
 *  The rule is: never conclude "there is nothing here" from a failure to read.
 *  Missing and unreadable are different answers and must stay different. */

export type LoadOutcome =
  /** Read it. `from` says whether the live copy or the safety copy was used. */
  | { kind: 'loaded'; state: AppState; from: 'current' | 'backup' }
  /** Genuinely nothing stored — a first run, or after a deliberate wipe. */
  | { kind: 'fresh' }
  /** Something is stored and cannot be read. The bytes are handed back
   *  untouched so they can be exported and examined rather than destroyed. */
  | { kind: 'unreadable'; raw: string };

function attempt(raw: string | null): AppState | null {
  if (!raw) return null;
  try {
    const parsed = migrate(JSON.parse(raw) as Partial<AppState>);
    // A state with no weeks at all is not a state; treat it as unreadable
    // rather than quietly handing back an empty history.
    if (!parsed || !parsed.weeks || !Object.keys(parsed.weeks).length) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Works out what to do with the two stored copies. */
export function decideLoad(current: string | null, backup: string | null): LoadOutcome {
  if (!current && !backup) return { kind: 'fresh' };

  const live = attempt(current);
  if (live) return { kind: 'loaded', state: live, from: 'current' };

  const safe = attempt(backup);
  if (safe) return { kind: 'loaded', state: safe, from: 'backup' };

  return { kind: 'unreadable', raw: current ?? backup ?? '' };
}
