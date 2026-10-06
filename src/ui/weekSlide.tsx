import React, { createContext, useContext, useMemo } from 'react';
import type { ViewStyle } from 'react-native';
import {
  useAnimatedStyle, useSharedValue, withSequence, withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** How far the week comes in from, and how long it takes to arrive. */
const FROM = 76;
const MS = 300;

interface Slide {
  slide: SharedValue<number>;
  fade: SharedValue<number>;
  /** Play the arrival. Positive is forwards: the week you were on leaves to
   *  the left and the new one comes in from the right. */
  run: (delta: number) => void;
}

const Ctx = createContext<Slide | null>(null);

function useSlideValues(): Slide {
  const slide = useSharedValue(0);
  const fade = useSharedValue(1);
  return useMemo(() => ({
    slide,
    fade,
    run: (delta: number) => {
      // One instruction, not two. Reanimated keeps only the last value written
      // to a shared value within a frame, so putting the week off to the side
      // on one line and animating it back on the next threw the first line
      // away: it animated from nought to nought, and nothing moved. A sequence
      // whose first step takes no time at all does both in one go.
      const from = delta > 0 ? FROM : -FROM;
      slide.value = withSequence(
        withTiming(from, { duration: 0 }),
        withTiming(0, { duration: MS }),
      );
      fade.value = withSequence(
        withTiming(0.12, { duration: 0 }),
        withTiming(1, { duration: MS }),
      );
    },
  }), [slide, fade]);
}

/** Holds one arrival for a whole screen, so the week at the top and the day
 *  underneath it move together. Two separate animations — a heading that
 *  slides and a list that cuts — read as a list that is broken. */
export function WeekSlideProvider({ children }: { children: React.ReactNode }) {
  const value = useSlideValues();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The screen's arrival, and the style that shows it.
 *
 *  Without a provider above it this is its own, which is what the Week tab and
 *  anything else showing a week header gets: the header still transitions, it
 *  just has nothing below it to bring along. */
export function useWeekSlide() {
  const own = useSlideValues();
  const held = useContext(Ctx);
  const use = held ?? own;
  const style = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ translateX: use.slide.value }],
    opacity: use.fade.value,
  }));
  return { ...use, style };
}
