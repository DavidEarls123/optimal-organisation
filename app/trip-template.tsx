import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '../src/ui/type';

import {
  Body, Button, Empty, Field, Mono, Note, Screen, Section, SectionHead,
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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [heading, setHeading] = useState(false);
  const [newCat, setNewCat] = useState('');

  // Shown from the defaults until there is something stored, rather than
  // storing something in the middle of drawing the page. Every edit below
  // creates it on the way past, which is a moment that is allowed to write.
  const base = state.tripTemplate ?? defaultPackList();
  const total = Object.values(base).reduce((a, c) => a + c.length, 0);

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

  const cats = Object.keys(base);

  const addCat = () => {
    const name = newCat.trim();
    if (!name) { setHeading(false); return; }
    update((d) => { addPackCat(d, name); }, 'adding that heading');
    setNewCat('');
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
              <PackHeading
                name={cat}
                onRename={(v) => update((d) => { renamePackCat(d, cat, v); },
                  'renaming that heading')}
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

        {/* A heading is a rarer thing to want than an item. */}
        {heading ? (
          <View style={{ flexDirection: 'row', gap: 7, paddingTop: 4 }}>
            <Field
              value={newCat}
              onChangeText={setNewCat}
              placeholder="What to call it…"
              maxLength={28}
              returnKeyType="done"
              onSubmitEditing={addCat}
              autoFocus
            />
            <Button title={newCat.trim() ? 'Add' : 'Done'} onPress={addCat} />
          </View>
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

/** A heading on the standing checklist.
 *
 *  Held while you type and written when you stop. Writing on every keystroke
 *  renamed the heading a letter at a time, and a rename that is refused —
 *  empty, or the name of another heading — snapped the word back under your
 *  finger. It is a draft until you are done with it. */
function PackHeading({ name, onRename }: { name: string; onRename: (v: string) => void }) {
  const t = useTheme();
  const [draft, setDraft] = useState(name);
  const [editing, setEditing] = useState(false);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === name) { setDraft(name); return; }
    onRename(next);
  };

  return (
    <Field
      value={editing ? draft : name}
      onFocus={() => { setDraft(name); setEditing(true); }}
      onChangeText={setDraft}
      onBlur={commit}
      onSubmitEditing={commit}
      returnKeyType="done"
      maxLength={28}
      accessibilityLabel={`Rename ${name}`}
      style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0,
        paddingVertical: 2, fontSize: 12.5, letterSpacing: 1.1, textTransform: 'uppercase',
        fontWeight: '700', color: t.ink }}
    />
  );
}
