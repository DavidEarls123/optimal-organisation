import React, { useCallback, useEffect, useRef } from 'react';
import {
  Dimensions, Keyboard, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View,
  useWindowDimensions, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { Text, scaleType, useTextScale } from './type';
import Animated, {
  runOnJS, useAnimatedScrollHandler, useSharedValue, type SharedValue,
} from 'react-native-reanimated';
import { useIsFocused } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/tokens';

export function Screen({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.sheet }}>
      {children}
    </SafeAreaView>
  );
}

export function Body({ children, scrollRef, top, scrollY, onCondensed, lead, sticky }: {
  children: React.ReactNode;
  scrollRef?: React.Ref<ScrollView>;
  /** Less air at the top, for a screen that already has a heading above it. */
  top?: number;
  /** Drawn edge to edge above everything else, and part of the list rather
   *  than fixed above it — so it goes away exactly as fast as you scroll,
   *  never faster. A heading that shrinks while sitting outside the list moves
   *  the list's top edge up at the same time as the list moves up through it,
   *  and the two together pull the page along faster than your thumb. */
  lead?: React.ReactNode;
  /** Drawn edge to edge under the lead and pinned there as the rest goes by.
   *  Its height must not change, or everything below it shifts. */
  sticky?: React.ReactNode;
  /** Where the list has been scrolled to, kept on the thread that draws.
   *  Anything that shrinks as you scroll reads this rather than being told,
   *  because being told means a round trip through JavaScript for every frame
   *  and that is what a jump is made of. */
  scrollY?: SharedValue<number>;
  /** Told once when the list leaves the top, and once when it comes back —
   *  for a screen that only wants to know which side of it we are on. */
  onCondensed?: (past: boolean) => void;
}) {
  const { ref, at, keep } = useKeepVisible();
  const hold = useCallback((node: ScrollView | null) => {
    (ref as React.MutableRefObject<ScrollView | null>).current = node;
    if (typeof scrollRef === 'function') scrollRef(node);
    else if (scrollRef) (scrollRef as React.MutableRefObject<ScrollView | null>).current = node;
  }, [ref, scrollRef]);

  const past = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler((e) => {
    at.value = e.contentOffset.y;
    if (scrollY) scrollY.value = e.contentOffset.y;
    if (!onCondensed) return;
    const now = e.contentOffset.y > 18;
    if (now === past.value) return;
    past.value = now;
    runOnJS(onCondensed)(now);
  });

  return (
    <Animated.ScrollView
      ref={hold}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      scrollEventThrottle={16}
      // Adding a task keeps the composer open and pushes it down the page, and
      // the keyboard never moved so it never says anything. The list growing is
      // the signal: look again at whatever is being typed in.
      onContentSizeChange={keep}
      onScroll={onScroll}
      stickyHeaderIndices={sticky ? [1] : undefined}
    >
      {lead ?? <View />}
      {sticky ?? <View />}
      <View style={{ padding: 18, paddingTop: top ?? 18, gap: 22 }}>{children}</View>
    </Animated.ScrollView>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Text style={[{ fontSize: 12, letterSpacing: 1.1, textTransform: 'uppercase',
      color: t.ink2, fontWeight: '700' }, style]}>{children}</Text>
  );
}

export function Mono({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return (
    <Text style={[{ fontVariant: ['tabular-nums'], fontSize: 11, color: t.ink3 }, style]}>
      {children}
    </Text>
  );
}

/** `size="title"` is for the thing a screen is actually about — the day you are
 *  looking at. Everything else stays a quiet uppercase label, so the two do not
 *  compete for the same rung of the hierarchy. */
export function SectionHead({ title, right, size = 'label' }: {
  title: string; right?: React.ReactNode; size?: 'label' | 'title';
}) {
  const t = useTheme();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
      borderBottomWidth: size === 'title' ? 1 : StyleSheet.hairlineWidth * 2,
      borderBottomColor: size === 'title' ? t.rule : t.rule,
      paddingBottom: size === 'title' ? 8 : 6, gap: 10,
    }}>
      {size === 'title'
        ? <Text style={{ fontSize: 20, fontWeight: '700', color: t.ink, letterSpacing: -0.3 }}>
            {title}
          </Text>
        : <Label>{title}</Label>}
      {typeof right === 'string' ? <Mono>{right}</Mono> : right}
    </View>
  );
}

