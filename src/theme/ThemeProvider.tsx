import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { dark, light, type Theme } from './tokens';
import { useStore } from '../store/store';
import { TextScale } from '../ui/type';

const ThemeContext = createContext<Theme>(light);

/** Follows the phone unless the preference says otherwise. Sits inside the
 *  store so it can read that preference, which is why the store wraps it. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const { state } = useStore();
  const choice = state.prefs?.theme ?? 'system';
  const theme = useMemo(() => {
    const wanted = choice === 'system' ? scheme : choice;
    return wanted === 'dark' ? dark : light;
  }, [choice, scheme]);
  return (
    <ThemeContext.Provider value={theme}>
      <TextScale size={state.prefs?.textSize ?? 'medium'}>{children}</TextScale>
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
