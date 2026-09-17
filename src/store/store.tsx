import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppState } from '../domain/types';
import { createInitialState, migrate } from '../domain/state';
import { decideLoad } from '../domain/load';
import { ensurePlanCoverage, ensureWeek } from '../domain/week';
import { isoOf, mondayOf, weekIdOf } from '../domain/dates';
import { todayIndex } from '../domain/scoring';

const KEY = 'optimal-week/state/v1';
/** One step of undo, so an accidental restore is never the end of it. */
const PREV_KEY = 'optimal-week/state/previous';
/** How many steps back Undo reaches. Held in memory only — closing the app
 *  is a clean slate, because undoing something from last week is not undo. */
const UNDO_DEPTH = 25;
/** The last state that was read back successfully. Rotated once per launch,
 *  before anything is written, so a bad write can never reach both copies. */
const SAFE_KEY = 'optimal-week/state/last-good';

interface Store {
  state: AppState;
  ready: boolean;
  /** Week currently being looked at. */
  weekId: string;
  /** Day being looked at, 0=Mon..6=Sun. */
  day: number;
  today: Date;
  setWeekId: (id: string) => void;
  setDay: (d: number) => void;
  /** Mutate a draft copy; the result is persisted automatically.
   *  Pass a label to describe the change, which Undo then quotes back. */
  update: (mutator: (draft: AppState) => void, label?: string) => void;
  /** Step back through recent changes. */
  undo: () => void;
  /** What undoing would put back, or null when there is nothing to undo. */
  undoLabel: string | null;
  /** Replace everything, keeping one step of undo. Used by Restore. */
  replaceAll: (next: AppState) => void;
  /** Put back whatever was here before the last restore. */
  undoReplace: () => Promise<boolean>;
  /** True when there is something to undo. */
  canUndo: boolean;
  reset: () => void;
  /** Set when something is stored that could not be read. Nothing is written
   *  while this holds, so the unreadable copy stays on the phone. */
  trouble: Trouble | null;
  /** Give up on the unreadable copy and start fresh. Deliberate, never automatic. */
  startFresh: () => void;
}

export interface Trouble {
  /** 'unreadable': the saved state could not be read and nothing is being saved.
   *  'fellback': the live copy was unreadable, so the safety copy was used.
   *  'writing': saving is failing. */
  kind: 'unreadable' | 'fellback' | 'writing';
  detail: string;
  /** The bytes that could not be read, kept so they can be exported. */
  raw?: string;
}

