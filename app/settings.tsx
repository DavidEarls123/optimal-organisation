import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Text } from '../src/ui/type';
import { useRouter } from 'expo-router';

import {
  Body, Button, Field, Mono, Note, Screen, Section, SectionHead, Segmented, Sheet,
} from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { HABIT_PRESETS, TRACK_PRESETS, slug } from '../src/domain/catalogue';
import { TEXT_SIZES } from '../src/domain/types';
import { moveHabit, placeHabit, uid } from '../src/domain/week';
import { APP_BY, APP_NAME } from '../src/brand';

const NAME_LIMIT = 32;

/** One row in a list you can turn on and off. Turning a habit off keeps it —
 *  its history and its identity stay, so turning it back on later carries on
 *  the same habit rather than starting a new one. */
function Row({ name, note, on, onToggle, onRemove, onMove, drag }: {
  name: string; note?: string; on: boolean; onToggle: () => void; onRemove?: () => void;
  /** Up and down the list, when the order is something you can set. */
  onMove?: (dir: -1 | 1) => void;
  /** Hold and drag, for the same order by hand. */
  drag?: {
    onMeasure: (h: number) => void;
    onMove: (dy: number) => void;
    onEnd: (dy: number) => void;
    dragging: boolean;
  };
}) {
  const t = useTheme();
  const lift = useSharedValue(0);
  const told = useSharedValue(0);
  const move = drag?.onMove;
  const end = drag?.onEnd;
  const pan = useMemo(
    () => Gesture.Pan()
      .activateAfterLongPress(220)
      .onStart((e) => {
        told.value = e.translationY;
        if (move) runOnJS(move)(e.translationY);
      })
      .onUpdate((e) => {
        lift.value = e.translationY;
        if (Math.abs(e.translationY - told.value) < 6) return;
        told.value = e.translationY;
        if (move) runOnJS(move)(e.translationY);
      })
      .onEnd((e) => {
        if (end) runOnJS(end)(e.translationY);
        lift.value = 0;
      })
      .onFinalize(() => { lift.value = 0; }),
    [lift, told, move, end],
  );
  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  const arrow = (dir: -1 | 1) => (
    <Pressable
      onPress={() => onMove?.(dir)}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Move ${name} ${dir === -1 ? 'up' : 'down'}`}
      style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: t.rule, borderRadius: radius.sm + 1 }}
    >
      <Text style={{ fontSize: 11, color: t.ink2, lineHeight: 13 }}>{dir === -1 ? '↑' : '↓'}</Text>
    </Pressable>
  );
  return (
    <Animated.View
      onLayout={(e) => drag?.onMeasure(e.nativeEvent.layout.height)}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 9,
        paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.rule2,
        zIndex: drag?.dragging ? 10 : 0,
        backgroundColor: drag?.dragging ? t.sheet2 : 'transparent',
        borderRadius: drag?.dragging ? radius.md : 0 }, drag ? lifted : null]}
    >
      {drag ? (
        <GestureDetector gesture={pan}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Hold to move ${name}`}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <Text style={{ color: drag.dragging ? t.accent : t.ink3, fontSize: 15,
              lineHeight: 18 }}>⠿</Text>
          </View>
        </GestureDetector>
      ) : null}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel={name}
        onPress={onToggle}
        hitSlop={6}
        style={{ width: 44, height: 26, borderRadius: 13, padding: 3, justifyContent: 'center',
          backgroundColor: on ? t.accent : t.sunk,
          borderWidth: 1, borderColor: on ? t.accent : t.rule }}
      >
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: t.sheet,
          alignSelf: on ? 'flex-end' : 'flex-start' }} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14.5, color: on ? t.ink : t.ink3 }}>{name}</Text>
        {note ? <Mono style={{ fontSize: 10.5, marginTop: 1 }}>{note}</Mono> : null}
      </View>
      {onMove ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>{arrow(-1)}{arrow(1)}</View>
      ) : null}
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={`Delete ${name}`}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

