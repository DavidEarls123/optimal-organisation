import type { Habit, Section, Trackable, WeekTemplate } from './types';

export const PALETTE_N = 12;

export const DEFAULT_SECTIONS: Section[] = [
  { id: 's1', name: 'Morning' },
  { id: 's2', name: 'Afternoon' },
  { id: 's3', name: 'Evening' },
];

export const DEFAULT_HABITS: Habit[] = [
  { id: 'tabs_am',  name: 'Morning tablets',  short: 'AM tablets', active: true },
  { id: 'tabs_pm',  name: 'Evening tablets',  short: 'PM tablets', active: true },
  { id: 'calories', name: 'Track calories',   short: 'Calories',   active: true },
  { id: 'recovery', name: 'Ice bath / boots', short: 'Recovery',   active: true },
  { id: 'duolingo', name: 'Duolingo',         short: 'Duolingo',   active: true },
  { id: 'guitar',   name: 'Guitar practice',  short: 'Guitar',     active: true },
  { id: 'journal',  name: 'Journal',          short: 'Journal',    active: true },
  { id: 'meditate', name: 'Meditate',         short: 'Meditate',   active: true },
  { id: 'read',     name: 'Read book',        short: 'Read',       active: true,
    def: { mode: 'days', days: [0, 1, 2, 3, 4], n: 5 } },
  { id: 'tv',       name: 'Watch something',  short: 'Watch',      active: true, picks: 'watch',
    def: { mode: 'count', days: [], n: 3 } },
];

export const DEFAULT_TRACKABLES: Trackable[] = [
  { id: 'gym',      name: 'Gym',      ci: 0 },
  { id: 'run',      name: 'Run',      ci: 1 },
  { id: 'walk',     name: 'Walk',     ci: 2 },
  { id: 'hiit',     name: 'HIIT',     ci: 3 },
  { id: 'golf',     name: 'Golf',     ci: 4 },
  { id: 'recovery', name: 'Recovery', ci: 5 },
];

export const TRACK_PRESETS = [
  'Gym', 'Run', 'Walk', 'HIIT', 'Golf', 'Recovery',
  'Swim', 'Bike', 'Yoga', 'Climb', 'Physio', 'Pilates', 'Rowing', 'Football',
];