export function Section({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: 10 }}>{children}</View>;
}

export function Note({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.ink3 }}>{children}</Text>;
}

/** The tick box used by tasks, habits and every checklist. */
export function Tick({ on, tone = 'accent', size = 21 }: {
  on: boolean; tone?: 'accent' | 'hit'; size?: number;
}) {
  const t = useTheme();
  const fill = tone === 'hit' ? t.hit : t.accent;
  return (
    <View style={{
      width: size, height: size, borderRadius: radius.sm, borderWidth: 1.5,
      borderColor: on ? fill : t.rule, backgroundColor: on ? fill : 'transparent',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {on ? (
        <Text style={{ color: t.sheet, fontSize: size * 0.6, lineHeight: size * 0.72, fontWeight: '900' }}>
          ✓
        </Text>
      ) : null}
    </View>
  );
}

export function Chip({ text, colour, soft, style }: {
  text: string; colour?: string; soft?: string; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View style={[{
      borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2,
      borderWidth: 1, borderColor: colour ?? t.rule, backgroundColor: soft ?? 'transparent',
    }, style]}>
      <Text style={{ fontSize: 9, letterSpacing: 0.9, textTransform: 'uppercase',
        color: colour ?? t.ink3, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Bar({ value, colour, marker }: { value: number; colour: string; marker?: number }) {
  const t = useTheme();
  return (
    <View style={{ height: 7, borderRadius: 4, backgroundColor: t.sunk, marginTop: 5, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%',
        borderRadius: 4, backgroundColor: colour }} />
      {marker !== undefined ? (
        <View style={{ position: 'absolute', left: `${Math.min(100, marker * 100)}%`,
          top: 0, bottom: 0, width: 1.5, backgroundColor: t.ink3, opacity: 0.55 }} />
      ) : null}
    </View>
  );
}

export function Tile({ value, sub, label }: { value: string; sub?: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{
      flex: 1, minWidth: 120, borderWidth: 1, borderColor: t.rule, borderRadius: radius.md,
      padding: 10, gap: 2,
    }}>
      <Text style={{ fontSize: 21, fontWeight: '700', color: t.ink, letterSpacing: -0.5,
        fontVariant: ['tabular-nums'] }}>
        {value}
        {sub ? <Text style={{ fontSize: 12, fontWeight: '400', color: t.ink3 }}>{sub}</Text> : null}
      </Text>
      <Text style={{ fontSize: 11, color: t.ink3, lineHeight: 14 }}>{label}</Text>
    </View>
  );
}

/** Two-or-more way switch, used for week/year and shopping/entertainment. */
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2, backgroundColor: t.sunk,
      borderRadius: radius.md, padding: 3 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{ flex: 1, paddingVertical: 8, borderRadius: radius.sm + 1,
              backgroundColor: on ? t.sheet : 'transparent', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t.ink : t.ink2 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Keeps whatever you are typing in where you can see it.
 *
 *  The old version measured the composer's offset inside its own section and
 *  scrolled by that, which is a number with no relation to the page — so the
 *  field stayed behind the keyboard. This asks the field itself where it is on
 *  the screen and moves the list by the difference, so it lands in the middle
 *  of whatever the keyboard has left. It works for every field on the screen,
 *  because it follows the focus rather than being wired to one box. */
/** Roughly where a screen's own heading ends, and how much room to leave under
 *  a field for whatever sits beneath it. Points, not pixels. */
const HEADER = 118;
const BELOW = 78;

export function useKeepVisible() {
  const ref = useRef<ScrollView>(null);
  /** Where the list is, written by the scroll handler on the thread that draws
   *  and read here when it is needed — which is only when the keyboard moves. */
  const at = useSharedValue(0);
  const kb = useRef(0);
  // Tabs stay mounted behind the one you are looking at, and the keyboard
  // shouts at all of them. Only the screen in front of you may move.
  const here = useIsFocused();
  const showing = useRef(here);
  showing.current = here;

  const keep = useCallback(() => {
    const node = TextInput.State.currentlyFocusedInput();
    if (!node || !kb.current || !showing.current) return;
    node.measureInWindow((_x, y, _w, h) => {
      if (!Number.isFinite(y)) return;
      const room = Dimensions.get('window').height - kb.current;
      // Just above the keyboard rather than up in the middle of the screen: the
      // band between the keyboard and the day you are on is where you are
      // already looking, and there is usually a row of buttons under the field
      // that has to stay in it too.
      const want = Math.max(HEADER, room - h - BELOW);
      const move = y - want;
      if (Math.abs(move) < 12) return;
      ref.current?.scrollTo({ y: Math.max(0, at.value + move), animated: true });
    });
  }, []);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      kb.current = e.endCoordinates.height;
      keep();
    });
    const gone = Keyboard.addListener('keyboardDidHide', () => { kb.current = 0; });
    return () => { shown.remove(); gone.remove(); };
  }, [keep]);

  return { ref, at, keep };
}

/** The width of the small boxes that sit at the end of a row — the one button
 *  on a composer, the tag beside it. Fixed, so a button does not change size
 *  with its own label, and shared, so the two line up. It follows the text size
 *  because everything in them does. */
export function useBoxWidth(): number {
  return Math.round(78 * useTextScale());
}

export function Field(props: React.ComponentProps<typeof TextInput>) {
  const t = useTheme();
  const scale = useTextScale();
  // Flattened first, because what you type in has to come out the same size as
  // everything around it — including whatever size the caller asked for.
  const given = scaleType(StyleSheet.flatten(props.style) as TextStyle | undefined, scale);
  return (
    <TextInput
      placeholderTextColor={t.ink3}
      {...props}
      style={[{
        flex: 1, minWidth: 0, fontSize: 14 * scale, color: t.ink, backgroundColor: t.sheet2,
        borderWidth: 1, borderColor: t.rule, borderRadius: radius.md,
        paddingHorizontal: 10, paddingVertical: 9,
      }, given]}
    />
  );
}

export function Button({ title, onPress, tone = 'soft', disabled }: {
  title: string; onPress: () => void; tone?: 'soft' | 'ghost' | 'big'; disabled?: boolean;
}) {
  const t = useTheme();
  const soft = tone !== 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        opacity: disabled ? 0.4 : 1,
        borderWidth: 1,
        borderColor: soft ? t.accentLine : t.rule,
        backgroundColor: soft ? t.accentSoft : t.sheet,
        borderRadius: radius.md,
        paddingHorizontal: 14,
        paddingVertical: tone === 'big' ? 13 : 9,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: tone === 'big' ? 14.5 : 13, fontWeight: '600',
        color: soft ? t.accent : t.ink2 }}>{title}</Text>
    </Pressable>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 13, color: t.ink3, paddingVertical: 6 }}>{children}</Text>;
}

