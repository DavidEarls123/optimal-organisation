import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Text } from '../src/ui/type';

import {
  Body, Button, Composer, DraftField, Glyph, Mono, Note, Screen, Section, SectionHead,
} from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import {
  addPackCat, askHowMany, defaultPackList, groupedOrder, packGroupsOf, packListOf,
  placeInGroups, removePackCat, renamePackCat, uid,
} from '../src/domain/week';
import { useListDrag } from '../src/ui/useListDrag';
import type { PackItem } from '../src/domain/types';

const ITEM_LIMIT = 70;
const HEADING_LIMIT = 28;

/** Everything you might take or arrange, under headings — the list every trip
 *  starts from.
 *
 *  Nothing here is chosen. A trip takes a copy of the lot and you tick what
 *  that trip wants, the way a week does with the shopping list. A line marked
 *  with # is no good without a number, so choosing it for a trip asks how
 *  many. */
export default function TripTemplateScreen() {
  const t = useTheme();
  const { state, update } = useStore();
  /** Which heading has its composer open. Only ever one. */
  const [adding, setAdding] = useState<string | null>(null);
  const [heading, setHeading] = useState(false);

  // Shown from the defaults until there is something stored. Writing to the
  // store while the page is being drawn is how you get a page that does
  // nothing; every edit below creates it on the way past instead.
  const groups = packGroupsOf(state);
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const asks = groups.reduce((a, g) => a + g.items.filter((x) => x.qty).length, 0);

  const onList = (fn: (list: ReturnType<typeof packListOf>) => void, label?: string) =>
    update((d) => { fn(packListOf(d)); }, label);

  const addItem = (gid: string, text: string) => onList((list) => {
    const g = list.find((x) => x.id === gid);
    if (!g) return;
    if (g.items.some((x) => x.text.trim().toLowerCase() === text.toLowerCase())) return;
    g.items.push({ id: uid('pi'), text });
  }, 'adding that');

  const drag = useListDrag({
    order: groupedOrder(groups).map((x) => ({ id: x.id, sec: x.gid })),
    sections: groups.map((g) => g.id),
    onDrop: (id, at, gid) => onList((list) => { placeInGroups(list, id, at, gid); }, 'moving that'),
  });

  return (
    <Screen>
      <Body>
        <Section>
          <SectionHead
            title="Standard list"
            right={`${groups.length} headings · ${total} items`}
          />
          <Note>
            Everything you might take or arrange, written down once. A trip takes a copy of the
            whole list with nothing chosen, and you tick what that trip wants — so packing is
            reading what you ticked, not remembering what you own.
          </Note>
          <Note>
            {asks
              ? `${asks} of them ask how many. Tap # on a line to turn that on or off: a line that `
                + 'asks will want a number when you choose it for a trip.'
              : 'Tap # on a line to make it ask how many — socks, T-shirts, days of medication.'}
          </Note>
        </Section>

        {groups.map((g) => {
          const line = drag.lineIn(g.id);
          return (
            <View key={g.id} onLayout={(e) => drag.measureSection(g.id, e.nativeEvent.layout.y)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingTop: 4, paddingBottom: 3 }}>
                <DraftField
                  value={g.name}
                  onCommit={(v) => update((d) => { renamePackCat(d, g.id, v); },
                    'renaming that heading')}
                  maxLength={HEADING_LIMIT}
                  accessibilityLabel={`Rename ${g.name}`}
                  style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0,
                    paddingHorizontal: 0, paddingVertical: 2, fontSize: 12.5, letterSpacing: 1.1,
                    textTransform: 'uppercase', fontWeight: '700', color: t.ink }}
                />
                <Mono>{String(g.items.length)}</Mono>
                {groups.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove the heading ${g.name}`}
                    hitSlop={6}
                    onPress={() => Alert.alert(
                      `Remove ${g.name}?`,
                      'Only from the standard list. Trips already made keep theirs.',
                      [{ text: 'Cancel', style: 'cancel' },
                       {
                         text: 'Remove',
                         style: 'destructive',
                         onPress: () => update((d) => { removePackCat(d, g.id); },
                           'removing that heading'),
                       }],
                    )}
                  >
                    <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                  </Pressable>
                ) : null}
              </View>

              <View
                style={{ borderTopWidth: 1, borderTopColor: t.rule }}
                onLayout={(e) => drag.measureList(g.id, e.nativeEvent.layout.y)}
              >
                {g.items.map((it) => (
                  <PackRow
                    key={it.id}
                    item={it}
                    onRename={(text) => onList((list) => {
                      const x = list.find((y) => y.id === g.id)?.items.find((y) => y.id === it.id);
                      if (x) x.text = text;
                    }, 'renaming that')}
                    onAsk={(on) => update((d) => { askHowMany(d, it.id, on); },
                      on ? 'asking how many' : 'not asking how many')}
                    onDelete={() => onList((list) => {
                      const gg = list.find((x) => x.id === g.id);
                      if (gg) gg.items = gg.items.filter((y) => y.id !== it.id);
                    }, 'removing that')}
                    onMeasure={(y, h) => drag.measureRow(it.id, y, h)}
                    onDragMove={(dy) => drag.onDragMove(it.id, dy)}
                    onDragEnd={(dy) => drag.onDragEnd(it.id, dy)}
                    dragging={drag.dragId === it.id}
                  />
                ))}
                {line !== null ? (
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: 0, right: 0, top: line - 1, height: 2,
                      borderRadius: 1, backgroundColor: t.accent, zIndex: 20 }}
                  />
                ) : null}
              </View>

              {adding === g.id ? (
                <Composer
                  placeholder={`Add to ${g.name.toLowerCase()}…`}
                  limit={ITEM_LIMIT}
                  onAdd={(text) => addItem(g.id, text)}
                  onDone={() => setAdding(null)}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add to ${g.name}`}
                  onPress={() => setAdding(g.id)}
                  hitSlop={8}
                  style={{ paddingTop: 7, paddingBottom: 2 }}
                >
                  <Text style={{ fontSize: 15, color: t.ink3, lineHeight: 18 }}>+</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {heading ? (
          <Composer
            placeholder="What to call it…"
            limit={HEADING_LIMIT}
            onAdd={(name) => { update((d) => { addPackCat(d, name); }, 'adding that heading'); }}
            onDone={() => setHeading(false)}
            hint={() => 'A heading every new trip starts with'}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a heading"
            onPress={() => setHeading(true)}
            hitSlop={8}
            style={{ alignSelf: 'flex-start' }}
          >
            <Mono style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase',
              color: t.ink3 }}>+ Heading</Mono>
          </Pressable>
        )}

        <Button
          tone="ghost"
          title="Back to the default list"
          onPress={() => Alert.alert(
            'Start the standard list again?',
            `Replaces it with the ${defaultPackList().reduce((a, g) => a + g.items.length, 0)} `
            + 'built-in lines. Trips already made keep theirs.',
            [{ text: 'Cancel', style: 'cancel' },
             {
               text: 'Reset',
               style: 'destructive',
               onPress: () => update((d) => { d.packList = defaultPackList(); },
                 'starting the list again'),
             }],
          )}
        />
      </Body>
    </Screen>
  );
}

