import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../src/ui/type';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Body, Button, Chip, Empty, Field, Mono, Note, Screen, Tick } from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { DAY_NAMES } from '../src/domain/dates';
import { watchCount } from '../src/domain/scoring';
import { uid } from '../src/domain/week';

export default function WatchScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const day = Number(params.day ?? 0);
  const { state, weekId, update } = useStore();
  const week = state.weeks[weekId];

  const before = week?.watched[day] ?? [];
  const [picked, setPicked] = useState<string[]>(before);
  const [draft, setDraft] = useState('');

  if (!week) return null;

  /** A completed title is out of the running, unless it was already picked tonight. */
  const list = state.watch.filter((x) => !x.done || picked.includes(x.id));

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const commit = () => {
    update((d) => {
      const w = d.weeks[weekId];
      // Only films are finished by one sitting; a series is completed from the main list.
      for (const id of before) {
        if (picked.includes(id)) continue;
        const it = d.watch.find((x) => x.id === id);
        if (it && it.kind !== 'tv') it.done = false;
      }
      for (const id of picked) {
        const it = d.watch.find((x) => x.id === id);
        if (it && it.kind !== 'tv') it.done = true;
      }
      const habits = (w.habits[day] ??= {});
      if (picked.length) { w.watched[day] = [...picked]; habits.tv = true; }
      else { delete w.watched[day]; delete habits.tv; }
    });
    router.back();
  };

  return (
    <Screen>
      <Body>
        <Note>
          {DAY_NAMES[day]}. Pick as many as you like. Films get marked watched; series stay on the
          list and count the night.
        </Note>

        {list.length === 0 ? <Empty>Your watchlist is empty — add something below.</Empty> : null}

        {list.map((x) => {
          const on = picked.includes(x.id);
          const nights = watchCount(state, x.id);
          return (
            <Pressable
              key={x.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => toggle(x.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1,
                borderRadius: radius.md, padding: 11,
                borderColor: on ? t.accent : t.rule,
                backgroundColor: on ? t.accentSoft : t.sheet }}
            >
              <Tick on={on} size={19} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, color: t.ink }}>{x.title}</Text>
                {x.kind === 'tv' && nights ? (
                  <Mono style={{ fontSize: 9.5, marginTop: 2 }}>
                    {`${nights} night${nights === 1 ? '' : 's'} so far`}
                  </Mono>
                ) : null}
              </View>
              <Chip text={x.kind === 'tv' ? 'Series' : 'Film'} />
            </Pressable>
          );
        })}

        <View style={{ flexDirection: 'row', gap: 7 }}>
          <Field value={draft} onChangeText={setDraft} placeholder="Something not on the list…" />
          <Button title="Add" onPress={() => {
            const title = draft.trim();
            if (!title) return;
            const id = uid('w');
            update((d) => { d.watch.unshift({ id, title, kind: 'tv', done: false }); });
            setPicked((p) => [...p, id]);
            setDraft('');
          }} />
        </View>

        <Button
          tone="big"
          title={picked.length
            ? `Save ${picked.length} — tick the habit`
            : 'Nothing tonight — leave it unticked'}
          onPress={commit}
        />
      </Body>
    </Screen>
  );
}
