import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { WeekHeader } from '../../src/ui/WeekHeader';
import {
  Body, Button, Chip, Empty, Field, Mono, Note, Screen, Section, SectionHead, Segmented, Tick,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { shopCounts, shopListFor, shoppingList, uid } from '../../src/domain/week';
import { watchCount } from '../../src/domain/scoring';
import { weekNumber } from '../../src/domain/dates';
import type { ShopItem, WatchItem } from '../../src/domain/types';

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
  const router = useRouter();
  const { state, weekId, update } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Shopping mode: only what is needed, and only the got tick. */
  const [inShop, setInShop] = useState(false);
  const week = state.weeks[weekId];
  if (!week) return null;

  // Reading the list is what builds it, once.
  if (!Array.isArray(week.shop)) {
    update((d) => { shopListFor(d, weekId); });
    return <Empty>Setting up this week&apos;s list…</Empty>;
  }
  const groups = week.shop;
  const { need, got } = shopCounts(groups);
  const trolley = shoppingList(groups);

  const setItem = (groupId: string, itemId: string, patch: Partial<ShopItem>) => update((d) => {
    const item = d.weeks[weekId].shop?.find((x) => x.id === groupId)
      ?.items.find((y) => y.id === itemId);
    if (item) Object.assign(item, patch);
  });

  const addItem = (groupId: string) => {
    const text = (drafts[groupId] ?? '').trim().slice(0, 60);
    if (!text) return;
    update((d) => {
      d.weeks[weekId].shop?.find((x) => x.id === groupId)
        // Typing something in is itself saying you need it.
        ?.items.push({ id: uid('i'), text, need: true, done: false });
    });
    setDrafts((p) => ({ ...p, [groupId]: '' }));
  };

  // ---- shopping mode: the short list, and only the tick that matters in a shop
  if (inShop) {
    return (
      <Section>
        <SectionHead title="At the shop" right={`${got}/${need}`} />
        <Button title="← Back to the whole list" onPress={() => setInShop(false)} />
        {trolley.length === 0 ? (
          <Empty>Nothing marked as needed this week.</Empty>
        ) : null}
        {trolley.map((g) => (
          <View key={g.id}>
            <Text style={{ fontSize: 12.5, letterSpacing: 1.1, textTransform: 'uppercase',
              fontWeight: '700', color: t.ink, paddingTop: 13, paddingBottom: 5 }}>
              {g.name}
            </Text>
            <View style={{ borderTopWidth: 1, borderTopColor: t.rule }}>
              {g.items.map((it) => (
                <Pressable
                  key={it.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: it.done }}
                  accessibilityLabel={it.text}
                  onPress={() => setItem(g.id, it.id, { done: !it.done })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: t.rule2 }}
                >
                  <Tick on={it.done} size={22} />
                  <Text style={{ flex: 1, fontSize: 16, color: it.done ? t.ink3 : t.ink,
                    textDecorationLine: it.done ? 'line-through' : 'none' }}>{it.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        {got === need && need > 0 ? (
          <Note>That is everything. Nothing left on the list.</Note>
        ) : null}
      </Section>
    );
  }

  // ---- the whole list: decide what you need this week
  return (
    <Section>
      <SectionHead title={`Shopping · week ${weekNumber(weekId)}`} right={`${need} needed`} />
      <Note>
        Tick what you need this week on the left. The shop button then gives you just those,
        with one tick each, so you are not reading past everything you do not need.
      </Note>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title={`Go shopping · ${need}`} onPress={() => setInShop(true)} />
        </View>
        <Button tone="ghost" title="Standard list" onPress={() => router.push('/shop-template')} />
      </View>

      {week.shopCopiedFrom ? (
        <Note>
          {`Carried over from week ${weekNumber(week.shopCopiedFrom)}, with nothing marked needed yet.`}
        </Note>
      ) : null}

      {groups.length === 0 ? <Empty>Nothing on the list yet.</Empty> : null}

      {groups.map((g) => {
        const gNeed = g.items.filter((i) => i.need).length;
        return (
          <View key={g.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 13, paddingBottom: 3 }}>
              <Field
                value={g.name}
                onChangeText={(v) => update((d) => {
                  const gg = d.weeks[weekId].shop?.find((x) => x.id === g.id);
                  if (gg) gg.name = v;
                })}
                maxLength={28}
                style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0,
                  paddingVertical: 2, fontSize: 12.5, letterSpacing: 1.1, textTransform: 'uppercase',
                  fontWeight: '700', color: t.ink }}
                accessibilityLabel={`Rename ${g.name}`}
              />
              <Mono>{gNeed ? `${gNeed} needed` : '—'}</Mono>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${g.name}`}
                hitSlop={6}
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
                    accessibilityState={{ checked: it.need }}
                    accessibilityLabel={`Need ${it.text}`}
                    hitSlop={6}
                    onPress={() => setItem(g.id, it.id, { need: !it.need, done: false })}
                  >
                    <Tick on={it.need} tone="accent" />
                  </Pressable>
                  <Text style={{ flex: 1, fontSize: 13.5,
                    color: it.need ? t.ink : t.ink3 }}>{it.text}</Text>
                  {it.need ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: it.done }}
                      accessibilityLabel={`Got ${it.text}`}
                      hitSlop={6}
                      onPress={() => setItem(g.id, it.id, { done: !it.done })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                    >
                      <Mono style={{ fontSize: 9.5, letterSpacing: 0.7, textTransform: 'uppercase',
                        color: it.done ? t.hit : t.ink3 }}>got</Mono>
                      <Tick on={it.done} tone="hit" />
                    </Pressable>
                  ) : null}
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
                returnKeyType="next"
                blurOnSubmit={false}
                maxLength={60}
                onSubmitEditing={() => addItem(g.id)}
              />
              <Button title="Add" onPress={() => addItem(g.id)} />
            </View>
          </View>
        );
      })}

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
