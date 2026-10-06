import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSequence,
  withTiming, type SharedValue,
} from 'react-native-reanimated';
import { Text, useTextScale } from './type';
import { useRouter } from 'expo-router';

import { useStore } from '../store/store';
import { useTheme } from '../theme/ThemeProvider';
import type { Theme } from '../theme/tokens';
import { radius } from '../theme/tokens';
import {
  DAY_LETTERS, addDays, dayIndexIn, isoOf, isoWeekId, mondayOf, parseISO, weekNumber,
} from '../domain/dates';
import { ensureWeek, marksOn } from '../domain/week';
import { dayScore, isCurrentWeek, templateOf, todayIndex } from '../domain/scoring';
import { Calendar, CornerMark, Empty, Glyph, Mono, Note, Sheet } from './primitives';

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
  const [jumping, setJumping] = useState(false);
  const router = useRouter();
  const { state, weekId, setWeekId, day, setDay, today, update } = useStore();
  const week = state.weeks[weekId];

  // Before the way out, because a hook that is sometimes called is not a hook.
  const shift = (delta: number) => {
    const from = state.weeks[weekId];
    if (!from) return;
    const target = isoOf(addDays(parseISO(from.monday), delta * 7));
    const id = isoWeekId(parseISO(target));
    if (delta > 0) update((d) => { ensureWeek(d, target); });
    else if (!state.weeks[id]) return;
    setWeekId(id);
    // Stay on the same weekday. Landing on Monday every time means counting
    // across to Thursday again on every step.
  };
  const slider = useWeekSlide(shift);

  if (!week) return null;

  const tpl = templateOf(state, week);
  const current = isCurrentWeek(week, today);
  const ti = todayIndex(week, today);
  const hasPrev = Boolean(state.weeks[
    Object.keys(state.weeks).sort().filter((x) => x < weekId).pop() ?? ''
  ]);

  const look = dayLook(t);

  const toToday = () => {
    const id = isoWeekId(today);
    update((d) => { ensureWeek(d, isoOf(today)); });
    setWeekId(id);
    setDay(Math.max(0, dayIndexIn(isoOf(mondayOf(today)), today)));
  };

  return (
    <GestureDetector gesture={weeks(slider.go)}>
    <Animated.View style={[{ paddingHorizontal: 18, paddingTop: 12, gap: 12 }, slider.style]}>
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
          onPress={() => hasPrev && slider.go(-1)}
          disabled={!hasPrev}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          hitSlop={8}
          style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
            opacity: hasPrev ? 1 : 0.25 }}
        >
          <Text style={{ color: t.ink2, fontSize: 20, lineHeight: 23 }}>‹</Text>
        </Pressable>
        {/* The week itself is the way to another one. A heading that is also
            the button for what it names needs nothing underneath it. */}
        <Pressable
          onPress={() => setJumping(true)}
          accessibilityRole="button"
          accessibilityLabel={`${rangeLabel(week.monday)}. Go to another week.`}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center',
            justifyContent: 'center', gap: 7 }}
        >
          <Text
            numberOfLines={1}
            style={{ fontSize: 21, fontWeight: '700', color: t.ink,
              letterSpacing: -0.4, textAlign: 'center' }}
          >
            {rangeLabel(week.monday)}
          </Text>
          <Glyph name="calendar" fallback="▦" size={13} colour={t.ink3} />
        </Pressable>
        <Pressable
          onPress={() => slider.go(1)}
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
              style={{ flex: 1, alignItems: 'center', gap: 5, paddingTop: 7, paddingBottom: 5,
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
              <Text style={{ fontSize: 8, lineHeight: 9, marginTop: -4, height: 8,
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

      <WeekJump open={jumping} onClose={() => setJumping(false)} onToday={toToday} />
    </Animated.View>
    </GestureDetector>
  );
}

/** Somewhere to go that is not one week at a time.
 *
 *  Weeks you have are the ones you have written something in, so they are
 *  offered by name. A date further out is a week that does not exist yet, and
 *  picking one makes it — but a date back behind the first week you recorded
 *  is nothing at all, and making an empty week there would put a nought in
 *  your year that you never lived. It says so instead. */
function WeekJump({ open, onClose, onToday }: {
  open: boolean; onClose: () => void; onToday: () => void;
}) {
  const t = useTheme();
  const { state, weekId, today, setWeekId, update } = useStore();
  const [missed, setMissed] = useState('');

  const ids = Object.keys(state.weeks).sort().reverse();
  const nowId = isoWeekId(today);
  const here = weekId === nowId;

  const go = (id: string) => { setWeekId(id); setMissed(''); onClose(); };

  const pick = (iso: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const id = isoWeekId(parseISO(iso));
    if (state.weeks[id]) { go(id); return; }
    // Forward is a week waiting to happen, so it can be made.
    if (id > nowId) { update((d) => { ensureWeek(d, iso); }); go(id); return; }
    setMissed(id);
  };

  return (
    <Sheet open={open} title="Go to a week" onClose={() => { setMissed(''); onClose(); }}>
      {/* The way back you want nine times in ten, where the ways out are. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to today"
        onPress={() => { setMissed(''); onToday(); onClose(); }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          borderWidth: 1, borderColor: t.accentLine, backgroundColor: t.accentSoft,
          borderRadius: radius.md, paddingVertical: 11 }}
      >
        <Text style={{ fontSize: 14.5, fontWeight: '700', color: t.accent }}>
          {here ? 'This week' : 'Back to today'}
        </Text>
      </Pressable>

      {/* A month you can look at, rather than a button that opens one. */}
      <Calendar onPick={pick} />
      {missed ? (
        <Note>
          {`Nothing was recorded in week ${weekNumber(missed)} of ${missed.slice(0, 4)}. `}
          Weeks are kept as you use them, and an empty one put there now would only be a
          week you never had.
        </Note>
      ) : null}

      <Mono style={{ letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 10,
        paddingTop: 4 }}>
        Weeks you have
      </Mono>
      {ids.length === 0 ? <Empty>None yet.</Empty> : null}
      {ids.map((id) => {
        const w = state.weeks[id];
        const here = id === weekId;
        return (
          <Pressable
            key={id}
            accessibilityRole="button"
            accessibilityState={{ selected: here }}
            accessibilityLabel={`Week ${weekNumber(id)}, ${rangeLabel(w.monday)}`}
            onPress={() => go(id)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
              borderColor: here ? t.accent : t.rule,
              backgroundColor: here ? t.accentSoft : 'transparent' }}
          >
            <Mono style={{ width: 54, fontSize: 11, color: here ? t.accent : t.ink3 }}>
              {`WK ${weekNumber(id)}`}
            </Mono>
            <Text style={{ flex: 1, fontSize: 14, fontWeight: here ? '700' : '500',
              color: here ? t.accent : t.ink }}>
              {rangeLabel(w.monday)}
            </Text>
            {id === nowId ? (
              <Mono style={{ fontSize: 10, color: t.hit }}>NOW</Mono>
            ) : null}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/** A week leaving and the next one arriving, rather than one being replaced by
 *  the other between frames. It goes the way your thumb went: forward, and the
 *  week you were on leaves to the left and the new one comes in from the right.
 *
 *  The change itself happens at the turn, when nothing is where it was, so the
 *  moment the list underneath redraws is the moment it is hidden anyway. */
function useWeekSlide(shift: (delta: number) => void) {
  const slide = useSharedValue(0);
  const fade = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value }],
    opacity: fade.value,
  }));

  const go = (delta: number) => {
    const away = delta > 0 ? -34 : 34;
    fade.value = withSequence(
      withTiming(0, { duration: 110 }),
      withTiming(1, { duration: 190 }),
    );
    slide.value = withSequence(
      withTiming(away, { duration: 110 }, (done) => {
        if (done) runOnJS(shift)(delta);
      }),
      withTiming(-away, { duration: 0 }),
      withTiming(0, { duration: 190 }),
    );
  };

  return { style, go };
}

/** Left and right across a week, as well as the arrows.
 *
 *  It has to be sure before it takes over: a drag that is mostly down the page
 *  is a scroll, and a tap on a day is neither. So it waits for a decided
 *  sideways movement and gives up the moment the finger goes vertical. */
function weeks(shift: (delta: number) => void) {
  return Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onEnd((e) => {
      const far = Math.abs(e.translationX) > 56;
      const fast = Math.abs(e.velocityX) > 420;
      if (!far && !fast) return;
      runOnJS(shift)(e.translationX < 0 ? 1 : -1);
    });
}

/** The seven days on one line, for the bar that stays put while the week
 *  header scrolls away above it.
 *
 *  It is always drawn and always the same height — only its opacity moves.
 *  Anything pinned that changes height shoves the list about underneath it,
 *  which is the opposite of what pinning something is for. */
/** How much scrolling the one-line strip opens over, finishing at the moment
 *  the week above it has gone.
 *
 *  It has to finish there rather than start there. Starting there means the
 *  date pins to the top with the strip still to come, and you scroll past a
 *  task or two waiting for it. Finishing there costs the last inch of the
 *  header's travel, when all that is left of it is the bottom edge of the day
 *  cells — and the strip is still nearly invisible through most of that. */
export const SLIM_RANGE = 46;

/** Where it starts: the moment the week above has gone.
 *
 *  Not a number picked in advance. The week header is as tall as its contents
 *  make it — the range it covers, a trip pinned to a day, the size the writing
 *  is set to — and the strip is the same seven days said again. Two of them on
 *  the screen at once is just clutter, so it waits for the header to be gone,
 *  which is the moment the date reaches the top. */
export function SlimStrip({ scrollY, after }: {
  scrollY: SharedValue<number>;
  /** How tall the week header is, measured rather than assumed. */
  after: SharedValue<number>;
}) {
  const t = useTheme();
  const scale = useTextScale();
  const { state, weekId, setWeekId, day, setDay, today, update } = useStore();
  const week = state.weeks[weekId];
  const look = dayLook(t);
  // Measured off the writing, because the writing is a setting. A fixed height
  // here cut the day you are on in half at the larger sizes.
  const tall = Math.round(22 * scale);
  // Opened from nothing to its full height, and clipped while it does, so it
  // is uncovered from under the date rather than dropped on top of it.
  const opening = useAnimatedStyle(() => {
    // Until the header has been measured there is nothing to wait for and no
    // strip to show: an unmeasured header would put it on the screen at once,
    // beside the week it is standing in for.
    if (after.value <= 0) return { height: 0, opacity: 0 };
    const to = after.value;
    const from = Math.max(0, to - SLIM_RANGE);
    return {
      height: interpolate(scrollY.value, [from, to], [0, tall], Extrapolation.CLAMP),
      // Held back until the week above is all but gone, so the two are never
      // both there to be read — by the time this can be seen, that cannot.
      opacity: interpolate(scrollY.value, [from + (to - from) * 0.45, to], [0, 1],
        Extrapolation.CLAMP),
    };
  }, [tall]);
  // The same sideways swipe as the week above it, and the same slide with it:
  // the days are the days, wherever they happen to be drawn.
  const shift = (delta: number) => {
    const from = state.weeks[weekId];
    if (!from) return;
    const target = isoOf(addDays(parseISO(from.monday), delta * 7));
    const id = isoWeekId(parseISO(target));
    if (delta > 0) update((d) => { ensureWeek(d, target); });
    else if (!state.weeks[id]) return;
    setWeekId(id);
  };
  const slider = useWeekSlide(shift);

  if (!week) return null;
  const current = isCurrentWeek(week, today);
  const ti = todayIndex(week, today);

  return (
    <Animated.View style={[{ overflow: 'hidden' }, opening]}>
      <GestureDetector gesture={weeks(slider.go)}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: tall,
        paddingHorizontal: 18, justifyContent: 'center' }, slider.style]}>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {DAY_LETTERS.map((letter, d) => {
              const selected = d === day;
              const off = Boolean(week.untracked[d]);
              const done = Boolean(week.complete[d]);
              const future = current && d > ti;
              const score = off || future ? 0 : dayScore(state, week, d);
              const dot = done ? t.hit
                : score >= 0.999 ? t.hit
                  : score > 0 ? t.partial : t.rule;
              // A day you are away for says so, here as in the full strip: a
              // dot that means nothing is worse than no dot at all. It takes
              // the same colour as the dot would have — being away is not a
              // reason for a day that went well to look like nothing.
              const on = marksOn(state, isoOf(addDays(parseISO(week.monday), d)));
              const mark = on.trips.length || off ? '✈︎' : on.events.length ? '★' : '';
              return (
                <Pressable
                  key={d}
                  onPress={() => setDay(d)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${letter} ${addDays(parseISO(week.monday), d).getDate()}`}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center',
                    justifyContent: 'center', gap: 5, paddingVertical: 2,
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
                  {mark ? (
                    <Text style={{ fontSize: 8, lineHeight: 9, height: 9,
                      color: selected ? look.ink : dot === t.rule ? t.ink2 : dot }}>{mark}</Text>
                  ) : (
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot,
                      borderWidth: d === ti && current ? 1.5 : 0, borderColor: t.accent }} />
                  )}
                </Pressable>
              );
            })}
          </View>
      </Animated.View>
      </GestureDetector>
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
