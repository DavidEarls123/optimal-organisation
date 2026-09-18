import React from 'react';
import { Platform, type ColorValue } from 'react-native';
import { Text } from '../../src/ui/type';
import { Tabs } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Real SF Symbols, so the bar looks like the rest of the phone rather than a
 *  row of glyphs borrowed from a font. expo-symbols is already linked in
 *  through expo-router, so this needs no rebuild.
 *
 *  Each tab names an outline and the filled version of the same symbol: the
 *  selected tab fills in, which is how iOS itself signals the current tab. */
const tab = (outline: SFSymbol, filled: SFSymbol, fallback: string) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    if (Platform.OS !== 'ios') {
      return <Text style={{ color, fontSize: 18, lineHeight: 21 }}>{fallback}</Text>;
    }
    return (
      <SymbolView
        name={focused ? filled : outline}
        size={25}
        tintColor={color}
        weight={focused ? 'semibold' : 'regular'}
        resizeMode="scaleAspectFit"
        fallback={<Text style={{ color, fontSize: 18, lineHeight: 21 }}>{fallback}</Text>}
      />
    );
  };

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.ink3,
        tabBarStyle: { backgroundColor: t.sheet, borderTopColor: t.rule },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {/* Order matters: Hub sits in the middle because it is the feedback, not
          an afterthought at the end. */}
      <Tabs.Screen name="index"
        options={{ title: 'Day', tabBarIcon: tab('sun.max', 'sun.max.fill', '◧') }} />
      <Tabs.Screen name="week"
        options={{ title: 'Week', tabBarIcon: tab('calendar', 'calendar', '▦') }} />
      <Tabs.Screen name="hub"
        options={{ title: 'Hub', tabBarIcon: tab('chart.bar', 'chart.bar.fill', '◎') }} />
      <Tabs.Screen name="lists"
        options={{ title: 'Lists', tabBarIcon: tab('checklist', 'checklist.checked', '☰') }} />
      <Tabs.Screen name="ahead"
        options={{ title: 'Coming Up', tabBarIcon: tab('flag', 'flag.fill', '◷') }} />
    </Tabs>
  );
}
