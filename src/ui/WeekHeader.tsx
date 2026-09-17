import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useStore } from '../store/store';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';
import { DAY_LETTERS, addDays, isoOf, isoWeekId, parseISO, weekNumber } from '../domain/dates';
import { ensureWeek } from '../domain/week';
import { dayScore, isCurrentWeek, templateOf, todayIndex } from '../domain/scoring';
import { CornerMark, Mono } from './primitives';

function rangeLabel(mondayIso: string): string {
  const mon = parseISO(mondayIso);
  const sun = addDays(mon, 6);
  const m = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });
  const sameMonth = m(mon) === m(sun);
  return `${mon.getDate()}${sameMonth ? '' : ` ${m(mon)}`} – ${sun.getDate()} ${m(sun)}`;
}

/** Week identity, template, and the seven-day strip. Shown above every tab. */
export function WeekHeader({ compact }: { compact?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const { state, weekId, setWeekId, day, setDay, today, update } = useStore();
  const week = state.weeks[weekId];
  if (!week) return null;

  const tpl = templateOf(state, week);
  const current = isCurrentWeek(week, today);
  const ti = todayIndex(week, today);
  const hasPrev = Boolean(state.weeks[
    Object.keys(state.weeks).sort().filter((x) => x < weekId).pop() ?? ''
  ]);

  const shift = (delta: number) => {
    const target = isoOf(addDays(parseISO(week.monday), delta * 7));
    const id = isoWeekId(parseISO(target));
    if (delta > 0) update((d) => { ensureWeek(d, target); });
    else if (!state.weeks[id]) return;
    setWeekId(id);
    setDay(0);
  };

  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 12, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CornerMark />
        <Mono style={{ flex: 1, letterSpacing: 1.6, textTransform: 'uppercase', fontSize: 11 }}>
          {`Week ${weekNumber(weekId)}${current ? ' · this week' : ` · ${weekId.slice(0, 4)}`}`}
        </Mono>
        <Pressable
          onPress={() => router.push('/template')}
          accessibilityRole="button"
          accessibilityLabel={`Template: ${tpl.name}. Change it.`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
            borderWidth: 1, borderColor: t.accentLine, backgroundColor: t.accentSoft,
            borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.accent }}>{tpl.name}</Text>
          <Text style={{ fontSize: 10, color: t.accent }}>▾</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: -4 }}>
        <Text style={{ flex: 1, fontSize: 23, fontWeight: '700', color: t.ink, letterSpacing: -0.5 }}>
          {rangeLabel(week.monday)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {([['‹', -1, hasPrev], ['›', 1, true]] as const).map(([glyph, delta, enabled]) => (
            <Pressable
              key={glyph}
              onPress={() => enabled && shift(delta)}
              disabled={!enabled}
              accessibilityRole="button"
              accessibilityLabel={delta < 0 ? 'Previous week' : 'Next week'}
              style={{ width: 30, height: 30, borderRadius: radius.sm + 2, borderWidth: 1,
                borderColor: t.rule, alignItems: 'center', justifyContent: 'center',
                opacity: enabled ? 1 : 0.3 }}
            >
              <Text style={{ color: t.ink2, fontSize: 16, lineHeight: 19 }}>{glyph}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!compact && week.focus ? (
        <Text style={{ fontSize: 15.5, lineHeight: 21, color: t.ink2, fontStyle: 'italic',
          borderLeftWidth: 2, borderLeftColor: t.accentLine, paddingLeft: 11 }}>
          {week.focus}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 3 }}>
        {DAY_LETTERS.map((letter, d) => {
          const selected = d === day;
          const off = Boolean(week.untracked[d]);
          const done = Boolean(week.complete[d]);
          const future = current && d > ti;
          const score = off || future ? 0 : dayScore(state, week, d);
          return (
            <Pressable
              key={d}
              onPress={() => setDay(d)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${letter} ${parseISO(week.monday).getDate() + d}`}
              style={{ flex: 1, alignItems: 'center', gap: 5, paddingVertical: 7,
                borderRadius: radius.md, borderWidth: 1,
                borderColor: selected ? t.accent : 'transparent',
                backgroundColor: selected ? t.accent : 'transparent',
                opacity: future && !selected ? 0.55 : 1 }}
            >
              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: selected ? '700' : '400',
                color: selected ? t.sheet : t.ink3 }}>
                {letter}
              </Text>
              <DayMark done={done} off={off} score={score} selected={selected} />
              <Text style={{ fontSize: 13, fontWeight: selected ? '800' : '600',
                color: selected ? t.sheet : off ? t.ink3 : t.ink,
                fontVariant: ['tabular-nums'] }}>
                {addDays(parseISO(week.monday), d).getDate()}
              </Text>
              <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: -2,
                backgroundColor: d === ti && current ? t.accent : 'transparent' }} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A real arc, swept clockwise from twelve o'clock, built from two clipped
 *  half-discs. react-native-svg would be tidier but it is a native module, and
 *  that would mean a rebuild rather than an update. */
function ProgressRing({ progress, size, thickness, track, fill, hole }: {
  progress: number; size: number; thickness: number;
  track: string; fill: string; hole: string;
}) {
  const deg = Math.max(0, Math.min(1, progress)) * 360;
  const right = Math.min(deg, 180);
  const left = Math.max(0, deg - 180);
  const half = size / 2;
  const disc = { width: half, height: size, backgroundColor: fill } as const;
  return (
    <View style={{ width: size, height: size, borderRadius: half, backgroundColor: track }}>
      <View style={{ position: 'absolute', top: 0, left: half, width: half, height: size,
        overflow: 'hidden' }}>
        <View style={[disc, {
          borderTopRightRadius: half, borderBottomRightRadius: half,
          transformOrigin: '0% 50%', transform: [{ rotate: `${180 + right}deg` }],
        }]} />
      </View>
      <View style={{ position: 'absolute', top: 0, left: 0, width: half, height: size,
        overflow: 'hidden' }}>
        <View style={[disc, {
          borderTopLeftRadius: half, borderBottomLeftRadius: half,
          transformOrigin: '100% 50%', transform: [{ rotate: `${180 + left}deg` }],
        }]} />
      </View>
      <View style={{ position: 'absolute', left: thickness, top: thickness,
        width: size - thickness * 2, height: size - thickness * 2,
        borderRadius: (size - thickness * 2) / 2, backgroundColor: hole }} />
    </View>
  );
}

/** A tick for a completed day, a dash for an untracked one, otherwise the arc. */
function DayMark({ done, off, score, selected }: {
  done: boolean; off: boolean; score: number; selected: boolean;
}) {
  const t = useTheme();
  const size = 24;
  const base = {
    width: size, height: size, borderRadius: size / 2,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  };
  // The selected day is now a filled accent chip, so everything drawn on it
  // needs its contrast taken from that fill rather than from the sheet.
  const ground = selected ? t.accent : t.sheet;
  const quiet = selected ? t.accentLine : t.rule;

  if (off) {
    return (
      <View style={[base, { borderWidth: 1.5, borderColor: selected ? t.sheet : t.rule,
        borderStyle: 'dashed', opacity: selected ? 0.75 : 1 }]}>
        <View style={{ width: 9, height: 1.5, borderRadius: 1,
          backgroundColor: selected ? t.sheet : t.ink3 }} />
      </View>
    );
  }
  if (done) {
    return (
      <View style={[base, { backgroundColor: t.hit,
        borderWidth: selected ? 1.5 : 0, borderColor: t.sheet }]}>
        <Text style={{ color: t.sheet, fontSize: 13, fontWeight: '900', lineHeight: 16 }}>✓</Text>
      </View>
    );
  }
  return (
    <ProgressRing
      progress={score}
      size={size}
      thickness={3}
      track={quiet}
      fill={t.hit}
      hole={ground}
    />
  );
}
