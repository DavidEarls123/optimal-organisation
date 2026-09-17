import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StoreProvider } from '../src/store/store';
import { ThemeProvider } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <ThemeProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="template"
                options={{ presentation: 'modal', headerShown: true, title: 'Shape of the week' }} />
              <Stack.Screen name="template-edit"
                options={{ presentation: 'modal', headerShown: true, title: 'Edit template' }} />
              <Stack.Screen name="habits"
                options={{ presentation: 'modal', headerShown: true, title: 'Habits this week' }} />
              <Stack.Screen name="backup"
                options={{ presentation: 'modal', headerShown: true, title: 'Backup & restore' }} />
              <Stack.Screen name="watch"
                options={{ presentation: 'modal', headerShown: true, title: 'What did you watch?' }} />
              <Stack.Screen name="settings"
                options={{ presentation: 'modal', headerShown: true, title: 'Settings' }} />
              <Stack.Screen name="shop-template"
                options={{ presentation: 'modal', headerShown: true, title: 'Standard list' }} />
            </Stack>
          </ThemeProvider>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
