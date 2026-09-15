import React from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
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

export function Body({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 18, paddingBottom: 48, gap: 22 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
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

export function Field(props: React.ComponentProps<typeof TextInput>) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.ink3}
      {...props}
      style={[{
        flex: 1, minWidth: 0, fontSize: 14, color: t.ink, backgroundColor: t.sheet2,
        borderWidth: 1, borderColor: t.rule, borderRadius: radius.md,
        paddingHorizontal: 10, paddingVertical: 9,
      }, props.style]}
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
