import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import { Text } from './type';
import { Glyph } from './primitives';
import { useTheme } from '../theme/ThemeProvider';

/** How long it stays up before getting out of the way on its own. */
const HOLD = 1700;

/** The moment a day is finished.
 *
 *  It is the one thing in the app that is purely for the feeling of it, so it
 *  is short, it never needs dismissing, and it never blocks anything: a tap
 *  anywhere sends it away early, and it goes by itself either way. */
export function DayDone({ open, title, note, onClose }: {
  open: boolean;
  /** The day that was finished, written out. */
  title: string;
  /** What that day actually came to. */
  note: string;
  onClose: () => void;
}) {
  const t = useTheme();
  const [still, setStill] = useState(false);
  const pop = useSharedValue(0);
  const halo = useSharedValue(0);
  const rise = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    if (still) {
      pop.value = 1; halo.value = 0; rise.value = 1;
    } else {
      pop.value = 0; halo.value = 0; rise.value = 0;
      pop.value = withSequence(
        withTiming(1.14, { duration: 260 }),
        withSpring(1, { damping: 11, stiffness: 160 }),
      );
      halo.value = withTiming(1, { duration: 820 });
      rise.value = withDelay(140, withTiming(1, { duration: 260 }));
    }
    const go = setTimeout(onClose, HOLD);
    return () => clearTimeout(go);
  }, [open, still, pop, halo, rise, onClose]);

  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    opacity: pop.value === 0 ? 0 : 1,
  }));
  // One ring going out and fading, which is what makes it read as a moment
  // rather than a box that appeared.
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 0.75 + halo.value * 1.5 }],
    opacity: halo.value === 0 ? 0 : 0.5 * (1 - halo.value),
  }));
  const words = useAnimatedStyle(() => ({
    opacity: rise.value,
    transform: [{ translateY: (1 - rise.value) * 10 }],
  }));

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title} complete. ${note}`}
        onPress={onClose}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center',
          backgroundColor: t.dark ? 'rgba(0,0,0,0.62)' : 'rgba(16,24,20,0.45)' }}
      >
        <View style={{ alignItems: 'center', gap: 18 }}>
          <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View
              style={[{ position: 'absolute', width: 112, height: 112, borderRadius: 56,
                borderWidth: 3, borderColor: t.hit }, ring]}
            />
            <Animated.View
              style={[{ width: 104, height: 104, borderRadius: 52, backgroundColor: t.hit,
                alignItems: 'center', justifyContent: 'center' }, mark]}
            >
              <Glyph name="checkmark" fallback="✓" size={52} colour="#FFFFFF" />
            </Animated.View>
          </View>

          <Animated.View style={[{ alignItems: 'center', gap: 5 }, words]}>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.3,
              color: '#FFFFFF' }}>
              Day complete
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.86)' }}>{title}</Text>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.66)',
              fontVariant: ['tabular-nums'] }}>
              {note}
            </Text>
          </Animated.View>
        </View>
      </Pressable>
    </Modal>
  );
}
