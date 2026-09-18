import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '../src/ui/type';

import {
  Body, Button, Empty, Field, Mono, Note, Screen, Section, SectionHead,
} from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { resetShopFromTemplate, shopTemplateOf, uid } from '../src/domain/week';

const ITEM_LIMIT = 60;
const HEADING_LIMIT = 28;

/** The standing list every week is built from. Editing it changes what future
 *  weeks start with; this week is only touched if you ask for it explicitly. */
export default function ShopTemplateScreen() {
  const t = useTheme();
  const { state, weekId, update } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (!Array.isArray(state.shopTemplate)) {
    update((d) => { shopTemplateOf(d); });
    return <Screen><Body><Empty>Setting up…</Empty></Body></Screen>;
  }
  const groups = state.shopTemplate;
  const total = groups.reduce((a, g) => a + g.items.length, 0);

  const addItem = (groupId: string) => {
    const text = (drafts[groupId] ?? '').trim().slice(0, ITEM_LIMIT);
    if (!text) return;
    update((d) => {
      d.shopTemplate?.find((g) => g.id === groupId)
        ?.items.push({ id: uid('i'), text, need: false, done: false });
    });
    setDrafts((p) => ({ ...p, [groupId]: '' }));
  };

  return (
    <Screen>
      <Body>
        <Section>
          <SectionHead title="Standard list" right={`${groups.length} headings · ${total} items`} />
          <Note>
            What a new week starts from. Nothing here is marked as needed — a week begins with
            the things written down and every decision still to make.
          </Note>
        </Section>

        {groups.map((g) => (
          <View key={g.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingTop: 4, paddingBottom: 3 }}>
              <Field
                value={g.name}
                onChangeText={(v) => update((d) => {
                  const gg = d.shopTemplate?.find((x) => x.id === g.id);
                  if (gg) gg.name = v;
                })}
                maxLength={HEADING_LIMIT}
                accessibilityLabel={`Rename ${g.name}`}
                style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0,
                  paddingHorizontal: 0, paddingVertical: 2, fontSize: 12.5, letterSpacing: 1.1,
                  textTransform: 'uppercase', fontWeight: '700', color: t.ink }}
              />
              <Mono>{String(g.items.length)}</Mono>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${g.name}`}
                hitSlop={6}
                onPress={() => Alert.alert(
                  `Remove ${g.name}?`,
                  'Only from the standard list. Weeks already built keep theirs.',
                  [{ text: 'Cancel', style: 'cancel' },
                   {
                     text: 'Remove',
                     style: 'destructive',
                     onPress: () => update((d) => {
                       d.shopTemplate = (d.shopTemplate ?? []).filter((x) => x.id !== g.id);
                     }),
                   }],
                )}
              >
                <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
              </Pressable>
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: t.rule }}>
              {g.items.map((it) => (
                <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9,
                  paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                  <Text style={{ flex: 1, fontSize: 13.5, color: t.ink }}>{it.text}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${it.text}`}
                    hitSlop={6}
                    onPress={() => update((d) => {
                      const gg = d.shopTemplate?.find((x) => x.id === g.id);
                      if (gg) gg.items = gg.items.filter((y) => y.id !== it.id);
                    })}
                  >
                    <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 7, paddingTop: 7 }}>
              <Field
                value={drafts[g.id] ?? ''}
                onChangeText={(v) => setDrafts((p) => ({ ...p, [g.id]: v }))}
                placeholder={`Add to ${g.name.toLowerCase()}…`}
                returnKeyType="next"
                blurOnSubmit={false}
                maxLength={ITEM_LIMIT}
                onSubmitEditing={() => addItem(g.id)}
              />
              <Button title="Add" onPress={() => addItem(g.id)} />
            </View>
          </View>
        ))}

        <Button
          tone="ghost"
          title="+ Add a heading"
          onPress={() => update((d) => {
            (d.shopTemplate ??= []).push({ id: uid('g'), name: 'New heading', items: [] });
          })}
        />

        <Section>
          <SectionHead title="This week" />
          <Note>
            This week already has its own copy. Replacing it starts it again from the standard
            list, losing anything you have marked as needed or already bought.
          </Note>
          <Button
            title="Rebuild this week from the standard list"
            onPress={() => Alert.alert(
              'Replace this week’s list?',
              'What you have marked as needed and already got this week goes with it.',
              [{ text: 'Cancel', style: 'cancel' },
               {
                 text: 'Replace',
                 style: 'destructive',
                 onPress: () => update((d) => { resetShopFromTemplate(d, weekId); }),
               }],
            )}
          />
        </Section>
      </Body>
    </Screen>
  );
}
