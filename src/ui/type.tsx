import React, { createContext, useContext } from 'react';
import { StyleSheet, Text as Plain, type TextProps, type TextStyle } from 'react-native';

import type { TextSize } from '../domain/types';

/** How much bigger or smaller than drawn. Small and large are a step either
 *  side rather than a leap; XL goes further, for reading at arm's length. */
const SCALES: Record<TextSize, number> = { small: 0.92, medium: 1, large: 1.14, xl: 1.3 };

const ScaleContext = createContext(1);

export function TextScale({ size, children }: { size: TextSize; children: React.ReactNode }) {
  return (
    <ScaleContext.Provider value={SCALES[size] ?? 1}>{children}</ScaleContext.Provider>
  );
}

export function useTextScale(): number {
  return useContext(ScaleContext);
}

/** The app's Text.
 *
 *  Every size in this app is written down as a number in a style, which is the
 *  only way to keep a hundred screens looking like one app — but it also means
 *  there is no single place to make the writing bigger. So this sits in for
 *  React Native's Text everywhere and scales whatever size it is handed.
 *
 *  A Text with no size of its own is left alone: it is inheriting from a Text
 *  above it, which has already been scaled, and setting a size here would break
 *  that inheritance instead of following it. */
export function Text({ style, ...rest }: TextProps) {
  const scale = useTextScale();
  if (scale === 1) return <Plain style={style} {...rest} />;
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const out: TextStyle = { ...flat };
  if (typeof flat.fontSize === 'number') out.fontSize = flat.fontSize * scale;
  if (typeof flat.lineHeight === 'number') out.lineHeight = flat.lineHeight * scale;
  return <Plain style={out} {...rest} />;
}

/** The same, for anything being typed into. */
export function scaleType(style: TextStyle | undefined, scale: number): TextStyle | undefined {
  if (!style || scale === 1) return style;
  const out: TextStyle = { ...style };
  if (typeof style.fontSize === 'number') out.fontSize = style.fontSize * scale;
  if (typeof style.lineHeight === 'number') out.lineHeight = style.lineHeight * scale;
  return out;
}
