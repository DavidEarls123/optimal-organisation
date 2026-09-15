/** One palette, two themes. Cool newsprint paper and fountain-pen ink:
 *  the app is a training logbook, not a dashboard. */

export interface Theme {
  dark: boolean;
  paper: string; sheet: string; sheet2: string; sunk: string;
  ink: string; ink2: string; ink3: string;
  rule: string; rule2: string;
  accent: string; accentSoft: string; accentLine: string;
  hit: string; hitSoft: string;
  partial: string; partialSoft: string;
  miss: string; missSoft: string;
  /** 12 categorical colours for trackables: [line, soft fill] */
  track: [string, string][];
}

export const light: Theme = {
  dark: false,
  paper: '#E9ECEE', sheet: '#FBFCFC', sheet2: '#F1F4F5', sunk: '#E3E7EA',
  ink: '#141B22', ink2: '#5C6975', ink3: '#8C97A2',
  rule: '#D3DADE', rule2: '#E4E8EB',
  accent: '#1F3E9E', accentSoft: '#E4E9F6', accentLine: '#B9C5E6',
  hit: '#2C6E54', hitSoft: '#DCEAE4',
  partial: '#9A6B15', partialSoft: '#F0E7D4',
  miss: '#9E4038', missSoft: '#F2DEDC',
  track: [
    ['#6A3FA0', '#EFE8F8'], ['#0F6E6A', '#DEEFEE'], ['#A3316B', '#F8E4EE'],
    ['#2E4F8F', '#E4EAF6'], ['#5F6B1E', '#ECEFDB'], ['#7A4A2B', '#F3E7DE'],
    ['#1C6B8F', '#DEEDF4'], ['#8A3B2E', '#F6E5E1'], ['#4A5A7A', '#E7EAF1'],
    ['#7D2E5C', '#F5E2EC'], ['#3E6B58', '#E2EEE9'], ['#5A4B8A', '#E9E6F4'],
  ],
};

export const dark: Theme = {
  dark: true,
  paper: '#0B1015', sheet: '#151C23', sheet2: '#1B242C', sunk: '#10171D',
  ink: '#E7ECF0', ink2: '#94A1AC', ink3: '#68757F',
  rule: '#27313A', rule2: '#1E272F',
  accent: '#8AA1FF', accentSoft: '#1A2440', accentLine: '#2E3E6B',
  hit: '#5DBC91', hitSoft: '#172B24',
  partial: '#D6A64E', partialSoft: '#2C2517',
  miss: '#DD8377', missSoft: '#2E1C1A',
  track: [
    ['#BCA0EC', '#251B33'], ['#56C6BE', '#0F2A29'], ['#EE93BC', '#301A25'],
    ['#93AEE9', '#1A2338'], ['#C2CD80', '#23260F'], ['#DBA98B', '#2C1F16'],
    ['#6EC1E4', '#0E2530'], ['#E39485', '#2F1B17'], ['#A3B4D4', '#1D2331'],
    ['#E894C0', '#2E1826'], ['#7FC5A9', '#14261F'], ['#A79AE0', '#211C33'],
  ],
};

export const font = {
  ui: undefined as string | undefined,
  mono: 'Menlo',
};

export const radius = { sm: 6, md: 9, lg: 12, pill: 999 };
export const space = (n: number) => n * 4;

/** Semantic colour for a proportion of target achieved. */
export function bandColour(t: Theme, ratio: number): string {
  if (ratio >= 0.85) return t.hit;
  if (ratio >= 0.6) return t.partial;
  return t.miss;
}
