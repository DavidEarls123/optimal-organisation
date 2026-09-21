import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Extrapolation, interpolate, useAnimatedStyle, type SharedValue,
} from 'react-native-reanimated';
import { Text } from './type';
import { useRouter } from 'expo-router';

import { useStore } from '../store/store';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';
import { radius } from '../theme/tokens';
import { DAY_LETTERS, addDays, isoOf, isoWeekId, parseISO, weekNumber } from '../domain/dates';
import { ensureWeek, marksOn } from '../domain/week';
import { dayScore, isCurrentWeek, templateOf, todayIndex } from '../domain/scoring';
import { CornerMark, Mono } from './primitives';

function rangeLabel(mondayIso: string): string {
  const mon = parseISO(mondayIso);
  const sun = addDays(mon, 6);
  const m = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });
  const sameMonth = m(mon) === m(sun);
  return `${mon.getDate()}${sameMonth ? '' : ` ${m(mon)}`} – ${sun.getDate()} ${m(sun)}`;
}

/** Everything the selected day's chip needs, resolved from one choice. Kept in
 *  one place so the ring, the tick and the text can never disagree about what
 *  they are being drawn on. */
export interface DayLook {
  fill: string; edge: string; border: number;
  ink: string; hole: string; track: string; sweep: string;
}

export function dayLook(t: Theme): DayLook {
  return { fill: t.accentSoft, edge: t.accent, border: 2, ink: t.accent,
    hole: t.accentSoft, track: t.accentLine, sweep: t.hit };
}

