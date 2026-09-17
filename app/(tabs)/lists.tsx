import React, { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { WeekHeader } from '../../src/ui/WeekHeader';
import {
  Body, Button, Chip, Empty, Field, Mono, Note, Screen, Section, SectionHead, Segmented, Sheet,
  Tick,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import {
  missingRegulars, mostBought, shopCounts, shopListFor, shoppingList, uid,
} from '../../src/domain/week';
import { watchCount } from '../../src/domain/scoring';
import { weekNumber } from '../../src/domain/dates';
import type { ShopItem, WatchItem } from '../../src/domain/types';

export default function ListsScreen() {
  const [view, setView] = useState<'shop' | 'fun'>('shop');
  // Held here, because the scroller that has to move is this screen's.
  const scroller = useRef<ScrollView>(null);
  return (
    <Screen>
      <WeekHeader compact />
      <Body scrollRef={scroller}>
        <Segmented
          value={view}
          onChange={setView}
          options={[{ key: 'shop', label: 'Shopping' }, { key: 'fun', label: 'Entertainment' }]}
        />
        {view === 'shop' ? <Shopping scroller={scroller} /> : <Entertainment scroller={scroller} />}
      </Body>
    </Screen>
  );
}

/** One line on the list. Two ticks: needed this week, and got it. */
function ShopRow({ item, onNeed, onGot, onRename, onDelete }: {
  item: ShopItem;
  onNeed: () => void;
  onGot: () => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);

  const commit = () => {
    const next = draft.trim().slice(0, 60);
    if (next && next !== item.text) onRename(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9,
        paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
        <Field
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={commit}
          onBlur={commit}
          maxLength={60}
          returnKeyType="done"
          autoFocus
          accessibilityLabel="Item name"
        />
        <Pressable onPress={commit} hitSlop={8} accessibilityRole="button"
          accessibilityLabel="Save the name">
          <Text style={{ color: t.hit, fontSize: 17, fontWeight: '800' }}>✓</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.need }}
        accessibilityLabel={`Need ${item.text} this week`}
        hitSlop={6}
        onPress={onNeed}
        style={{ width: 34, alignItems: 'center' }}
      >
        <Tick on={item.need} tone="accent" />
      </Pressable>

      <Pressable
        onPress={onNeed}
        onLongPress={() => { setDraft(item.text); setEditing(true); }}
        delayLongPress={300}
        style={{ flex: 1 }}
      >
        <Text style={{ fontSize: 14, color: item.need ? t.ink : t.ink3 }}>{item.text}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.done }}
        accessibilityLabel={`Got ${item.text}`}
        hitSlop={6}
        disabled={!item.need}
        onPress={onGot}
        style={{ width: 34, alignItems: 'center', opacity: item.need ? 1 : 0.2 }}
      >
        <Tick on={item.done} tone="hit" />
      </Pressable>

      <Pressable onPress={onDelete} hitSlop={6} accessibilityRole="button"
        accessibilityLabel={`Remove ${item.text}`}>
        <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
      </Pressable>
    </View>
  );
}

