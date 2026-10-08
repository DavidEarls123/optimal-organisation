import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '../src/ui/type';

import {
  Body, Button, Composer, DraftField, Mono, Note, Screen, Section, SectionHead,
} from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import {
  addPackCat, defaultPackList, removePackCat, renamePackCat, tripTemplateOf,
} from '../src/domain/week';
import { TRIP_BASE, TRIP_CATEGORIES } from '../src/domain/catalogue';

const ITEM_LIMIT = 70;

/** The checklist every new trip starts from, whatever kind of trip it is. */
export default function TripTemplateScreen() {
  const t = useTheme();
  const { state, update } = useStore();
  /** Which heading has its composer open. Only ever one. */
  const [adding, setAdding] = useState<string | null>(null);
  const [heading, setHeading] = useState(false);

  // Shown from the defaults until there is something stored, rather than
  // storing something in the middle of drawing the page. Every edit below
  // creates it on the way past, which is a moment that is allowed to write.
  const base = state.tripTemplate ?? defaultPackList();
  const total = Object.values(base).reduce((a, c) => a + c.length, 0);

  const addItem = (cat: string, text: string) => update((d) => {
    const tpl = tripTemplateOf(d);
    if (!tpl[cat].some((x) => x.trim().toLowerCase() === text.toLowerCase())) {
      tpl[cat].push(text);
    }
  }, 'adding that');

  const cats = Object.keys(base);

  const addCat = (name: string) => {
    update((d) => { addPackCat(d, name); }, 'adding that heading');
    setHeading(false);
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

        {cats.map((cat) => (
          <View key={cat}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
              <DraftField
                value={cat}
                onCommit={(v) => update((d) => { renamePackCat(d, cat, v.trim()); },
                  'renaming that heading')}
                maxLength={28}
                returnKeyType="done"
                accessibilityLabel={`Rename ${cat}`}
                style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0,
                  paddingHorizontal: 0, paddingVertical: 2, fontSize: 12.5, letterSpacing: 1.1,
                  textTransform: 'uppercase', fontWeight: '700', color: t.ink }}
              />
              <Mono>{String(base[cat]?.length ?? 0)}</Mono>
              {cats.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove the heading ${cat}`}
                  hitSlop={8}
                  onPress={() => Alert.alert(
                    `Remove ${cat}?`,
                    'Only from the standard checklist. Trips already made keep theirs.',
                    [{ text: 'Cancel', style: 'cancel' },
                     {
                       text: 'Remove',
                       style: 'destructive',
                       onPress: () => update((d) => { removePackCat(d, cat); },
                         'removing that heading'),
                     }],
                  )}
                >
                  <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                </Pressable>
              ) : null}
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

            {adding === cat ? (
              <Composer
                placeholder={`Add to ${cat.toLowerCase()}…`}
                limit={ITEM_LIMIT}
                onAdd={(text) => addItem(cat, text)}
                onDone={() => setAdding(null)}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add to ${cat}`}
                onPress={() => setAdding(cat)}
                hitSlop={8}
                style={{ paddingTop: 7, paddingBottom: 2 }}
              >
                <Text style={{ fontSize: 15, color: t.ink3, lineHeight: 18 }}>+</Text>
              </Pressable>
            )}
          </View>
        ))}

        {/* A heading is a rarer thing to want than an item. */}
        {heading ? (
          <Composer
            placeholder="What to call it…"
            limit={28}
            onAdd={addCat}
            onDone={() => setHeading(false)}
            hint={() => 'A heading every new trip starts with'}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a heading"
            onPress={() => setHeading(true)}
            hitSlop={8}
            style={{ paddingTop: 4, alignSelf: 'flex-start' }}
          >
            <Mono style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase',
              color: t.ink3 }}>+ Heading</Mono>
          </Pressable>
        )}

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