/** The mark: Trace.
 *
 *  Six weeks as equal bars, the seventh standing as the stem of a 1, and the
 *  numeral's head carrying on in a second colour back to the first bar — which
 *  is drawn in that same colour, because that is where it came from.
 *
 *  Built from plain views. react-native-svg is not in the installed binary, so
 *  using it would mean nobody sees the mark until the next build; this ships
 *  over the air. The curve is a short polyline of rotated bars, which at these
 *  sizes is indistinguishable from a real one.
 *
 *  Below about 22px there is no room for six bars and a curve, so the mark
 *  drops to a reduced form — fewer weeks, heavier strokes. Same idea, legible.
 */

/** [x, y] pairs on the same 100x100 field the app icon is drawn on, so the
 *  two cannot drift apart. */
const TRACE_TAIL: [number, number][] = [
  [5, 67], [17.4, 66.3], [29.3, 64.6], [40.6, 61.6], [51.2, 57.3],
  [61, 51.2], [69.9, 43.2], [77.8, 33], [83, 27],
];
const TRACE_TAIL_SMALL: [number, number][] = [
  [9, 62], [26, 60], [42, 55], [56, 46], [68, 33], [74, 26],
];

function Segments({ points, width, colour, k }: {
  points: [number, number][]; width: number; colour: string; k: number;
}) {
  return (
    <>
      {points.slice(0, -1).map(([x1, y1], i) => {
        const [x2, y2] = points[i + 1];
        const dx = (x2 - x1) * k;
        const dy = (y2 - y1) * k;
        const len = Math.hypot(dx, dy) + width;   // overlap, so joins do not gap
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: x1 * k + dx / 2 - len / 2,
              top: y1 * k + dy / 2 - width / 2,
              width: len,
              height: width,
              borderRadius: width / 2,
              backgroundColor: colour,
              transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
            }}
          />
        );
      })}
    </>
  );
}

