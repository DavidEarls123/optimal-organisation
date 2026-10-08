import React, { useMemo, useState } from 'react';
import { Alert, Keyboard, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Text } from '../src/ui/type';

import {
  Body, Button, Field, Mono, Note, Screen, Section, SectionHead,
} from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import {
  defaultShopList, placeShopItem, resetShopFromTemplate, shopOrdered, shopTemplateOf, uid,
} from '../src/domain/week';
import { useListDrag } from '../src/ui/useListDrag';
import type { ShopItem } from '../src/domain/types';

const ITEM_LIMIT = 60;
const HEADING_LIMIT = 28;

/** The standing list every week is built from. Editing it changes what future
 *  weeks start with; this week is only touched if you ask for it explicitly. */
export default function ShopTemplateScreen() {
  const t = useTheme();
  const { state, weekId, update } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Which heading has its composer open. Only ever one. */
  const [adding, setAdding] = useState<string | null>(null);

  // Shown from the defaults until there is something stored. Writing to the
  // store while the page is being drawn is how you get a page that does
  // nothing; every edit below creates it on the way past instead.
  const groups = Array.isArray(state.shopTemplate) ? state.shopTemplate : defaultShopList();
  const total = groups.reduce((a, g) => a + g.items.length, 0);

  /** Every change goes through here. It used to reach for `d.shopTemplate`
   *  directly and give up if it was not there, which on a list still showing
   *  its defaults meant every edit quietly did nothing. */
  const onList = (fn: (list: ReturnType<typeof shopTemplateOf>) => void, label?: string) =>
    update((d) => { fn(shopTemplateOf(d)); }, label);

  const addItem = (groupId: string) => {
    const text = (drafts[groupId] ?? '').trim().slice(0, ITEM_LIMIT);
    // Nothing typed and you pressed next: that means you are finished.
    if (!text) { setAdding(null); Keyboard.dismiss(); return; }
    onList((list) => {
      list.find((g) => g.id === groupId)
        ?.items.push({ id: uid('i'), text, need: false, done: false });
    }, 'adding that');
    setDrafts((p) => ({ ...p, [groupId]: '' }));
  };

  // The same geometry the week's own list uses, because it is the same gesture.
  const drawn = shopOrdered(groups);
  const drag = useListDrag({
    order: drawn.map((x) => ({ id: x.id, sec: x.gid })),
    sections: groups.map((g) => g.id),
    onDrop: (id, at, gid) => onList((list) => { placeShopItem(list, id, at, gid); }, 'moving that'),
  });

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

        {groups.map((g) => {
          const line = drag.lineIn(g.id);
          return (
            <View key={g.id} onLayout={(e) => drag.measureSection(g.id, e.nativeEvent.layout.y)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingTop: 4, paddingBottom: 3 }}>
                <Field
                  value={g.name}
                  onChangeText={(v) => onList((list) => {
                    const gg = list.find((x) => x.id === g.id);
                    if (gg) gg.name = v;
                  })}
                  onBlur={() => onList((list) => {
                    const gg = list.find((x) => x.id === g.id);
                    if (gg) gg.name = gg.name.trim();
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
                       onPress: () => onList((list) => {
                         const at = list.findIndex((x) => x.id === g.id);
                         if (at >= 0) list.splice(at, 1);
                       }, 'removing that heading'),
                     }],
                  )}
                >
                  <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>

              <View
                style={{ borderTopWidth: 1, borderTopColor: t.rule }}
                onLayout={(e) => drag.measureList(g.id, e.nativeEvent.layout.y)}
              >
                {g.items.map((it) => (
                  <TemplateRow
                    key={it.id}
                    item={it}
                    onRename={(text) => onList((list) => {
                      const x = list.find((y) => y.id === g.id)?.items.find((y) => y.id === it.id);
                      if (x) x.text = text;
                    }, 'renaming that')}
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
                <View style={{ gap: 7, paddingTop: 7 }}>
                  <Field
                    value={drafts[g.id] ?? ''}
                    onChangeText={(v) => setDrafts((p) => ({ ...p, [g.id]: v }))}
                    placeholder={`Add to ${g.name.toLowerCase()}…`}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    maxLength={ITEM_LIMIT}
                    autoFocus
                    onSubmitEditing={() => addItem(g.id)}
                  />
                  <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                    <Mono style={{ flex: 1, fontSize: 10.5 }}>Return adds it and keeps going</Mono>
                    <Button
                      title={(drafts[g.id] ?? '').trim() ? 'Add' : 'Done'}
                      tone={(drafts[g.id] ?? '').trim() ? 'soft' : 'ghost'}
                      onPress={() => addItem(g.id)}
                    />
                  </View>
                </View>
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

        <Button
          tone="ghost"
          title="+ Add a heading"
          onPress={() => onList((list) => {
            list.push({ id: uid('g'), name: 'New heading', items: [] });
          }, 'adding that heading')}
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

/** One line on the standing list: its name, which you tap to change, and the
 *  handle that moves it. No tick — nothing here is needed or got; that is a
 *  question a week asks, not the list it starts from. */
function TemplateRow({ item, onRename, onDelete, onMeasure, onDragMove, onDragEnd, dragging }: {
  item: ShopItem;
  onRename: (text: string) => void;
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

  const commit = () => {
    const next = draft.trim().slice(0, ITEM_LIMIT);
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
          <Field
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            onBlur={commit}
            maxLength={ITEM_LIMIT}
            returnKeyType="done"
            autoFocus
            accessibilityLabel="Item name"
          />
          <Pressable onPress={commit} hitSlop={8} accessibilityRole="button"
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
