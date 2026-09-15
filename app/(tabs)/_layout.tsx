import React from 'react';
import { Text, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => (
  <Text style={{ color, fontSize: 17, lineHeight: 20 }}>{glyph}</Text>
);

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
      <Tabs.Screen name="index" options={{ title: 'Day', tabBarIcon: icon('◧') }} />
      <Tabs.Screen name="week" options={{ title: 'Week', tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="lists" options={{ title: 'Lists', tabBarIcon: icon('☰') }} />
      <Tabs.Screen name="ahead" options={{ title: 'Ahead', tabBarIcon: icon('◷') }} />
      <Tabs.Screen name="hub" options={{ title: 'Hub', tabBarIcon: icon('◎') }} />
    </Tabs>
  );
}