export function Mark({ size = 18, one, trace }: {
  size?: number; one?: string; trace?: string;
}) {
  const t = useTheme();
  const c1 = one ?? t.accent;
  const c2 = trace ?? t.hit;
  const k = size / 100;               // field units to points
  const small = size < 22;

  const bar = (x: number, y: number, w: number, h: number, colour: string, op = 1) => (
    <View
      key={`${x}-${y}`}
      style={{
        position: 'absolute', left: x * k, top: y * k,
        width: w * k, height: h * k, borderRadius: Math.max(1, 2.5 * k),
        backgroundColor: colour, opacity: op,
      }}
    />
  );

  // The drawn mark spans y=8..96, so the box is shorter than it is wide.
  return (
    <View accessible={false} style={{ width: size, height: size * 0.88 }}>
      <View style={{ position: 'absolute', left: 0, top: -8 * k, width: size, height: size }}>
        {small ? (
          <>
            {bar(26, 64, 16, 20, c1, 0.32)}
            {bar(49, 64, 16, 20, c1, 0.32)}
            <Segments points={TRACE_TAIL_SMALL} width={Math.max(2, 11 * k)} colour={c2} k={k} />
            {bar(1, 58, 16, 26, c2)}
            <Segments points={[[72, 28], [92, 9]]} width={Math.max(2.5, 13 * k)} colour={c1} k={k} />
            {bar(82, 8, 17, 76, c1)}
            {bar(0.5, 89, 99, 8, c1)}
          </>
        ) : (
          <>
            {[15.5, 30.5, 45.5, 60.5, 75.5].map((x) => bar(x, 71, 9, 13, c1, 0.32))}
            <Segments points={TRACE_TAIL} width={Math.max(1.5, 6.5 * k)} colour={c2} k={k} />
            {bar(0.5, 67, 9, 17, c2)}
            <Segments points={[[83, 27], [94, 9.5]]} width={Math.max(2, 10.5 * k)} colour={c1} k={k} />
            {bar(88.5, 8, 11, 76, c1)}
            {bar(0.5, 89, 99, 7, c1)}
          </>
        )}
      </View>
    </View>
  );
}

/** The small corner mark every screen carries. Sits on the baseline of a
 *  heading row, so it costs no vertical space of its own. */
export function CornerMark() {
  return (
    <View style={{ opacity: 0.75 }}>
      <Mark size={17} />
    </View>
  );
}

/** The full lockup, for the top of the Hub. */
export function Wordmark({ name, by }: { name: string; by?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Mark size={26} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', letterSpacing: 1.6,
          textTransform: 'uppercase', color: t.ink }}>{name}</Text>
        {by ? (
          <Text style={{ fontSize: 11, letterSpacing: 0.3, color: t.ink3, marginTop: 1 }}>{by}</Text>
        ) : null}
      </View>
    </View>
  );
}


/** A centred card over a dimmed screen. Everything that used to appear jammed
 *  against an edge — the tag list, a date picker, entering a weight — goes in
 *  one of these, so it lands in the middle where you are already looking. */