function Shopping({ scroller }: { scroller: React.RefObject<ScrollView | null> }) {
  const t = useTheme();
  const router = useRouter();
  const { state, weekId, update } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Which heading has its composer open. Only ever one. */
  const [adding, setAdding] = useState<string | null>(null);
  /** Shopping mode: only what is needed, and only the got tick. */
  const [inShop, setInShop] = useState(false);
  const [insight, setInsight] = useState(false);
  const composerY = useRef(0);
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
  const bought = mostBought(state);
  const missing = missingRegulars(state, weekId);

  const lift = () => {
    const y = composerY.current;
    if (!y) return;
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ y: Math.max(0, y - 150), animated: true });
    });
  };

  const setItem = (groupId: string, itemId: string, patch: Partial<ShopItem>) => update((d) => {
    const item = d.weeks[weekId].shop?.find((x) => x.id === groupId)
      ?.items.find((y) => y.id === itemId);
    if (item) Object.assign(item, patch);
  });

  const addItem = (groupId: string) => {
    const text = (drafts[groupId] ?? '').trim().slice(0, 60);
    // Nothing typed and you pressed next: that means you are finished.
    if (!text) { setAdding(null); Keyboard.dismiss(); return; }
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
        <SectionHead
          title="At the shop"
          right={`${got}/${need} · ${trolley.length} ${trolley.length === 1 ? 'aisle' : 'aisles'}`}
        />
        <Button title="← Back to the whole list" onPress={() => setInShop(false)} />
        {trolley.length === 0 ? (
          <Empty>Nothing marked as needed this week.</Empty>
        ) : null}
        {trolley.map((g) => {
          const gGot = g.items.filter((i) => i.done).length;
          return (
            <View key={g.id}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8,
                paddingTop: 15, paddingBottom: 5 }}>
                <Text style={{ flex: 1, fontSize: 13, letterSpacing: 1.1, textTransform: 'uppercase',
                  fontWeight: '700', color: gGot === g.items.length ? t.hit : t.ink }}>
                  {g.name}
                </Text>
                <Mono style={{ fontSize: 11, color: gGot === g.items.length ? t.hit : t.ink3 }}>
                  {`${gGot}/${g.items.length}`}
                </Mono>
              </View>
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
                    <Tick on={it.done} size={22} tone="hit" />
                    <Text style={{ flex: 1, fontSize: 16, color: it.done ? t.ink3 : t.ink,
                      textDecorationLine: it.done ? 'line-through' : 'none' }}>{it.text}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })}
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

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title={need
              ? `Go shopping · ${need} in ${trolley.length} ${trolley.length === 1 ? 'aisle' : 'aisles'}`
              : 'Go shopping'}
            onPress={() => setInShop(true)}
            disabled={need === 0}
          />
        </View>
        <Button tone="ghost" title="Insights" onPress={() => setInsight(true)} />
        <Button tone="ghost" title="Standard" onPress={() => router.push('/shop-template')} />
      </View>

      {missing.length ? (
        <Note>
          {`You usually buy ${missing.slice(0, 3).join(', ')} — not on this week's list.`}
        </Note>
      ) : null}

      {groups.length === 0 ? <Empty>Nothing on the list yet.</Empty> : null}

      {groups.map((g) => {
        const gNeed = g.items.filter((i) => i.need).length;
        return (
          <View key={g.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingTop: 15, paddingBottom: 3 }}>
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

            {/* Which tick is which, said once per heading. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              borderTopWidth: 1, borderTopColor: t.rule, paddingTop: 5, paddingBottom: 2 }}>
              <Mono style={{ width: 34, textAlign: 'center', fontSize: 8.5, letterSpacing: 0.6,
                textTransform: 'uppercase', color: t.accent }}>need</Mono>
              <View style={{ flex: 1 }} />
              <Mono style={{ width: 34, textAlign: 'center', fontSize: 8.5, letterSpacing: 0.6,
                textTransform: 'uppercase', color: t.hit }}>got</Mono>
              <View style={{ width: 15 }} />
            </View>

            <View>
              {g.items.map((it) => (
                <ShopRow
                  key={it.id}
                  item={it}
                  onNeed={() => setItem(g.id, it.id, { need: !it.need, done: false })}
                  onGot={() => setItem(g.id, it.id, { done: !it.done })}
                  onRename={(text) => setItem(g.id, it.id, { text })}
                  onDelete={() => update((d) => {
                    const gg = d.weeks[weekId].shop?.find((x) => x.id === g.id);
                    if (gg) gg.items = gg.items.filter((y) => y.id !== it.id);
                  })}
                />
              ))}
            </View>

            {adding === g.id ? (
              <View
                onLayout={(e) => { composerY.current = e.nativeEvent.layout.y; lift(); }}
                style={{ gap: 7, paddingTop: 7 }}
              >
                <Field
                  value={drafts[g.id] ?? ''}
                  onChangeText={(v) => setDrafts((p) => ({ ...p, [g.id]: v }))}
                  placeholder={`Add to ${g.name.toLowerCase()}…`}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  maxLength={60}
                  autoFocus
                  onSubmitEditing={() => addItem(g.id)}
                />
                <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                  <Mono style={{ flex: 1, fontSize: 10.5 }}>Return adds it and keeps going</Mono>
                  <Button tone="ghost" title="Done"
                    onPress={() => { setAdding(null); Keyboard.dismiss(); }} />
                  <Button title="Add" onPress={() => addItem(g.id)} />
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

      <Sheet open={insight} title="What you actually buy" onClose={() => setInsight(false)}>
        {bought.length === 0 ? (
          <Note>Nothing bought yet. This fills in as you tick things off in the shop.</Note>
        ) : (
          <>
            <Note>Counted from every week you have shopped, most bought first.</Note>
            {bought.map((row, i) => (
              <View key={row.text} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
                paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                <Mono style={{ width: 20, fontSize: 11 }}>{String(i + 1)}</Mono>
                <Text style={{ flex: 1, fontSize: 14, color: t.ink }}>{row.text}</Text>
                <View style={{ width: 80, height: 5, borderRadius: 3, backgroundColor: t.rule2,
                  flexDirection: 'row', overflow: 'hidden' }}>
                  <View style={{ flex: row.n / bought[0].n, backgroundColor: t.accent }} />
                  <View style={{ flex: 1 - row.n / bought[0].n }} />
                </View>
                <Mono style={{ width: 26, textAlign: 'right', fontSize: 11.5,
                  color: t.ink2 }}>{String(row.n)}</Mono>
              </View>
            ))}
          </>
        )}
      </Sheet>
    </Section>
  );
}

function Entertainment({ scroller }: { scroller: React.RefObject<ScrollView | null> }) {
  const t = useTheme();
  const rowY = useRef(0);
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

      <View
        onLayout={(e) => { rowY.current = e.nativeEvent.layout.y; }}
        style={{ flexDirection: 'row', gap: 7, paddingTop: 7 }}
      >
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a film or series…"
          returnKeyType="next"
          blurOnSubmit={false}
          maxLength={80}
          onSubmitEditing={() => { if (!draft.trim()) Keyboard.dismiss(); else add(); }}
          onFocus={() => requestAnimationFrame(() => {
            scroller.current?.scrollTo({ y: Math.max(0, rowY.current - 150), animated: true });
          })}
        />
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