const StoreContext = createContext<Store | null>(null);

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const today = useMemo(() => new Date(), []);
  const [state, setState] = useState<AppState>(() => createInitialState(today));
  const [ready, setReady] = useState(false);
  const [weekId, setWeekId] = useState(() => weekIdOf(today));
  const [day, setDay] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<AppState | null>(null);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  /** Blocks every write. Set when the saved state could not be read, so that
   *  a failure to load can never become a failure to keep. */
  const frozen = useRef(false);

  /** Load once, repairing anything a previous version did not know about. */
  useEffect(() => {
    let alive = true;
    (async () => {
      let current: string | null = null;
      let backup: string | null = null;
      let readFailed = false;
      try {
        [current, backup] = await Promise.all([
          AsyncStorage.getItem(KEY), AsyncStorage.getItem(SAFE_KEY),
        ]);
      } catch (e) {
        // Storage itself would not answer. Assume the worst and touch nothing.
        readFailed = true;
      }
      if (!alive) return;

      if (readFailed) {
        frozen.current = true;
        setTrouble({ kind: 'unreadable', detail: 'The phone would not open the saved data.' });
        setReady(true);
        return;
      }

      const outcome = decideLoad(current, backup);

      if (outcome.kind === 'unreadable') {
        frozen.current = true;
        setTrouble({
          kind: 'unreadable',
          detail: 'There is saved data on this phone that this version cannot read. '
            + 'Nothing is being saved, so it is still there.',
          raw: outcome.raw,
        });
        setReady(true);
        return;
      }

      const s = outcome.kind === 'loaded' ? outcome.state : createInitialState(today);

      // Rotate the safety copy to whatever just read back cleanly, before a
      // single write happens. The two copies are never bad at the same time.
      if (outcome.kind === 'loaded') {
        const keep = outcome.from === 'current' ? current : backup;
        if (keep) AsyncStorage.setItem(SAFE_KEY, keep).catch(() => {});
        if (outcome.from === 'backup') {
          setTrouble({
            kind: 'fellback',
            detail: 'The main copy could not be read, so the safety copy from the start of '
              + 'your last session was used. Anything after that point may be missing.',
          });
        }
      }

      const id = ensureWeek(s, isoOf(mondayOf(today)));
      ensurePlanCoverage(s, id);
      setState(s);
      setWeekId(id);
      setDay(Math.max(0, todayIndex(s.weeks[id], today)));
      setReady(true);
      AsyncStorage.getItem(PREV_KEY).then((v) => { if (alive) setCanUndo(Boolean(v)); }).catch(() => {});
    })();
    return () => { alive = false; };
  }, [today]);

  const write = useCallback(async (s: AppState) => {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(s));
      setTrouble((t) => (t?.kind === 'writing' ? null : t));
    } catch (e) {
      setTrouble({
        kind: 'writing',
        detail: e instanceof Error ? e.message : 'The phone refused to save.',
      });
    }
  }, []);

  const persist = useCallback((s: AppState) => {
    if (frozen.current) return;
    pending.current = s;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const due = pending.current;
      pending.current = null;
      if (due) void write(due);
    }, 300);
  }, [write]);

  /** Anything still inside the debounce when the app goes away is written now,
   *  rather than trusting a timer on an app iOS is about to suspend. */
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      const due = pending.current;
      pending.current = null;
      if (due && !frozen.current) void write(due);
    };
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next !== 'active') flush();
    });
    return () => { flush(); sub.remove(); };
  }, [write]);

  /** Accept that the unreadable copy is not coming back. Only ever from a
   *  button, never on its own. */
  const startFresh = useCallback(() => {
    frozen.current = false;
    const s = createInitialState(today);
    const id = ensureWeek(s, isoOf(mondayOf(today)));
    ensurePlanCoverage(s, id);
    setState(s);
    setWeekId(id);
    setDay(Math.max(0, todayIndex(s.weeks[id], today)));
    setTrouble(null);
    void write(s);
  }, [today, write]);

  /** Recent states, newest last. Deep copies, which is affordable because the
   *  whole thing is a few hundred kilobytes of JSON and the cap is small. */
  const history = useRef<{ state: AppState; label: string }[]>([]);
  /** Bumped whenever the stack changes, purely to re-render the Undo control.
   *  The stack itself lives in a ref: it is not drawn, only read. */
  const [, bumpUndo] = useState(0);

  const update = useCallback((mutator: (draft: AppState) => void, label = 'that change') => {
    setState((prev) => {
      const draft = clone(prev);
      mutator(draft);
      // Only remember a step that actually changed something, so Undo never
      // sits there doing nothing. The guard on `prev` also means a double
      // invocation of this updater cannot push the same step twice.
      const stack = history.current;
      if (stack[stack.length - 1]?.state !== prev
          && JSON.stringify(draft) !== JSON.stringify(prev)) {
        history.current = [...stack, { state: prev, label }].slice(-UNDO_DEPTH);
      }
      persist(draft);
      return draft;
    });
    bumpUndo((n) => n + 1);
  }, [persist]);

  const undo = useCallback(() => {
    const stack = history.current;
    if (!stack.length) return;
    const last = stack[stack.length - 1];
    history.current = stack.slice(0, -1);
    setState(last.state);
    persist(last.state);
    bumpUndo((n) => n + 1);
  }, [persist]);

  const undoLabel = history.current.length
    ? history.current[history.current.length - 1].label
    : null;

  /** Land a restored state: stash the current one first, then switch to it. */
  const replaceAll = useCallback((next: AppState) => {
    // A restore is the cure for a frozen store, so it lifts the freeze.
    frozen.current = false;
    setTrouble(null);
    setState((prev) => {
      AsyncStorage.setItem(PREV_KEY, JSON.stringify(prev)).then(() => setCanUndo(true)).catch(() => {});
      const id = ensureWeek(next, isoOf(mondayOf(today)));
      ensurePlanCoverage(next, id);
      setWeekId(id);
      setDay(Math.max(0, todayIndex(next.weeks[id], today)));
      persist(next);
      return next;
    });
  }, [persist, today]);

  const undoReplace = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PREV_KEY);
      if (!raw) return false;
      const restored = migrate(JSON.parse(raw));
      if (!restored) return false;
      const id = ensureWeek(restored, isoOf(mondayOf(today)));
      ensurePlanCoverage(restored, id);
      setState(restored);
      setWeekId(id);
      setDay(Math.max(0, todayIndex(restored.weeks[id], today)));
      persist(restored);
      await AsyncStorage.removeItem(PREV_KEY);
      setCanUndo(false);
      return true;
    } catch {
      return false;
    }
  }, [persist, today]);

  const reset = useCallback(() => {
    frozen.current = false;
    setTrouble(null);
    const s = createInitialState(today);
    setState(s);
    setWeekId(weekIdOf(today));
    setDay(Math.max(0, todayIndex(s.weeks[weekIdOf(today)], today)));
    persist(s);
  }, [today, persist]);

  const value = useMemo<Store>(
    () => ({ state, ready, weekId, day, today, setWeekId, setDay, update, undo, undoLabel,
      replaceAll, undoReplace, canUndo, reset, trouble, startFresh }),
    [state, ready, weekId, day, today, update, undo, undoLabel, replaceAll, undoReplace,
      canUndo, reset, trouble, startFresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}

/** The week being looked at, guaranteed to exist. */
export function useWeek() {
  const { state, weekId } = useStore();
  return state.weeks[weekId] ?? state.weeks[Object.keys(state.weeks).sort()[0]];
}
