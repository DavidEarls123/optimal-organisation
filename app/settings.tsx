import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  Body, Button, Field, Mono, Note, Screen, Section, SectionHead, Segmented, Sheet,
} from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { HABIT_PRESETS, TRACK_PRESETS, slug } from '../src/domain/catalogue';
import { uid } from '../src/domain/week';
import { APP_BY, APP_NAME } from '../src/brand';
import { dayLook } from '../src/ui/WeekHeader';
import { DAY_STYLES } from '../src/domain/types';

const NAME_LIMIT = 32;

/** One row in a list you can turn on and off. Turning a habit off keeps it —
 *  its history and its identity stay, so turning it back on later carries on
 *  the same habit rather than starting a new one. */
function Row({ name, note, on, onToggle, onRemove }: {
  name: string; note?: string; on: boolean; onToggle: () => void; onRemove?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
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
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button"
          accessibilityLabel={`Delete ${name}`}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
        </Pressable>
      ) : null}
    </View>
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
          <SectionHead title="The day you are on" />
          <Note>
            How the day is picked out in the strip at the top. Each is drawn here as it
            will actually look.
          </Note>
          <View style={{ gap: 8 }}>
            {DAY_STYLES.map((opt) => {
              const on = state.prefs.dayStyle === opt.key;
              const look = dayLook(t, opt.key);
              return (
                <Pressable
                  key={opt.key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => update((d) => { d.prefs.dayStyle = opt.key; }, 'that setting')}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                    borderWidth: 1, borderRadius: radius.md, padding: 10,
                    borderColor: on ? t.accent : t.rule,
                    backgroundColor: on ? t.accentSoft : 'transparent' }}
                >
                  {/* Three days, the middle one selected, at the real size. */}
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    {[0, 1, 2].map((i) => {
                      const sel = i === 1;
                      return (
                        <View
                          key={i}
                          style={{ width: 34, alignItems: 'center', gap: 4, paddingVertical: 6,
                            borderRadius: radius.md,
                            borderWidth: sel ? look.border : 1,
                            borderColor: sel ? look.edge : 'transparent',
                            backgroundColor: sel ? look.fill : 'transparent',
                            borderBottomWidth: sel && opt.key === 'underline' ? 3 : undefined,
                            borderBottomColor: sel && opt.key === 'underline' ? t.accent : undefined }}
                        >
                          <Text style={{ fontSize: 9, letterSpacing: 0.8,
                            color: sel ? look.ink : t.ink3 }}>{'MTW'[i]}</Text>
                          <View style={{ width: 18, height: 18, borderRadius: 9,
                            borderWidth: 2.5, borderColor: sel ? look.track : t.rule,
                            borderTopColor: sel ? look.sweep : t.hit,
                            borderRightColor: sel ? look.sweep : t.hit,
                            backgroundColor: sel ? look.hole : t.sheet }} />
                          <Text style={{ fontSize: 11, fontWeight: sel ? '800' : '600',
                            color: sel ? look.ink : t.ink }}>{15 + i}</Text>
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: on ? '700' : '500',
                      color: on ? t.accent : t.ink }}>{opt.name}</Text>
                    <Mono style={{ fontSize: 10, marginTop: 2 }}>{opt.note}</Mono>
                  </View>
                </Pressable>
              );
            })}
          </View>
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
            anything — turn it back on and its history is still there.
          </Note>
          <View>
            {state.habits.map((h) => (
              <Row
                key={h.id}
                name={h.name}
                note={h.picks === 'weight' ? 'Asks for a number'
                  : h.picks === 'watch' ? 'Picks from your watchlist' : undefined}
                on={h.active}
                onToggle={() => update((d) => {
                  const x = d.habits.find((y) => y.id === h.id);
                  if (x) x.active = !x.active;
                })}
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
            ))}
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
