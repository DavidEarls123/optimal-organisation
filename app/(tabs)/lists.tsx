import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { WeekHeader } from '../../src/ui/WeekHeader';
import {
  Body, Button, Chip, Empty, Field, Mono, Note, Screen, Section, SectionHead, Segmented, Tick,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { shopListFor, uid } from '../../src/domain/week';
import { watchCount } from '../../src/domain/scoring';
import { weekNumber } from '../../src/domain/dates';
import type { WatchItem } from '../../src/domain/types';

export default function ListsScreen() {
  const [view, setView] = useState<'shop' | 'fun'>('shop');
  return (
    <Screen>
      <WeekHeader compact />
      <Body>
        <Segmented
          value={view}
          onChange={setView}
          options={[{ key: 'shop', label: 'Shopping' }, { key: 'fun', label: 'Entertainment' }]}
        />
        {view === 'shop' ? <Shopping /> : <Entertainment />}
      </Body>
    </Screen>
  );
}

function Shopping() {
  const t = useTheme();
  const { state, weekId, update } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const week = state.weeks[weekId];
  if (!week) return null;

  // Reading the list is what copies it forward from last week, once.
  if (!Array.isArray(week.shop)) {
    update((d) => { shopListFor(d, weekId); });
    return <Empty>Setting up this week&apos;s list…</Empty>;
  }
  const groups = week.shop;
  const all = groups.reduce((a, g) => a + g.items.length, 0);
  const got = groups.reduce((a, g) => a + g.items.filter((i) => i.done).length, 0);

  return (
    <Section>
      <SectionHead title={`Shopping · week ${weekNumber(weekId)}`} right={`${got}/${all}`} />
      {week.shopCopiedFrom ? (
        <Note>
          {`Copied from week ${weekNumber(week.shopCopiedFrom)}. Anything you change here stays in this week.`}
        </Note>
      ) : null}

      {groups.length === 0 ? <Empty>Nothing on the list yet.</Empty> : null}

      {groups.map((g) => (
        <View key={g.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 13, paddingBottom: 3 }}>
            <Field
              value={g.name}
              onChangeText={(v) => update((d) => {
                const gg = d.weeks[weekId].shop?.find((x) => x.id === g.id);
                if (gg) gg.name = v;
              })}
              style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0,
                paddingVertical: 2, fontSize: 12.5, letterSpacing: 1.1, textTransform: 'uppercase',
                fontWeight: '700', color: t.ink }}
              accessibilityLabel={`Rename ${g.name}`}
            />
            <Mono>{`${g.items.filter((i) => i.done).length}/${g.items.length}`}</Mono>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${g.name}`}
              onPress={() => update((d) => {
                const w = d.weeks[weekId];
                w.shop = (w.shop ?? []).filter((x) => x.id !== g.id);
              })}
            >
              <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
            </Pressable>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: t.rule }}>
            {g.items.map((it) => (
              <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9,
                paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: it.done }}
                  accessibilityLabel={it.text}
                  hitSlop={6}
                  onPress={() => update((d) => {
                    const item = d.weeks[weekId].shop?.find((x) => x.id === g.id)
                      ?.items.find((y) => y.id === it.id);
                    if (item) item.done = !item.done;
                  })}
                >
                  <Tick on={it.done} />
                </Pressable>
                <Text style={{ flex: 1, fontSize: 13.5, color: it.done ? t.ink3 : t.ink,
                  textDecorationLine: it.done ? 'line-through' : 'none' }}>{it.text}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${it.text}`}
                  hitSlop={6}
                  onPress={() => update((d) => {
                    const gg = d.weeks[weekId].shop?.find((x) => x.id === g.id);
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
              returnKeyType="done"
              onSubmitEditing={() => {
                const text = (drafts[g.id] ?? '').trim();
                if (!text) return;
                update((d) => {
                  d.weeks[weekId].shop?.find((x) => x.id === g.id)
                    ?.items.push({ id: uid('i'), text, done: false });
                });
                setDrafts((p) => ({ ...p, [g.id]: '' }));
              }}
            />
            <Button title="Add" onPress={() => {
              const text = (drafts[g.id] ?? '').trim();
              if (!text) return;
              update((d) => {
                d.weeks[weekId].shop?.find((x) => x.id === g.id)
                  ?.items.push({ id: uid('i'), text, done: false });
              });
              setDrafts((p) => ({ ...p, [g.id]: '' }));
            }} />
          </View>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={() => update((d) => {
          const w = d.weeks[weekId];
          (w.shop ??= []).push({ id: uid('g'), name: 'New heading', items: [] });
        })}
        style={{ paddingTop: 14 }}
      >
        <Text style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase',
          color: t.accent, fontWeight: '600' }}>+ Add heading</Text>
      </Pressable>
    </Section>
  );
}

function Entertainment() {
  const t = useTheme();
  const { state, update } = useStore();
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<WatchItem['kind']>('tv');

  const todo = state.watch.filter((x) => !x.done);
  const seen = state.watch.filter((x) => x.done);

  const row = (x: WatchItem) => {
    const nights = watchCount(state, x.id);
    return (
      <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9,
        paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: x.done }}
          accessibilityLabel={x.done ? `Reopen ${x.title}` : `Mark complete: ${x.title}`}
          hitSlop={6}
          onPress={() => update((d) => {
            const it = d.watch.find((y) => y.id === x.id);
            if (it) it.done = !it.done;
          })}
        >
          <Tick on={x.done} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13.5, color: x.done ? t.ink3 : t.ink,
            textDecorationLine: x.done ? 'line-through' : 'none' }}>{x.title}</Text>
          {x.kind === 'tv' && nights ? (
            <Mono style={{ fontSize: 9.5, marginTop: 2 }}>
              {`${nights} night${nights === 1 ? '' : 's'} watched`}
            </Mono>
          ) : null}
        </View>
        <Chip text={x.kind === 'tv' ? 'Series' : 'Film'} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${x.title}`}
          hitSlop={6}
          onPress={() => update((d) => { d.watch = d.watch.filter((y) => y.id !== x.id); })}
        >
          <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
        </Pressable>
      </View>
    );
  };

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    update((d) => { d.watch.unshift({ id: uid('w'), title, kind, done: false }); });
    setDraft('');
  };

  return (
    <Section>
      <SectionHead title="Watchlist" right={`${seen.length}/${state.watch.length} watched`} />
      {todo.length ? todo.map(row) : <Empty>Nothing left on the list.</Empty>}

      <View style={{ flexDirection: 'row', gap: 7, paddingTop: 7 }}>
        <Field value={draft} onChangeText={setDraft} placeholder="Add a film or series…"
          returnKeyType="done" onSubmitEditing={add} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Kind: ${kind === 'tv' ? 'series' : 'film'}`}
          onPress={() => setKind((k) => (k === 'tv' ? 'film' : 'tv'))}
          style={{ borderWidth: 1, borderColor: t.rule, backgroundColor: t.sheet2,
            borderRadius: radius.md, paddingHorizontal: 11, justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: t.ink2 }}>
            {kind === 'tv' ? 'Series' : 'Film'}
          </Text>
        </Pressable>
        <Button title="Add" onPress={add} />
      </View>

      {seen.length ? (
        <View style={{ paddingTop: 12 }}>
          <SectionHead title={`Watched · ${seen.length}`} />
          {seen.map(row)}
        </View>
      ) : null}

      <Note>
        Tick TV on any day and pick from this list — more than one if it was that sort
        of night. A film is done the night you watch it. A series stays on the list however many
        nights you pick it, counting them up; tick it here when you finish it.
      </Note>
    </Section>
  );
}
