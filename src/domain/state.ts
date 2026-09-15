import type { AppState, WatchItem } from './types';
import { DEFAULT_HABITS, DEFAULT_SECTIONS, DEFAULT_TRACKABLES, TEMPLATES, TEMPLATE_ORDER } from './catalogue';
import { createWeek } from './week';
import { isoOf, isoWeekId, mondayOf } from './dates';

export const STATE_VERSION = 1;

export function emptyState(): AppState {
  return {
    habits: DEFAULT_HABITS.map((h) => ({ ...h, def: h.def ? { ...h.def, days: [...h.def.days] } : undefined })),
    templates: JSON.parse(JSON.stringify(TEMPLATES)),
    templateOrder: [...TEMPLATE_ORDER],
    sections: DEFAULT_SECTIONS.map((s) => ({ ...s })),
    trackables: DEFAULT_TRACKABLES.map((t) => ({ ...t })),
    weeks: {},
    watch: [],
    trips: [],
    events: [],
    sample: false,
    version: STATE_VERSION,
  };
}

/** A fresh install: this week only, on the baseline template. */
export function createInitialState(today: Date, templateId = 'general'): AppState {
  const s = emptyState();
  const monday = isoOf(mondayOf(today));
  s.weeks[isoWeekId(mondayOf(today))] = createWeek(s, monday, templateId);
  return s;
}

/** Brings a stored state up to date with habits, trackables and fields added since.
 *  Never removes anything the user has: identity is preserved so history still matches. */
export function migrate(loaded: Partial<AppState> | null): AppState | null {
  if (!loaded || !loaded.weeks || typeof loaded.weeks !== 'object') return null;
  const base = emptyState();
  const s: AppState = {
    ...base,
    ...loaded,
    habits: Array.isArray(loaded.habits) && loaded.habits.length ? loaded.habits : base.habits,
    sections: Array.isArray(loaded.sections) && loaded.sections.length ? loaded.sections : base.sections,
    trackables: Array.isArray(loaded.trackables) && loaded.trackables.length ? loaded.trackables : base.trackables,
    watch: Array.isArray(loaded.watch) ? (loaded.watch as WatchItem[]) : [],
    trips: Array.isArray(loaded.trips) ? loaded.trips : [],
    events: Array.isArray(loaded.events) ? loaded.events : [],
    weeks: loaded.weeks,
    version: STATE_VERSION,
  };

  for (const h of s.habits) if (h.active === undefined) h.active = true;
  if (!s.templates || typeof s.templates !== 'object' || !Object.keys(s.templates).length) {
    s.templates = JSON.parse(JSON.stringify(TEMPLATES));
  }
  // A built-in added after this state was saved should still show up.
  for (const [id, tpl] of Object.entries(TEMPLATES)) if (!s.templates[id]) s.templates[id] = JSON.parse(JSON.stringify(tpl));
  if (!Array.isArray(s.templateOrder) || !s.templateOrder.length) s.templateOrder = [...TEMPLATE_ORDER];
  for (const id of Object.keys(s.templates)) if (!s.templateOrder.includes(id)) s.templateOrder.push(id);
  s.templateOrder = s.templateOrder.filter((id) => s.templates[id]);
  s.trackables.forEach((t, i) => { if (typeof t.ci !== 'number') t.ci = i % 12; });

  const firstSec = s.sections[0].id;
  for (const w of Object.values(s.weeks)) {
    w.untracked ??= {};
    w.complete ??= {};
    w.watched ??= {};
    w.habits ??= {};
    w.tasks ??= {};
    w.habitPlan ??= {};
    for (const arr of Object.values(w.tasks)) {
      for (const t of arr) {
        if (!t.sec || !s.sections.some((x) => x.id === t.sec)) t.sec = firstSec;
        if (t.track === undefined) t.track = null;
      }
    }
  }
  return s;
}
