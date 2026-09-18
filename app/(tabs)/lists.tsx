import React, { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { Text } from '../../src/ui/type';
import { useRouter } from 'expo-router';

import { WeekHeader } from '../../src/ui/WeekHeader';
import {
  Body, Button, Chip, Empty, Field, Glyph, IconButton, Mono, Note, Screen, Section,
  SectionHead, Segmented, Sheet, Tick,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import {
  mergeTemplateInto, missingRegulars, mostBought, shopCounts, shopListFor, shopTemplateOf,
  shoppingList, templateOffer, uid,
} from '../../src/domain/week';
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

/** One line on the list. Two ticks: needed this week, and got it. */
function ShopRow({ item, onNeed, onRename, onDelete }: {
  item: ShopItem;
  onNeed: () => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}) {
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
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

      <Pressable onPress={onNeed} style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: item.need ? t.ink : t.ink3 }}>{item.text}</Text>
      </Pressable>

      {/* An actual button, rather than a long-press nobody would find. */}
      <Pressable
        onPress={() => setMenu(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Options for ${item.text}`}
        style={{ paddingHorizontal: 3 }}
      >
        <Glyph name="ellipsis" fallback="···" size={15} colour={t.ink3} />
      </Pressable>

      <Sheet open={menu} title={item.text} onClose={() => setMenu(false)}>
        <Button
          title="Rename"
          onPress={() => { setMenu(false); setDraft(item.text); setEditing(true); }}
        />
        <Button
          tone="ghost"
          title="Remove from the list"
          onPress={() => { setMenu(false); onDelete(); }}
        />
      </Sheet>
    </View>
  );
}

function Shopping() {
  const t = useTheme();
  const router = useRouter();
  const { state, weekId, update } = useStore();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Which heading has its composer open. Only ever one. */
  const [adding, setAdding] = useState<string | null>(null);
  /** Shopping mode: only what is needed, and only the got tick. */
  const [inShop, setInShop] = useState(false);
  const [insight, setInsight] = useState(false);
  const [importing, setImporting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
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
  const offer = templateOffer(groups, state.shopTemplate ?? []);

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
    // Still under the heading each thing was filed under — you know what you
    // are looking at. Just no counting by aisle; the only sums that matter in
    // a shop are what is needed and what is got.
    return (
      <Section>
        <SectionHead title="At the shop" right={`${got}/${need}`} />
        <Button title="← Back to the whole list" onPress={() => setInShop(false)} />
        {trolley.length === 0 ? (
          <Empty>Nothing marked as needed this week.</Empty>
        ) : null}
        {trolley.map((g) => (
          <View key={g.id}>
            <Text style={{ fontSize: 11.5, letterSpacing: 1.1, textTransform: 'uppercase',
              fontWeight: '700', color: t.ink3, paddingTop: 15, paddingBottom: 5 }}>
              {g.name}
            </Text>
            <View style={{ borderTopWidth: 1, borderTopColor: t.rule }}>
              {g.items.map((it) => (
                <Pressable
                  key={it.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: it.done }}
                  accessibilityLabel={`${it.text}, ${g.name}`}
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

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch' }}>
        <View style={{ flex: 1 }}>
          {/* The count in brackets, so the label never wraps to a second line. */}
          <Button
            title={need ? `Go shopping (${need})` : 'Go shopping'}
            onPress={() => setInShop(true)}
            disabled={need === 0}
          />
        </View>
        <IconButton label="What you actually buy" glyph="chart.bar"
          fallback="◍" onPress={() => setInsight(true)} />
        <IconButton label="Bring in from the standard list" glyph="tray.and.arrow.down"
          fallback="↓" onPress={() => { setPicked([]); setImporting(true); }} />
        <IconButton label="Edit the standard list" glyph="square.and.pencil"
          fallback="✎" onPress={() => router.push('/shop-template')} />
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

            {/* One tick here, and it is only ever this question. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              borderTopWidth: 1, borderTopColor: t.rule, paddingTop: 5, paddingBottom: 2 }}>
              <Mono style={{ width: 34, textAlign: 'center', fontSize: 8.5, letterSpacing: 0.6,
                textTransform: 'uppercase', color: t.accent }}>need</Mono>
              <Mono style={{ flex: 1, fontSize: 8.5, letterSpacing: 0.6,
                textTransform: 'uppercase' }}>this week</Mono>
            </View>

            <View>
              {g.items.map((it) => (
                <ShopRow
                  key={it.id}
                  item={it}
                  onNeed={() => setItem(g.id, it.id, { need: !it.need, done: false })}
                  onRename={(text) => setItem(g.id, it.id, { text })}
                  onDelete={() => update((d) => {
                    const gg = d.weeks[weekId].shop?.find((x) => x.id === g.id);
                    if (gg) gg.items = gg.items.filter((y) => y.id !== it.id);
                  })}
                />
              ))}
            </View>

            {adding === g.id ? (
              <View style={{ gap: 7, paddingTop: 7 }}>
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
                  {/* The same one button as a task's: it files what you wrote,
                      or closes if you wrote nothing. */}
                  {(drafts[g.id] ?? '').trim() ? (
                    <Button title="Add" onPress={() => addItem(g.id)} />
                  ) : (
                    <Button tone="ghost" title="Done"
                      onPress={() => { setAdding(null); Keyboard.dismiss(); }} />
                  )}
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

      <Sheet
        open={importing}
        title="Bring in from the standard list"
        onClose={() => setImporting(false)}
        footer={
          <>
            <View style={{ flex: 1 }}>
              <Button
                tone="ghost"
                title={picked.length === offer.length ? 'None' : 'All'}
                onPress={() => setPicked(picked.length === offer.length
                  ? [] : offer.map((o) => o.name))}
              />
            </View>
            <Button
              title={picked.length ? `Add ${picked.length}` : 'Add'}
              disabled={picked.length === 0}
              onPress={() => {
                update((d) => {
                  const list = d.weeks[weekId].shop;
                  if (list) mergeTemplateInto(list, shopTemplateOf(d), picked);
                }, 'bringing those in');
                setImporting(false);
              }}
            />
          </>
        }
      >
        <Note>
          Only the headings you choose, and only the things missing from them. Nothing
          already on your list is touched, and nothing is marked as needed.
        </Note>
        {offer.map((o) => {
          const on = picked.includes(o.name);
          const nothing = o.adds === 0;
          return (
            <Pressable
              key={o.name}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              disabled={nothing}
              onPress={() => setPicked((p) => (on
                ? p.filter((n) => n !== o.name) : [...p, o.name]))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 11,
                borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11,
                borderColor: on ? t.accent : t.rule,
                backgroundColor: on ? t.accentSoft : 'transparent',
                opacity: nothing ? 0.4 : 1 }}
            >
              <Tick on={on} tone="accent" />
              <Text style={{ flex: 1, fontSize: 14.5, color: t.ink,
                fontWeight: on ? '600' : '400' }}>{o.name}</Text>
              <Mono style={{ fontSize: 11 }}>
                {nothing ? 'all here' : `+${o.adds}${o.isNew ? ' · new' : ''}`}
              </Mono>
            </Pressable>
          );
        })}
      </Sheet>

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

function Entertainment() {
  const t = useTheme();
  const { state, update } = useStore();
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<WatchItem['kind']>('tv');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [rename, setRename] = useState('');

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
          accessibilityLabel={`Options for ${x.title}`}
          hitSlop={8}
          onPress={() => setMenuFor(x.id)}
          style={{ paddingHorizontal: 3 }}
        >
          <Glyph name="ellipsis" fallback="···" size={15} colour={t.ink3} />
        </Pressable>
      </View>
    );
  };

  const menuItem = state.watch.find((x) => x.id === menuFor);

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

      <Sheet
        open={Boolean(menuItem)}
        title={menuItem?.title ?? ''}
        onClose={() => setMenuFor(null)}
      >
        {renaming === menuFor ? (
          <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
            <Field
              value={rename}
              onChangeText={setRename}
              maxLength={80}
              autoFocus
              returnKeyType="done"
              accessibilityLabel="Title"
              onSubmitEditing={() => {
                const next = rename.trim().slice(0, 80);
                if (next) {
                  update((d) => {
                    const it = d.watch.find((y) => y.id === menuFor);
                    if (it) it.title = next;
                  }, 'renaming that');
                }
                setRenaming(null);
                setMenuFor(null);
              }}
            />
          </View>
        ) : (
          <>
            <Button
              title="Rename"
              onPress={() => { setRename(menuItem?.title ?? ''); setRenaming(menuFor); }}
            />
            <Button
              tone="ghost"
              title={menuItem?.done ? 'Put back on the list' : 'Mark complete'}
              onPress={() => {
                update((d) => {
                  const it = d.watch.find((y) => y.id === menuFor);
                  if (it) it.done = !it.done;
                }, 'that change');
                setMenuFor(null);
              }}
            />
            <Button
              tone="ghost"
              title="Remove from the list"
              onPress={() => {
                update((d) => { d.watch = d.watch.filter((y) => y.id !== menuFor); },
                  `removing ${menuItem?.title ?? 'that'}`);
                setMenuFor(null);
              }}
            />
          </>
        )}
      </Sheet>

      <View style={{ flexDirection: 'row', gap: 7, paddingTop: 7 }}>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a film or series…"
          returnKeyType="next"
          blurOnSubmit={false}
          maxLength={80}
          onSubmitEditing={() => { if (!draft.trim()) Keyboard.dismiss(); else add(); }}
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
