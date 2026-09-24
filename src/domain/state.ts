import { DEFAULT_PREFS, NOTE_LIMIT, TEXT_SIZES } from './types';
import type { AppState, WatchItem, ShopGroup } from './types';
import { DEFAULT_HABITS, DEFAULT_SECTIONS, DEFAULT_TRACKABLES, TEMPLATES, TEMPLATE_ORDER, TRIP_CATEGORIES } from './catalogue';
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
    prefs: { ...DEFAULT_PREFS },
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

  s.prefs = { ...DEFAULT_PREFS, ...(loaded.prefs ?? {}) };
  if (!['system', 'light', 'dark'].includes(s.prefs.theme)) s.prefs.theme = 'system';
  if (!['kg', 'lb'].includes(s.prefs.weightUnit)) s.prefs.weightUnit = 'kg';
  if (!TEXT_SIZES.some((x) => x.key === s.prefs.textSize)) s.prefs.textSize = DEFAULT_PREFS.textSize;
  // The day used to be markable five different ways. There is one now, so a
  // stored choice is nothing but clutter.
  delete (s.prefs as { dayStyle?: unknown }).dayStyle;

  for (const h of s.habits) if (h.active === undefined) h.active = true;
  // Renamed to TV. Only touched when it still holds the name it shipped with,
  // so a habit renamed by hand keeps whatever it was called.
  for (const h of s.habits) {
    if (h.id !== 'tv') continue;
    if (h.name === 'Watch something') h.name = 'TV';
    if (h.short === 'Watch') h.short = 'TV';
  }
  if (!s.templates || typeof s.templates !== 'object' || !Object.keys(s.templates).length) {
    s.templates = JSON.parse(JSON.stringify(TEMPLATES));
  }
  // A built-in added after this state was saved should still show up.
  for (const [id, tpl] of Object.entries(TEMPLATES)) if (!s.templates[id]) s.templates[id] = JSON.parse(JSON.stringify(tpl));
  if (!Array.isArray(s.templateOrder) || !s.templateOrder.length) s.templateOrder = [...TEMPLATE_ORDER];
  for (const id of Object.keys(s.templates)) if (!s.templateOrder.includes(id)) s.templateOrder.push(id);
  s.templateOrder = s.templateOrder.filter((id) => s.templates[id]);
  s.trackables.forEach((t, i) => { if (typeof t.ci !== 'number') t.ci = i % 12; });

  // Shop items gained a second tick. Anything saved with only `done` meant
  // "on the list", which is what `need` means now — so that is where it goes,
  // rather than reading as already bought.
  const fixShop = (groups: ShopGroup[] | undefined) => {
    if (!Array.isArray(groups)) return;
    for (const g of groups) {
      if (!Array.isArray(g?.items)) { g.items = []; continue; }
      for (const it of g.items) {
        if (typeof it.need !== 'boolean') { it.need = true; it.done = Boolean(it.done); }
      }
    }
  };
  fixShop(s.shopTemplate);

  // A trip's checklist is as editable as a day now: its own headings, and a
  // note on anything that needs one. Both are repaired rather than trusted.
  for (const trip of s.trips) {
    if (!Array.isArray(trip?.items)) { trip.items = []; continue; }
    if (trip.cats !== undefined) {
      const cats = Array.isArray(trip.cats)
        ? trip.cats.filter((x) => typeof x === 'string' && x.trim()) : [];
      if (cats.length) trip.cats = cats; else delete trip.cats;
    }
    for (const it of trip.items) {
      if (typeof it.cat !== 'string' || !it.cat) it.cat = (trip.cats ?? TRIP_CATEGORIES)[0];
      it.done = Boolean(it.done);
      if (it.note !== undefined) {
        const note = typeof it.note === 'string' ? it.note.slice(0, NOTE_LIMIT).trim() : '';
        if (note) it.note = note; else delete it.note;
      }
    }
  }

  const firstSec = s.sections[0].id;
  for (const w of Object.values(s.weeks)) {
    w.untracked ??= {};
    w.complete ??= {};
    w.watched ??= {};
    w.habits ??= {};
    w.tasks ??= {};
    w.habitPlan ??= {};
    w.at ??= {};
    w.readings ??= {};
    fixShop(w.shop);
    for (const [d, arr] of Object.entries(w.tasks)) {
      if (!Array.isArray(arr)) { w.tasks[Number(d)] = []; continue; }
      // 'dropped' is gone: a task is either live or deleted outright. Anything
      // still carrying it was discarded by hand, so it goes rather than
      // lingering invisibly now that nothing draws it.
      const live = arr.filter((t) => t && (t as { state?: string }).state !== 'dropped');
      for (const t of live) {
        if (!t.sec || !s.sections.some((x) => x.id === t.sec)) t.sec = firstSec;
        if (t.track === undefined) t.track = null;
        if (t.state !== 'done') t.state = 'open';
        // A note is text or it is nothing. Anything else came from a bad write
        // and would only show up as a dot promising something that is not there.
        if (t.note !== undefined) {
          const note = typeof t.note === 'string' ? t.note.slice(0, NOTE_LIMIT).trim() : '';
          if (note) t.note = note; else delete t.note;
        }
      }
      w.tasks[Number(d)] = live;
    }
  }
  return s;
}