/** Week templates, in picker order. */
export const TEMPLATES: Record<string, WeekTemplate> = {
  strength: {
    id: 'strength', name: 'Strength Block', tag: 'Hypertrophy',
    blurb: 'Four lifts, running kept to two easy efforts so it does not eat into recovery. Eating is the hard part.',
    why: 'The lifting is the easy bit. Hitting protein seven days out of seven is the block.',
    note: 'Recovery drops to 2 — and both on rest days. Cold water straight after lifting blunts the adaptation you just paid for; boots are fine, the ice bath waits.',
    weights: { habits: 0.6, tasks: 0.4 },
    targets: { tabs_am: 7, tabs_pm: 7, calories: 7, recovery: 2, duolingo: 6, guitar: 4, journal: 4, meditate: 4 },
    plan: [
      [['Gym — push', 'gym', 2], ['Protein target 180g', null, 0]],
      [['Easy 5k', 'run', 2]],
      [['Gym — pull', 'gym', 2], ['Protein target 180g', null, 0]],
      [['Gym — legs', 'gym', 2]],
      [['Rest — boots + stretch', 'recovery', 2]],
      [['Gym — upper accessory', 'gym', 0], ['Easy 5k', 'run', 1]],
      [['Plan next week', null, 2]],
    ],
  },
  taper: {
    id: 'taper', name: 'Race Week', tag: 'Taper',
    blurb: 'Volume down roughly 40%, intensity held. Short, sharp, and then nothing.',
    why: 'Nothing new this week. No new shoes, no new food, no first ice bath.',
    note: 'Journalling goes to 7 and meditation to 6 — taper week is mostly a nerves-management problem. Sleep and fuelling carry the score.',
    weights: { habits: 0.75, tasks: 0.25 },
    targets: { tabs_am: 7, tabs_pm: 7, calories: 7, recovery: 6, duolingo: 4, guitar: 2, journal: 7, meditate: 6 },
    plan: [
      [['Easy 6k', 'run', 0]],
      [['4 × 400m @ race pace', 'run', 2], ['Lay out race kit', null, 2]],
      [['Easy 4k', 'run', 0]],
      [['Rest — legs up', 'recovery', 1]],
      [['Shakeout 3k', 'run', 0], ['Travel + check race start', null, 1]],
      [['RACE DAY', 'run', 0], ['Refuel + write it down', null, 1]],
      [['Walk only', 'walk', 1]],
    ],
  },
  deload: {
    id: 'deload', name: 'Deload & Reset', tag: 'Recovery',
    blurb: 'Low load on purpose, usually after a hard block or a bad week. Almost no training tasks at all.',
    why: 'The habits carry this week. There is very little to tick, and that is the point.',
    note: 'Scoring shifts to 80% habits, so an easy training week cannot quietly tank your score. Guitar and Duolingo go up — the space has to go somewhere.',
    weights: { habits: 0.8, tasks: 0.2 },
    targets: { tabs_am: 7, tabs_pm: 7, calories: 5, recovery: 4, duolingo: 7, guitar: 6, journal: 7, meditate: 7 },
    plan: [
      [['Walk 30 min', 'walk', 0], ['Mobility 15 min', null, 2]],
      [['Easy swim or spin', null, 2]],
      [['Walk 30 min', 'walk', 0]],
      [['Mobility 15 min', null, 2]],
      [['Rest', null, 1]],
      [['Easy 5k — no watch', 'run', 0]],
      [['Plan next block', null, 2]],
    ],
  },
  run: {
    id: 'run', name: 'Run Block', tag: 'Endurance',
    blurb: 'Peak mileage. One quality session, one long run, everything else easy and honest.',
    why: 'Recovery is a training input this week, not a reward for finishing one.',
    note: 'Calories every single day — under-fuelling is what actually ends a volume block, not the mileage. Guitar and Duolingo drop to what survives a 26k Saturday.',
    weights: { habits: 0.65, tasks: 0.35 },
    targets: { tabs_am: 7, tabs_pm: 7, calories: 7, recovery: 5, duolingo: 5, guitar: 2, journal: 4, meditate: 4 },
    plan: [
      [['Easy 8k — conversational', 'run', 0], ['Mobility 10 min', null, 2]],
      [['Intervals: 6 × 800m @ 5k pace', 'run', 2], ['Foam roll calves', null, 2]],
      [['Gym — lower body', 'gym', 2], ['Weigh in', null, 0]],
      [['Easy 6k + strides', 'run', 0]],
      [['Rest — 30 min walk', 'walk', 1]],
      [['Long run 26k', 'run', 0], ['Refuel inside 30 min', null, 0]],
      [['Recovery spin 40 min', 'recovery', 0], ['Plan next week', null, 2]],
    ],
  },
  general: {
    id: 'general', name: 'General Week', tag: 'Baseline',
    blurb: 'Three lifts, two runs, nothing pushed too hard. The default week when nothing else is going on.',
    why: 'Everything ticks over. No single thing is allowed to dominate.',
    weights: { habits: 0.6, tasks: 0.4 },
    targets: { tabs_am: 7, tabs_pm: 7, calories: 7, recovery: 2, duolingo: 7, guitar: 4, journal: 5, meditate: 5 },
    plan: [
      [['Gym — full body A', 'gym', 2], ['Mobility 10 min', null, 0]],
      [['Easy 6k', 'run', 2]],
      [['Gym — full body B', 'gym', 2]],
      [['Easy 5k + strides', 'run', 0]],
      [['Rest', null, 1]],
      [['Gym — full body C', 'gym', 0], ['Long walk', 'walk', 1]],
      [['Plan next week', null, 2]],
    ],
  },
};

export const TEMPLATE_ORDER = ['strength', 'taper', 'deload', 'run', 'general'];

/** Trip checklists. */
export const TRIP_CATEGORIES = ['Flights', 'Accommodation', 'Airport travel', 'Activities'];

export const TRIP_BASE: Record<string, string[]> = {
  Flights: ['Book outbound', 'Book return', 'Check in online', 'Baggage allowance sorted'],
  Accommodation: ['Book the stay', 'Confirm check-in time', 'Save address offline'],
  'Airport travel': ['Book parking or transfer', 'Check train times', 'Set alarm', 'Work out leave-by time'],
  Activities: ['Book somewhere to eat', 'Plan runs or gym'],
};

export const TRIP_TEMPLATES: Record<string, { name: string; extra: Record<string, string[]> }> = {
  weekend: { name: 'Weekend away', extra: {} },
  work: {
    name: 'Work trip',
    extra: { Accommodation: ['Check expense policy'], Activities: ['Print itinerary', 'Laptop, charger, adapter'] },
  },
  race: {
    name: 'Race trip',
    extra: {
      Flights: ['Race kit in hand luggage — never the hold'],
      'Airport travel': ['Check race-morning transport'],
      Activities: ['Collect race number', 'Read the course map', 'Book the night-before meal', 'Gels packed'],
    },
  },
  holiday: {
    name: 'Holiday',
    extra: {
      Flights: ['Passport in date', 'Travel insurance'],
      Accommodation: ['Currency or card sorted'],
      Activities: ['Plug adapter', 'eSIM or roaming on'],
    },
  },
};

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