export function Sheet({ open, title, onClose, children, footer }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useTheme();
  const { height } = useWindowDimensions();
  // Room for the header, the footer and the screen edges, and never so tall
  // that a long list has nowhere to scroll.
  const bodyMax = Math.max(160, Math.min(520, height - 260));
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 }}>
        {/* The backdrop sits behind the card rather than around it: wrapping the
            card in a Pressable let it swallow the drag a long list needs. */}
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
        />
        <View
          style={{ width: '100%', maxWidth: 380, backgroundColor: t.sheet,
            borderRadius: radius.lg + 4, borderWidth: 1, borderColor: t.rule,
            overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 11,
            borderBottomWidth: 1, borderBottomColor: t.rule }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: t.ink }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button"
              accessibilityLabel="Close">
              <Text style={{ fontSize: 17, color: t.ink3, lineHeight: 20 }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            style={{ maxHeight: bodyMax }}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            indicatorStyle={t.dark ? 'white' : 'black'}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ flexDirection: 'row', gap: 8, padding: 14,
              borderTopWidth: 1, borderTopColor: t.rule }}>
              {footer}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/** A date you tap rather than type. Typing YYYY-MM-DD by hand is the kind of
 *  thing a phone should never ask for. */
export function DateButton({ value, placeholder, onChange, title, minimum }: {
  value: string;
  placeholder: string;
  onChange: (iso: string) => void;
  title: string;
  minimum?: Date;
}) {
  const t = useTheme();
  const [open, setOpen] = React.useState(false);
  const has = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const shown = has
    ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
        .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    : placeholder;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={has ? `${title}: ${shown}. Change it.` : title}
        onPress={() => setOpen(true)}
        style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: t.rule, borderRadius: radius.md,
          backgroundColor: t.sheet2, paddingHorizontal: 10, paddingVertical: 10 }}
      >
        <Text numberOfLines={1} style={{ fontSize: 14, color: has ? t.ink : t.ink3 }}>{shown}</Text>
      </Pressable>
      <Sheet open={open} title={title} onClose={() => setOpen(false)}>
        <DateTimePicker
          value={has
            ? new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
            : new Date()}
          mode="date"
          display="inline"
          minimumDate={minimum}
          themeVariant={t.dark ? 'dark' : 'light'}
          accentColor={t.accent}
          style={{ alignSelf: 'stretch' }}
          onChange={(_e, picked) => {
            setOpen(false);
            if (!picked) return;
            const p = (n: number) => String(n).padStart(2, '0');
            onChange(`${picked.getFullYear()}-${p(picked.getMonth() + 1)}-${p(picked.getDate())}`);
          }}
        />
      </Sheet>
    </>
  );
}

/** A square button carrying a symbol instead of a word, for the things that sit
 *  beside a main action and should not compete with it for width. */
export function IconButton({ glyph, fallback, label, onPress }: {
  glyph: SFSymbol;
  fallback: string;
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 44, borderWidth: 1, borderColor: t.rule, borderRadius: radius.md,
        alignItems: 'center', justifyContent: 'center', backgroundColor: t.sheet2 }}
    >
      {Platform.OS === 'ios' ? (
        <SymbolView
          name={glyph}
          size={19}
          tintColor={t.ink2}
          resizeMode="scaleAspectFit"
          fallback={<Text style={{ color: t.ink2, fontSize: 16 }}>{fallback}</Text>}
        />
      ) : (
        <Text style={{ color: t.ink2, fontSize: 16 }}>{fallback}</Text>
      )}
    </Pressable>
  );
}

/** A single SF Symbol used as a piece of text would be, with a plain-character
 *  fallback. Sleeker than an emoji and it takes the theme's ink. */
export function Glyph({ name, fallback, size = 15, colour }: {
  name: SFSymbol; fallback: string; size?: number; colour?: string;
}) {
  const t = useTheme();
  const c = colour ?? t.ink2;
  if (Platform.OS !== 'ios') {
    return <Text style={{ color: c, fontSize: size, lineHeight: size + 3 }}>{fallback}</Text>;
  }
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={c}
      resizeMode="scaleAspectFit"
      fallback={<Text style={{ color: c, fontSize: size, lineHeight: size + 3 }}>{fallback}</Text>}
    />
  );
}