/** Week identity, template, and the seven-day strip. Shown above every tab.
 *
 *  On the Day screen it is the top of the list rather than a thing fixed above
 *  it, so it goes by at exactly the speed of your thumb. What stays behind is
 *  SlimStrip, pinned under it. */
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

  const look = dayLook(t);

  const shift = (delta: number) => {
    const target = isoOf(addDays(parseISO(week.monday), delta * 7));
    const id = isoWeekId(parseISO(target));
    if (delta > 0) update((d) => { ensureWeek(d, target); });
    else if (!state.weeks[id]) return;
    setWeekId(id);
    // Stay on the same weekday. Landing on Monday every time means counting
    // across to Thursday again on every step.
  };

  return (
    <View style={{ paddingHorizontal: 18, paddingTop: 12, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CornerMark />
        <Mono style={{ flex: 1, letterSpacing: 1.6, textTransform: 'uppercase', fontSize: 11 }}>
          {`Week ${weekNumber(weekId)}${current ? ' · this week' : ` · ${weekId.slice(0, 4)}`}`}
        </Mono>
        {/* What kind of week this is, stated not offered. It is changed on the
            Week tab, where the rest of the week is defined. */}
        <View
          accessible
          accessibilityLabel={`This week is a ${tpl.name}`}
          style={{ borderWidth: 1, borderColor: t.accentLine, backgroundColor: t.accentSoft,
            borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.accent }}>{tpl.name}</Text>
        </View>
      </View>

      {/* The arrows belong beside the range they move, not on their own row. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4 }}>
        <Pressable
          onPress={() => hasPrev && shift(-1)}
          disabled={!hasPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          hitSlop={8}
          style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
            opacity: hasPrev ? 1 : 0.25 }}
        >
          <Text style={{ color: t.ink2, fontSize: 20, lineHeight: 23 }}>‹</Text>
        </Pressable>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: 21, fontWeight: '700', color: t.ink,
            letterSpacing: -0.4, textAlign: 'center' }}
        >
          {rangeLabel(week.monday)}
        </Text>
        <Pressable
          onPress={() => shift(1)}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          hitSlop={8}
          style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: t.ink2, fontSize: 20, lineHeight: 23 }}>›</Text>
        </Pressable>
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
                borderRadius: radius.md, borderWidth: selected ? look.border : 1,
                borderColor: selected ? look.edge : 'transparent',
                backgroundColor: selected ? look.fill : 'transparent',
                opacity: future && !selected ? 0.55 : 1 }}
            >
              <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: selected ? '700' : '400',
                color: selected ? look.ink : t.ink3 }}>
                {letter}
              </Text>
              <DayMark done={done} off={off} score={score} selected={selected} look={look} />
              {/* Today is underlined rather than dotted: it reads as clearly
                  and costs no row of its own. */}
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: selected ? '800' : '600',
                  color: selected ? look.ink : off ? t.ink3 : t.ink,
                  fontVariant: ['tabular-nums'] }}>
                  {addDays(parseISO(week.monday), d).getDate()}
                </Text>
                <View style={{ height: 2, width: 15, borderRadius: 1,
                  backgroundColor: d === ti && current
                    ? (selected ? look.ink : t.accent) : 'transparent' }} />
              </View>
              {/* A trip or a countdown on this day, so it shows without going
                  to Coming Up to find it. */}
              <Text style={{ fontSize: 8, lineHeight: 9, marginTop: -3, height: 9,
                color: selected ? look.ink : t.ink2 }}>
                {(() => {
                  const m = marksOn(state, isoOf(addDays(parseISO(week.monday), d)));
                  return m.trips.length ? '✈︎' : m.events.length ? '★' : ' ';
                })()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The seven days on one line, for the bar that stays put while the week
 *  header scrolls away above it.
 *
 *  It is always drawn and always the same height — only its opacity moves.
 *  Anything pinned that changes height shoves the list about underneath it,
 *  which is the opposite of what pinning something is for. */
export function SlimStrip({ scrollY, from = 44, to = 104 }: {
  scrollY: SharedValue<number>;
  /** Where it starts and finishes fading in, as the header goes by. */
  from?: number;
  to?: number;
}) {
  const t = useTheme();
  const { state, weekId, day, setDay, today } = useStore();
  const week = state.weeks[weekId];
  const look = dayLook(t);
  const shown = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [from, to], [0, 1], Extrapolation.CLAMP),
  }));
  if (!week) return null;
  const current = isCurrentWeek(week, today);
  const ti = todayIndex(week, today);

  return (
    <Animated.View style={shown}>
      <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 2 }}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {DAY_LETTERS.map((letter, d) => {
              const selected = d === day;
              const off = Boolean(week.untracked[d]);
              const done = Boolean(week.complete[d]);
              const future = current && d > ti;
              const score = off || future ? 0 : dayScore(state, week, d);
              const dot = off ? t.rule
                : done ? t.hit
                  : score >= 0.999 ? t.hit
                    : score > 0 ? t.partial : t.rule;
              return (
                <Pressable
                  key={d}
                  onPress={() => setDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${letter} ${addDays(parseISO(week.monday), d).getDate()}`}
                  style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4,
                    borderRadius: radius.sm + 1,
                    borderWidth: selected ? 1 : 0,
                    borderColor: selected ? look.edge : 'transparent',
                    backgroundColor: selected ? look.fill : 'transparent',
                    opacity: future && !selected ? 0.55 : 1 }}
                >
                  <Text style={{ fontSize: 10, letterSpacing: 1,
                    fontWeight: selected ? '800' : '500',
                    color: selected ? look.ink : t.ink3 }}>
                    {letter}
                  </Text>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot,
                    borderWidth: d === ti && current ? 1.5 : 0, borderColor: t.accent }} />
                </Pressable>
              );
            })}
          </View>
      </View>
    </Animated.View>
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
function DayMark({ done, off, score, selected, look }: {
  done: boolean; off: boolean; score: number; selected: boolean; look: DayLook;
}) {
  const t = useTheme();
  const size = 24;
  const base = {
    width: size, height: size, borderRadius: size / 2,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  };
  // The selected day is now a filled accent chip, so everything drawn on it
  // needs its contrast taken from that fill rather than from the sheet.
  // Everything drawn on the chip takes its contrast from whatever that chip
  // actually is, which is what the look decides.
  const ground = selected ? look.hole : t.sheet;
  const quiet = selected ? look.track : t.rule;

  if (off) {
    return (
      <View style={[base, { borderWidth: 1.5, borderColor: selected ? look.ink : t.rule,
        borderStyle: 'dashed', opacity: selected ? 0.75 : 1 }]}>
        <View style={{ width: 9, height: 1.5, borderRadius: 1,
          backgroundColor: selected ? look.ink : t.ink3 }} />
      </View>
    );
  }
  if (done) {
    return (
      <View style={[base, { backgroundColor: t.hit,
        borderWidth: selected ? 1.5 : 0, borderColor: look.hole }]}>
        <Text style={{ color: t.sheet, fontSize: 13, fontWeight: '900', lineHeight: 16 }}>✓</Text>
      </View>
    );
  }
  return (
    <ProgressRing
      progress={score}
      size={size}
      thickness={selected ? 3.5 : 3}
      track={quiet}
      fill={selected ? look.sweep : t.hit}
      hole={ground}
    />
  );
}