/** One line on the standing list: what it is called, whether it asks how many,
 *  and the handle that moves it. No tick — nothing here is chosen; that is a
 *  question a trip asks, not the list it starts from. */
function PackRow({ item, onRename, onAsk, onDelete, onMeasure, onDragMove, onDragEnd, dragging }: {
  item: PackItem;
  onRename: (text: string) => void;
  onAsk: (on: boolean) => void;
  onDelete: () => void;
  onMeasure: (y: number, h: number) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  dragging: boolean;
}) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const lift = useSharedValue(0);
  const told = useSharedValue(0);
  const asks = Boolean(item.qty);

  const commit = (said?: string) => {
    const next = (said ?? draft).trim().slice(0, ITEM_LIMIT);
    setEditing(false);
    if (next && next !== item.text) onRename(next);
  };

  const pan = useMemo(
    () => Gesture.Pan()
      .activateAfterLongPress(220)
      .onStart((e) => { told.value = e.translationY; runOnJS(onDragMove)(e.translationY); })
      .onUpdate((e) => {
        lift.value = e.translationY;
        if (Math.abs(e.translationY - told.value) < 6) return;
        told.value = e.translationY;
        runOnJS(onDragMove)(e.translationY);
      })
      .onEnd((e) => { runOnJS(onDragEnd)(e.translationY); lift.value = 0; })
      .onFinalize(() => { lift.value = 0; }),
    [lift, told, onDragMove, onDragEnd],
  );
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));

  return (
    <Animated.View
      onLayout={(e) => onMeasure(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7,
        borderBottomWidth: 1, borderBottomColor: t.rule2,
        zIndex: dragging ? 10 : 0,
        backgroundColor: dragging ? t.sheet2 : 'transparent',
        borderRadius: dragging ? radius.md : 0 }, lifted]}
    >
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Hold to move ${item.text}`}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={{ color: dragging ? t.accent : t.ink3, fontSize: 15, lineHeight: 18,
            paddingHorizontal: 3 }}>⠿</Text>
        </View>
      </GestureDetector>
      {editing ? (
        <>
          <DraftField
            value={draft}
            onCommit={(v) => commit(v)}
            onBlur={() => commit()}
            maxLength={ITEM_LIMIT}
            returnKeyType="done"
            autoFocus
            accessibilityLabel="What it is called"
          />
          <Pressable onPress={() => commit()} hitSlop={8} accessibilityRole="button"
            accessibilityLabel="Save the name">
            <Text style={{ color: t.hit, fontSize: 17, fontWeight: '800' }}>✓</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable
            onPress={() => { setDraft(item.text); setEditing(true); }}
            accessibilityRole="button"
            accessibilityLabel={`Rename ${item.text}`}
            style={{ flex: 1 }}
          >
            <Text style={{ fontSize: 13.5, color: t.ink }}>{item.text}</Text>
          </Pressable>

          {/* Whether this line asks how many, said with the sign for a number
              and nothing else: it is one bit, and a word for it would be
              longer than most of the lines it sits beside. */}
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: asks }}
            accessibilityLabel={asks
              ? `${item.text} asks how many. Stop asking.`
              : `Make ${item.text} ask how many`}
            hitSlop={8}
            onPress={() => onAsk(!asks)}
            style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8,
              paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 4,
              borderColor: asks ? t.accent : t.rule,
              backgroundColor: asks ? t.accentSoft : 'transparent' }}
          >
            <Glyph name="number" fallback="#" size={10} colour={asks ? t.accent : t.ink3} />
            {asks ? (
              <Mono style={{ fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase',
                color: t.accent, fontWeight: '700' }}>how many</Mono>
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.text}`}
            hitSlop={6}
            onPress={onDelete}
          >
            <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
          </Pressable>
        </>
      )}
    </Animated.View>
  );
}