/** The line showing where a held row would land. */
function DropLine() {
  const t = useTheme();
  return (
    <View style={{ height: 2, backgroundColor: t.accent, borderRadius: 1, marginVertical: -1 }} />
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { state, update } = useStore();
  const [pickHabit, setPickHabit] = useState(false);
  const [pickTrack, setPickTrack] = useState(false);
  const [newHabit, setNewHabit] = useState('');
  const [newTrack, setNewTrack] = useState('');

  /** Holding a habit and dragging it. Every row is the same height and there is
   *  nothing between them, so where the finger is really is a count of rows. */
  const rowH = useRef<Record<string, number>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const landing = (id: string, dy: number) => {
    const from = state.habits.findIndex((h) => h.id === id);
    if (from < 0) return 0;
    const rest = state.habits.filter((h) => h.id !== id);
    const tall = (hid: string) => rowH.current[hid] || 44;
    let at = from;
    if (dy > 0) {
      let run = 0;
      for (let i = from; i < rest.length; i += 1) {
        run += tall(rest[i].id);
        if (run > dy) break;
        at = i + 1;
      }
    } else {
      let run = 0;
      for (let i = from - 1; i >= 0; i -= 1) {
        run += tall(rest[i].id);
        if (run > -dy) break;
        at = i;
      }
    }
    return Math.max(0, Math.min(rest.length, at));
  };

  const rest = new Map<string, number>();
  if (dragId) state.habits.filter((h) => h.id !== dragId).forEach((h, i) => rest.set(h.id, i));

  const have = new Set(state.habits.map((h) => h.id));
  const haveTracks = new Set(state.trackables.map((x) => x.id));

  const addHabit = (name: string, id?: string, picks?: 'watch' | 'weight', def?: unknown) => {
    const clean = name.trim().slice(0, NAME_LIMIT);
    if (!clean) return;
    const key = id ?? slug(clean);
    update((d) => {
      const found = d.habits.find((h) => h.id === key);
      // Turning an old habit back on rather than making a second one keeps its
      // history attached to it.
      if (found) { found.active = true; return; }
      d.habits.push({
        id: key, name: clean, short: clean.slice(0, 12), active: true,
        ...(picks ? { picks } : {}),
        ...(def ? { def: JSON.parse(JSON.stringify(def)) } : {}),
      });
    });
    setNewHabit('');
    setPickHabit(false);
  };

  const addTrack = (name: string) => {
    const clean = name.trim().slice(0, NAME_LIMIT);
    if (!clean) return;
    const key = slug(clean);
    update((d) => {
      if (d.trackables.some((x) => x.id === key)) return;
      d.trackables.push({ id: key, name: clean, ci: d.trackables.length % 12 });
    });
    setNewTrack('');
    setPickTrack(false);
  };

  return (
    <Screen>
      <Body>
        <Section>
          <SectionHead title="Appearance" />
          <Note>Follows your phone unless you tell it otherwise.</Note>
          <Segmented
            value={state.prefs.theme}
            onChange={(v) => update((d) => { d.prefs.theme = v; })}
            options={[
              { key: 'system' as const, label: 'Automatic' },
              { key: 'light' as const, label: 'Light' },
              { key: 'dark' as const, label: 'Dark' },
            ]}
          />
        </Section>

        <Section>
          <SectionHead title="Text size" />
          <Note>
            How big the writing is, everywhere in the app. This page changes with it,
            so what you see here is what you get.
          </Note>
          <Segmented
            value={state.prefs.textSize}
            onChange={(k) => update((d) => { d.prefs.textSize = k; }, 'the text size')}
            options={TEXT_SIZES.map((x) => ({ key: x.key, label: x.name }))}
          />
          <Mono style={{ fontSize: 10.5 }}>
            {TEXT_SIZES.find((x) => x.key === state.prefs.textSize)?.note ?? ''}
          </Mono>
        </Section>

        <Section>
          <SectionHead title="Units" />
          <Segmented
            value={state.prefs.weightUnit}
            onChange={(v) => update((d) => { d.prefs.weightUnit = v; })}
            options={[
              { key: 'kg' as const, label: 'Kilograms' },
              { key: 'lb' as const, label: 'Pounds' },
            ]}
          />
        </Section>

        <Section>
          <SectionHead title="Habits" right={`${state.habits.filter((h) => h.active).length} on`} />
          <Note>
            Everything you might tick on a day. Turning one off hides it without losing
            anything — turn it back on and its history is still there. The order here is
            the order the tiles sit in on a day: first one top left, second beside it,
            third under the first. Hold the ⠿ and drag one where you want it, or step it
            along with the arrows.
          </Note>
          <View>
            {state.habits.map((h) => (
              <React.Fragment key={h.id}>
                {dragId && rest.get(h.id) === dropAt ? <DropLine /> : null}
                <Row
                  name={h.name}
                  note={h.picks === 'weight' ? 'Asks for a number'
                    : h.picks === 'watch' ? 'Picks from your watchlist' : undefined}
                  on={h.active}
                  onToggle={() => update((d) => {
                    const x = d.habits.find((y) => y.id === h.id);
                    if (x) x.active = !x.active;
                  })}
                  onMove={(dir) => update((d) => { moveHabit(d, h.id, dir); },
                    'moving that habit')}
                  drag={{
                    dragging: dragId === h.id,
                    onMeasure: (height) => { rowH.current[h.id] = height; },
                    onMove: (dy) => {
                      setDragId((cur) => (cur === h.id ? cur : h.id));
                      const to = landing(h.id, dy);
                      setDropAt((cur) => (cur === to ? cur : to));
                    },
                    onEnd: (dy) => {
                      const to = landing(h.id, dy);
                      setDragId(null);
                      setDropAt(null);
                      update((d) => { placeHabit(d, h.id, to); }, 'moving that habit');
                    },
                  }}
                  onRemove={() => Alert.alert(
                    `Delete ${h.name}?`,
                    'Every tick of it, in every week, goes too. Turning it off instead keeps '
                    + 'the history and just hides it.',
                    [{ text: 'Cancel', style: 'cancel' },
                     {
                       text: 'Delete',
                       style: 'destructive',
                       onPress: () => update((d) => {
                         d.habits = d.habits.filter((y) => y.id !== h.id);
                         for (const w of Object.values(d.weeks)) {
                           delete w.habitPlan[h.id];
                           for (const map of Object.values(w.habits)) delete map[h.id];
                         }
                       }),
                     }],
                  )}
                />
              </React.Fragment>
            ))}
            {/* Landing at the very bottom has no row to sit above. */}
            {dragId && dropAt !== null && dropAt >= rest.size ? <DropLine /> : null}
          </View>
          <Button title="+ Add a habit" onPress={() => setPickHabit(true)} />
        </Section>

        <Section>
          <SectionHead title="Tracked sessions" right={`${state.trackables.length}`} />
          <Note>The tags you can put on a task — what shows up in the week ahead.</Note>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {state.trackables.map((k) => {
              const [line, soft] = t.track[k.ci % t.track.length];
              return (
                <Pressable
                  key={k.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${k.name}`}
                  onPress={() => Alert.alert(
                    `Remove ${k.name}?`,
                    'Tasks already tagged with it keep the tag until you change them.',
                    [{ text: 'Cancel', style: 'cancel' },
                     {
                       text: 'Remove',
                       style: 'destructive',
                       onPress: () => update((d) => {
                         d.trackables = d.trackables.filter((x) => x.id !== k.id);
                       }),
                     }],
                  )}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 7,
                    borderWidth: 1, borderColor: line, backgroundColor: soft,
                    borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: line }}>{k.name}</Text>
                  <Text style={{ fontSize: 11, color: line }}>✕</Text>
                </Pressable>
              );
            })}
          </View>
          <Button title="+ Add a session type" onPress={() => setPickTrack(true)} />
        </Section>

        <Section>
          <SectionHead title="Your data" />
          <Note>All of it is on this phone. Nothing is sent anywhere.</Note>
          <Button title="Backup & restore" onPress={() => router.push('/backup')} />
          <Button tone="ghost" title="Shape of the week" onPress={() => router.push('/template')} />
        </Section>

        <View style={{ alignItems: 'center', paddingTop: 6, gap: 2 }}>
          <Mono style={{ fontSize: 10.5 }}>{`${APP_NAME} · v1.0`}</Mono>
          <Mono style={{ fontSize: 10.5 }}>{`built by ${APP_BY}`}</Mono>
        </View>
      </Body>

      <Sheet
        open={pickHabit}
        title="Add a habit"
        onClose={() => setPickHabit(false)}
        footer={
          <>
            <Field
              value={newHabit}
              onChangeText={setNewHabit}
              placeholder="Or type your own…"
              maxLength={NAME_LIMIT}
              onSubmitEditing={() => addHabit(newHabit)}
              returnKeyType="done"
            />
            <Button title="Add" onPress={() => addHabit(newHabit)} />
          </>
        }
      >
        {HABIT_PRESETS.map((g) => (
          <View key={g.group} style={{ gap: 6 }}>
            <Mono style={{ letterSpacing: 1.2, textTransform: 'uppercase', fontSize: 10 }}>
              {g.group}
            </Mono>
            {g.items.map((h) => {
              const already = have.has(h.id);
              const on = state.habits.find((x) => x.id === h.id)?.active;
              return (
                <Pressable
                  key={h.id}
                  accessibilityRole="button"
                  disabled={already && on}
                  onPress={() => addHabit(h.name, h.id, h.picks, h.def)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                    borderWidth: 1, borderColor: t.rule, borderRadius: radius.md,
                    paddingHorizontal: 12, paddingVertical: 11,
                    opacity: already && on ? 0.4 : 1 }}
                >
                  <Text style={{ flex: 1, fontSize: 14.5, color: t.ink }}>{h.name}</Text>
                  <Mono style={{ fontSize: 10.5 }}>
                    {already && on ? 'on' : already ? 'turn back on' : 'add'}
                  </Mono>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Sheet>

      <Sheet
        open={pickTrack}
        title="Add a session type"
        onClose={() => setPickTrack(false)}
        footer={
          <>
            <Field
              value={newTrack}
              onChangeText={setNewTrack}
              placeholder="Or type your own…"
              maxLength={NAME_LIMIT}
              onSubmitEditing={() => addTrack(newTrack)}
              returnKeyType="done"
            />
            <Button title="Add" onPress={() => addTrack(newTrack)} />
          </>
        }
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {TRACK_PRESETS.map((name) => {
            const already = haveTracks.has(slug(name));
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                disabled={already}
                onPress={() => addTrack(name)}
                style={{ borderWidth: 1, borderColor: t.rule, borderRadius: radius.pill,
                  paddingHorizontal: 13, paddingVertical: 8, opacity: already ? 0.35 : 1 }}
              >
                <Text style={{ fontSize: 13, color: t.ink }}>{name}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </Screen>
  );
}
