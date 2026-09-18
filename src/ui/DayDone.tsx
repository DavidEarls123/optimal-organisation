import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { Text } from './type';
import { Glyph } from './primitives';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';

/** How long it stays up before getting out of the way on its own. */
const HOLD = 5000;

/** Said once, at the end of a day that went. Kept short, kept true: nothing in
 *  here claims more than the day actually was. */
const LINES = [
  'Another successful day.',
  'That is another one in the bank.',
  'Days like this are the whole point.',
  'One more day that counted.',
  'Consistency is only ever one day at a time.',
  'This is how weeks are won.',
  'The line goes up from here.',
];

function Stat({ label, done, total }: { label: string; done: number; total: number }) {
  const t = useTheme();
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  const tone = pct === null ? t.ink3 : pct >= 100 ? t.hit : pct >= 60 ? t.accent : t.ink2;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: tone,
        fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}>
        {pct === null ? '—' : `${pct}%`}
      </Text>
      <Text style={{ fontSize: 10, letterSpacing: 1, textTransform: 'uppercase',
        fontWeight: '700', color: t.ink3 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 11, color: t.ink3, fontVariant: ['tabular-nums'] }}>
        {total > 0 ? `${done} of ${total}` : 'none set'}
      </Text>
    </View>
  );
}

/** The moment a day is finished.
 *
 *  The one thing in the app that is purely for the feeling of it. It sits on a
 *  card of its own rather than floating over whatever was underneath, because
 *  white writing on a dimmed list is a thing you squint at. It never needs
 *  dismissing: a tap sends it away, and it goes by itself either way. */
export function DayDone({ open, title, tasks, habits, onClose }: {
  open: boolean;
  /** The day that was finished, written out. */
  title: string;
  tasks: { done: number; total: number };
  habits: { done: number; total: number };
  onClose: () => void;
}) {
  const t = useTheme();
  const [still, setStill] = useState(false);
  const pop = useSharedValue(0);
  const halo = useSharedValue(0);
  const rise = useSharedValue(0);
  const drain = useSharedValue(1);
  /** How wide the bar has to drain across, once the card knows its own width. */
  const [bar, setBar] = useState(0);
  // Picked once per showing, so it is not the same words every night.
  const line = useMemo(() => LINES[Math.floor(Math.random() * LINES.length)], [open]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    if (still) {
      pop.value = 1; halo.value = 0; rise.value = 1; drain.value = 0;
    } else {
      pop.value = 0; halo.value = 0; rise.value = 0; drain.value = 1;
      pop.value = withSequence(
        withTiming(1.14, { duration: 260 }),
        withSpring(1, { damping: 11, stiffness: 160 }),
      );
      halo.value = withTiming(1, { duration: 820 });
      rise.value = withDelay(140, withTiming(1, { duration: 280 }));
      drain.value = withTiming(0, { duration: HOLD });
    }
    const go = setTimeout(onClose, HOLD);
    return () => clearTimeout(go);
  }, [open, still, pop, halo, rise, drain, onClose]);

  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    opacity: pop.value === 0 ? 0 : 1,
  }));
  // One ring going out and fading, which is what makes it read as a moment
  // rather than a box that appeared.
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 0.8 + halo.value * 0.7 }],
    opacity: halo.value === 0 ? 0 : 0.55 * (1 - halo.value),
  }));
  const words = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * 10 }],
  }));
  const left = useAnimatedStyle(() => ({ width: bar * drain.value }));

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Day complete. ${title}. ${tasks.done} of ${tasks.total} tasks, `
          + `${habits.done} of ${habits.total} habits. Tap to close.`}
        onPress={onClose}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26,
          backgroundColor: t.dark ? 'rgba(0,0,0,0.66)' : 'rgba(16,24,20,0.5)' }}
      >
        <View
          style={{ width: '100%', maxWidth: 340, backgroundColor: t.sheet,
            borderRadius: radius.lg + 6, borderWidth: 1, borderColor: t.rule,
            paddingTop: 26, paddingHorizontal: 22, paddingBottom: 0, alignItems: 'center',
            gap: 16, overflow: 'hidden' }}
        >
          <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={[{ position: 'absolute', width: 96, height: 96, borderRadius: 48,
                borderWidth: 3, borderColor: t.hit }, ring]}
            />
            <Animated.View
              style={[{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.hit,
                alignItems: 'center', justifyContent: 'center' }, mark]}
            >
              <Glyph name="checkmark" fallback="✓" size={44} colour="#FFFFFF" />
            </Animated.View>
          </View>

          <Animated.View style={[{ alignItems: 'center', gap: 6, alignSelf: 'stretch' }, words]}>
            <Text style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.4, color: t.ink }}>
              Well done!
            </Text>
            <Text style={{ fontSize: 14.5, color: t.ink2, textAlign: 'center', lineHeight: 20 }}>
              {line}
            </Text>

            <View style={{ flexDirection: 'row', alignSelf: 'stretch', paddingTop: 14,
              paddingBottom: 4, borderTopWidth: 1, borderTopColor: t.rule, marginTop: 12 }}>
              <Stat label="Tasks" done={tasks.done} total={tasks.total} />
              <View style={{ width: 1, backgroundColor: t.rule2 }} />
              <Stat label="Habits" done={habits.done} total={habits.total} />
            </View>

            <Text style={{ fontSize: 11.5, color: t.ink3, paddingTop: 6 }}>{title}</Text>
          </Animated.View>

          {/* Draining rather than counting: it says how long is left without
              asking anybody to read a number. */}
          <View
            onLayout={(e) => setBar(e.nativeEvent.layout.width)}
            style={{ alignSelf: 'stretch', height: 3, marginTop: 16, backgroundColor: t.rule2 }}
          >
            <Animated.View style={[{ height: 3, backgroundColor: t.hit }, left]} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
