import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import {
  Body, Button, Empty, Field, Mono, Note, Screen, Section, SectionHead,
} from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { tripTemplateOf } from '../src/domain/week';
import { TRIP_BASE, TRIP_CATEGORIES, TRIP_TEMPLATES } from '../src/domain/catalogue';

const ITEM_LIMIT = 70;

/** The checklist every new trip starts from, whatever kind of trip it is. */
export default function TripTemplateScreen() {
  const t = useTheme();
  const { state, update } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!state.tripTemplate) {
    update((d) => { tripTemplateOf(d); });
    return <Screen><Body><Empty>Setting up…</Empty></Body></Screen>;
  }
  const base = state.tripTemplate;
  const total = TRIP_CATEGORIES.reduce((a, c) => a + (base[c]?.length ?? 0), 0);

  const addItem = (cat: string) => {
    const text = (drafts[cat] ?? '').trim().slice(0, ITEM_LIMIT);
    if (!text) return;
    update((d) => {
      const tpl = tripTemplateOf(d);
      if (!tpl[cat].some((x) => x.trim().toLowerCase() === text.toLowerCase())) {
        tpl[cat].push(text);
      }
    });
    setDrafts((p) => ({ ...p, [cat]: '' }));
  };

  return (
    <Screen>
      <Body>
        <Section>
          <SectionHead title="Standard checklist" right={`${total} items`} />
          <Note>
            What every new trip starts with. The kind of trip you pick adds its own on top —
            a race trip still reminds you about the race number.
          </Note>
        </Section>

        {TRIP_CATEGORIES.map((cat) => (
          <View key={cat}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
              <Text style={{ flex: 1, fontSize: 12.5, letterSpacing: 1.1,
                textTransform: 'uppercase', fontWeight: '700', color: t.ink }}>{cat}</Text>
              <Mono>{String(base[cat]?.length ?? 0)}</Mono>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: t.rule }}>
              {(base[cat] ?? []).map((text) => (
                <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 9,
                  paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                  <Text style={{ flex: 1, fontSize: 13.5, color: t.ink }}>{text}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${text}`}
                    hitSlop={6}
                    onPress={() => update((d) => {
                      const tpl = tripTemplateOf(d);
                      tpl[cat] = tpl[cat].filter((x) => x !== text);
                    })}
                  >
                    <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
              {(base[cat] ?? []).length === 0 ? (
                <Note>Nothing standard under this heading.</Note>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 7, paddingTop: 7 }}>
              <Field
                value={drafts[cat] ?? ''}
                onChangeText={(v) => setDrafts((p) => ({ ...p, [cat]: v }))}
                placeholder={`Add to ${cat.toLowerCase()}…`}
                returnKeyType="next"
                blurOnSubmit={false}
                maxLength={ITEM_LIMIT}
                onSubmitEditing={() => addItem(cat)}
              />
              <Button title="Add" onPress={() => addItem(cat)} />
            </View>
          </View>
        ))}

        <Section>
          <SectionHead title="What each kind adds" />
          <Note>
            Fixed, and on top of your list. Once a trip exists you can delete anything from it.
          </Note>
          {Object.entries(TRIP_TEMPLATES).map(([k, v]) => {
            const extra = Object.values(v.extra).reduce((a, x) => a + x.length, 0);
            return (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                <Text style={{ flex: 1, fontSize: 13.5, color: t.ink }}>{v.name}</Text>
                <Mono style={{ fontSize: 11 }}>
                  {extra ? `+${extra}` : 'nothing extra'}
                </Mono>
              </View>
            );
          })}
        </Section>

        <Button
          tone="ghost"
          title="Back to the default checklist"
          onPress={() => Alert.alert(
            'Start the standard checklist again?',
            `Replaces it with the ${TRIP_CATEGORIES.reduce(
              (a, c) => a + (TRIP_BASE[c]?.length ?? 0), 0)} built-in items. Trips already made keep theirs.`,
            [{ text: 'Cancel', style: 'cancel' },
             {
               text: 'Reset',
               style: 'destructive',
               onPress: () => update((d) => { d.tripTemplate = undefined; tripTemplateOf(d); }),
             }],
          )}
        />
      </Body>
    </Screen>
  );
}
