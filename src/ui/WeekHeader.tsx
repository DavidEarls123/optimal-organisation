import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useStore } from '../store/store';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';
import { DAY_LETTERS, addDays, isoOf, isoWeekId, parseISO, weekNumber } from '../domain/dates';
import { ensureWeek } from '../domain/week';
import { dayScore, isCurrentWeek, templateOf, todayIndex } from '../domain/scoring';
import { Mono } from './primitives';

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

  const tpl = templateOf(week);
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Mono style={{ letterSpacing: 1.6, textTransform: 'uppercase', fontSize: 11 }}>
            {`Week ${weekNumber(weekId)} · ${weekId.slice(0, 4)}${current ? ' · this week' : ''}`}
          </Mono>
          <Text style={{ fontSize: 23, fontWeight: '700', color: t.ink, letterSpacing: -0.5, marginTop: 2 }}>
            {rangeLabel(week.monday)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {([['‹', -1, hasPrev], ['›', 1, true]] as const).map(([glyph, delta, enabled]) => (
            <Pressable
              key={glyph}
              onPress={() => enabled && shift(delta)}
              disabled={!enabled}
              accessibilityRole="button"
              accessibilityLabel={delta < 0 ? 'Previous week' : 'Next week'}
              style={{ width: 32, height: 32, borderRadius: radius.sm + 2, borderWidth: 1,
                borderColor: t.rule, alignItems: 'center', justifyContent: 'center',
                opacity: enabled ? 1 : 0.3 }}
            >
              <Text style={{ color: t.ink2, fontSize: 17, lineHeight: 20 }}>{glyph}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/template')}
        accessibilityRole="button"
        style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
          borderWidth: 1, borderColor: t.accentLine, backgroundColor: t.accentSoft,
          borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.accent }}>{tpl.name}</Text>
        <Text style={{ fontSize: 11, color: t.accent }}>▾</Text>
      </Pressable>

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
                borderColor: selected ? t.accentLine : 'transparent',
                backgroundColor: selected ? t.accentSoft : 'transparent',
                opacity: future ? 0.55 : 1 }}
            >
              <Text style={{ fontSize: 10, letterSpacing: 1, color: selected ? t.accent : t.ink3 }}>
                {letter}
              </Text>
              <DayMark done={done} off={off} score={score} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: off ? t.ink3 : t.ink,
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

/** A filled tick for a completed day, a dash for an untracked one, otherwise a ring. */
function DayMark({ done, off, score }: { done: boolean; off: boolean; score: number }) {
  const t = useTheme();
  if (off) {
    return (
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
        borderColor: t.rule, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 9, height: 1.5, backgroundColor: t.ink3, borderRadius: 1 }} />
      </View>
    );
  }
  if (done) {
    return (
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.hit,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.sheet, fontSize: 13, fontWeight: '900', lineHeight: 16 }}>✓</Text>
      </View>
    );
  }
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 3, borderColor: t.rule,
      alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 3,
        borderColor: t.hit, position: 'absolute',
        opacity: score > 0.02 ? 1 : 0,
        borderLeftColor: score > 0.5 ? t.hit : 'transparent',
        borderBottomColor: score > 0.25 ? t.hit : 'transparent',
        borderRightColor: score > 0.75 ? t.hit : 'transparent',
        transform: [{ rotate: '-45deg' }] }} />
    </View>
  );
}
