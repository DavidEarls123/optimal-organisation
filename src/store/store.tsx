import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppState } from '../domain/types';
import { createInitialState, migrate } from '../domain/state';
import { ensurePlanCoverage, ensureWeek } from '../domain/week';
import { isoOf, mondayOf, weekIdOf } from '../domain/dates';
import { todayIndex } from '../domain/scoring';

const KEY = 'optimal-week/state/v1';

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
  /** Mutate a draft copy; the result is persisted automatically. */
  update: (mutator: (draft: AppState) => void) => void;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const today = useMemo(() => new Date(), []);
  const [state, setState] = useState<AppState>(() => createInitialState(today));
  const [ready, setReady] = useState(false);
  const [weekId, setWeekId] = useState(() => weekIdOf(today));
  const [day, setDay] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Load once, repairing anything a previous version did not know about. */
  useEffect(() => {
    let alive = true;
    (async () => {
      let next: AppState | null = null;
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) next = migrate(JSON.parse(raw));
      } catch {
        next = null;
      }
      if (!alive) return;
      const s = next ?? createInitialState(today);
      const id = ensureWeek(s, isoOf(mondayOf(today)));
      ensurePlanCoverage(s, id);
      setState(s);
      setWeekId(id);
      setDay(Math.max(0, todayIndex(s.weeks[id], today)));
      setReady(true);
    })();
    return () => { alive = false; };
  }, [today]);

  const persist = useCallback((s: AppState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
    }, 300);
  }, []);

  const update = useCallback((mutator: (draft: AppState) => void) => {
    setState((prev) => {
      const draft = clone(prev);
      mutator(draft);
      persist(draft);
      return draft;
    });
  }, [persist]);

  const reset = useCallback(() => {
    const s = createInitialState(today);
    setState(s);
    setWeekId(weekIdOf(today));
    setDay(Math.max(0, todayIndex(s.weeks[weekIdOf(today)], today)));
    persist(s);
  }, [today, persist]);

  const value = useMemo<Store>(
    () => ({ state, ready, weekId, day, today, setWeekId, setDay, update, reset }),
    [state, ready, weekId, day, today, update, reset],
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
