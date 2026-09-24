import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Keyboard, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Text } from '../../src/ui/type';

import {
  Body, Button, Chip, CornerMark, DateButton, Empty, Field, Glyph, Mono, Note, Screen, Section,
  SectionHead, Sheet, Tick, useBoxWidth,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { daysUntil, parseISO } from '../../src/domain/dates';
import { TRIP_CATEGORIES, TRIP_TEMPLATES } from '../../src/domain/catalogue';
import {
  addTripCat, buildTripItems, moveTripCat, placeTripItem, removeTripCat, renameTripCat,
  tripCats, tripMissing, tripOrdered, tripTopUp, uid,
} from '../../src/domain/week';
import { useListDrag } from '../../src/ui/useListDrag';
import { NOTE_LIMIT } from '../../src/domain/types';
import type { Trip, TripItem } from '../../src/domain/types';

/** As long as a line on a checklist can be. */
const ITEM_LIMIT = 120;

const unit = (n: number) => (n === 0 ? 'today' : n === 1 ? 'day' : 'days');
const fmt = (iso: string) =>
  parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });



export default function AheadScreen() {
  const t = useTheme();
  const router = useRouter();
  const { state, today, update } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newTrip, setNewTrip] = useState({ name: '', start: '', end: '', tplId: 'weekend' });
  const [addingTrip, setAddingTrip] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  /** The trip being changed, held as a draft so nothing moves under you while
   *  you are typing a name or picking a date. */
  const [editing, setEditing] = useState<
    { id: string; name: string; start: string; end: string; tplId: string } | null>(null);
  const [newEvent, setNewEvent] = useState({ name: '', date: '' });

  const trips = state.trips
    .filter((x) => daysUntil(x.end, today) >= 0)
    .sort((a, b) => a.start.localeCompare(b.start));
  const events = state.events
    .filter((x) => daysUntil(x.date, today) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const rail = [
    ...trips.map((x) => ({ key: x.id, date: x.start, end: x.end, label: x.name, trip: true })),
    ...events.map((x) => ({ key: x.id, date: x.date, end: x.date, label: x.name, trip: false })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

  return (
    <Screen>
      <Body>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: -10 }}>
          <CornerMark />
          <Mono style={{ letterSpacing: 1.6, textTransform: 'uppercase', fontSize: 11 }}>
            Coming up
          </Mono>
        </View>
        <Section>
          <SectionHead title="Coming up" right={`${trips.length + events.length} tracked`} />
          {rail.length === 0 ? <Empty>Nothing on the horizon.</Empty> : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
              {rail.map((x) => {
                const n = daysUntil(x.date, today);
                const here = x.trip && n <= 0 && daysUntil(x.end, today) >= 0;
                const total = daysUntil(x.end, today) - daysUntil(x.date, today) + 1;
                const soon = !here && n <= 7;
                return (
                  <View key={x.key} style={{ minWidth: 104, maxWidth: 170, borderWidth: 1,
                    borderRadius: radius.lg, padding: 11,
                    borderColor: here ? t.hit : soon ? t.accentLine : t.rule,
                    backgroundColor: here ? t.hitSoft : soon ? t.accentSoft : t.sheet }}>
                    <Text style={{ fontSize: 27, fontWeight: '700', letterSpacing: -1,
                      fontVariant: ['tabular-nums'],
                      color: here ? t.hit : soon ? t.accent : t.ink }}>
                      {here ? 1 - n : n}
                    </Text>
                    <Mono style={{ letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 9.5,
                      marginBottom: 5 }}>
                      {here ? `of ${total}` : unit(n)}
                    </Mono>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: t.ink }} numberOfLines={1}>
                      {x.label}
                    </Text>
                    <Mono style={{ fontSize: 10, marginTop: 1 }}>{fmt(x.date)}</Mono>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Section>

        <Section>
          <SectionHead title="Trips" right={`${trips.length} upcoming`} />
          <Button tone="ghost" title="Edit the standard checklist"
            onPress={() => router.push('/trip-template')} />
          {trips.length === 0 ? <Empty>No trips booked in.</Empty> : null}
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              today={today}
              expanded={open === trip.id}
              onToggle={() => setOpen(open === trip.id ? null : trip.id)}
              onEdit={() => setEditing({ id: trip.id, name: trip.name, start: trip.start,
                end: trip.end, tplId: trip.tplId })}
              draft={drafts}
              setDraft={setDrafts}
            />
          ))}

          <Button tone="ghost" title="+ Add a trip" onPress={() => setAddingTrip(true)} />

          <Sheet
            open={addingTrip}
            title="Add a trip"
            onClose={() => setAddingTrip(false)}
          >
            <Field value={newTrip.name} placeholder="Where to?" maxLength={40} autoFocus
              onChangeText={(v) => setNewTrip((p) => ({ ...p, name: v }))} />
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <DateButton
                title="Going out"
                placeholder="From…"
                value={newTrip.start}
                onChange={(v) => setNewTrip((p) => ({ ...p, start: v, end: p.end && p.end < v ? v : p.end }))}
              />
              <DateButton
                title="Coming back"
                placeholder="To…"
                value={newTrip.end}
                minimum={/^\d{4}-\d{2}-\d{2}$/.test(newTrip.start)
                  ? parseISO(newTrip.start) : undefined}
                onChange={(v) => setNewTrip((p) => ({ ...p, end: v }))}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
              {Object.entries(TRIP_TEMPLATES).map(([k, v]) => (
                <Pressable
                  key={k}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: newTrip.tplId === k }}
                  onPress={() => setNewTrip((p) => ({ ...p, tplId: k }))}
                  style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 11,
                    paddingVertical: 5,
                    borderColor: newTrip.tplId === k ? t.accent : t.rule,
                    backgroundColor: newTrip.tplId === k ? t.accentSoft : 'transparent' }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '600',
                    color: newTrip.tplId === k ? t.accent : t.ink2 }}>{v.name}</Text>
                </Pressable>
              ))}
            </View>
            <Button title="Add trip" onPress={() => {
              const { name, start, tplId } = newTrip;
              if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return;
              const end = /^\d{4}-\d{2}-\d{2}$/.test(newTrip.end) && newTrip.end >= start
                ? newTrip.end : start;
              const id = uid('tr');
              update((d) => {
                // Its own copy of the headings from the start, so changing
                // them here can never reach back into another trip.
                d.trips.push({ id, name: name.trim(), tplId, start, end,
                  cats: [...TRIP_CATEGORIES], items: buildTripItems(d, tplId) });
              });
              setOpen(id);
              setAddingTrip(false);
              setNewTrip({ name: '', start: '', end: '', tplId: 'weekend' });
            }} />
            <Note>
              The type picks the starting checklist. A race trip adds number collection, the course
              map and kit in hand luggage. Everything stays editable per trip.
            </Note>
          </Sheet>
        </Section>

        <Sheet
          open={editing !== null}
          title={editing?.name ? `Edit ${editing.name}` : 'Edit trip'}
          onClose={() => setEditing(null)}
          footer={editing ? (
            <>
              <View style={{ flex: 1 }}>
                <Button
                  tone="ghost"
                  title="Delete trip"
                  onPress={() => Alert.alert(
                    `Delete ${editing.name}?`,
                    'The trip and everything on its checklist goes. Undo puts it back.',
                    [{ text: 'Cancel', style: 'cancel' },
                     {
                       text: 'Delete',
                       style: 'destructive',
                       onPress: () => {
                         update((d) => {
                           d.trips = d.trips.filter((x) => x.id !== editing.id);
                         }, 'deleting that trip');
                         setEditing(null);
                       },
                     }],
                  )}
                />
              </View>
              <Button
                title="Save"
                onPress={() => {
                  const name = editing.name.trim();
                  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(editing.start)) return;
                  const end = /^\d{4}-\d{2}-\d{2}$/.test(editing.end)
                    && editing.end >= editing.start ? editing.end : editing.start;
                  update((d) => {
                    const trip = d.trips.find((x) => x.id === editing.id);
                    if (!trip) return;
                    trip.name = name;
                    trip.start = editing.start;
                    trip.end = end;
                    trip.tplId = editing.tplId;
                  }, 'changing that trip');
                  setEditing(null);
                }}
              />
            </>
          ) : null}
        >
          {editing ? (
            <>
              <Field
                value={editing.name}
                placeholder="Where to?"
                maxLength={40}
                onChangeText={(v) => setEditing((p) => (p ? { ...p, name: v } : p))}
              />
              <View style={{ flexDirection: 'row', gap: 7 }}>
                <DateButton
                  title="Going out"
                  placeholder="From…"
                  value={editing.start}
                  onChange={(v) => setEditing((p) => (p
                    ? { ...p, start: v, end: p.end && p.end < v ? v : p.end } : p))}
                />
                <DateButton
                  title="Coming back"
                  placeholder="To…"
                  value={editing.end}
                  minimum={/^\d{4}-\d{2}-\d{2}$/.test(editing.start)
                    ? parseISO(editing.start) : undefined}
                  onChange={(v) => setEditing((p) => (p ? { ...p, end: v } : p))}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap' }}>
                {Object.entries(TRIP_TEMPLATES).map(([k, v]) => (
                  <Pressable
                    key={k}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: editing.tplId === k }}
                    onPress={() => setEditing((p) => (p ? { ...p, tplId: k } : p))}
                    style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 11,
                      paddingVertical: 5,
                      borderColor: editing.tplId === k ? t.accent : t.rule,
                      backgroundColor: editing.tplId === k ? t.accentSoft : 'transparent' }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: '600',
                      color: editing.tplId === k ? t.accent : t.ink2 }}>{v.name}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Changing the kind does not rewrite a list you have been
                  working through. It offers what that kind would have added. */}
              {(() => {
                const missing = tripMissing(state, editing.id, editing.tplId);
                if (!missing) {
                  return <Note>Nothing missing from this kind of trip’s checklist.</Note>;
                }
                return (
                  <>
                    <Button
                      tone="ghost"
                      title={`+ Add the ${missing} missing from this kind`}
                      onPress={() => update((d) => { tripTopUp(d, editing.id, editing.tplId); },
                        'topping up that trip')}
                    />
                    <Note>
                      Only what is not already on the list. Nothing you have ticked or written
                      is touched.
                    </Note>
                  </>
                );
              })()}
            </>
          ) : null}
        </Sheet>

        <Section>
          <SectionHead title="Countdowns" right={String(events.length)} />
          {events.length === 0 ? <Empty>Nothing counting down.</Empty> : null}
          {events.map((e) => {
            const n = daysUntil(e.date, today);
            return (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11,
                paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14.5, color: t.ink }}>{e.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Mono style={{ fontSize: 10.5 }}>{fmt(e.date)}</Mono>
                    <Chip text={e.source === 'calendar' ? 'Calendar' : 'Added'} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'],
                    color: n <= 14 ? t.accent : t.ink }}>{n}</Text>
                  <Mono style={{ fontSize: 8.5, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                    {unit(n)}
                  </Mono>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${e.name}`}
                  hitSlop={6}
                  onPress={() => update((d) => { d.events = d.events.filter((x) => x.id !== e.id); })}>
                  <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>
            );
          })}

          <Button tone="ghost" title="+ Add a countdown" onPress={() => setAddingEvent(true)} />

          <Sheet open={addingEvent} title="Add a countdown" onClose={() => setAddingEvent(false)}>
            <Field value={newEvent.name} placeholder="What is it?" maxLength={40} autoFocus
              onChangeText={(v) => setNewEvent((p) => ({ ...p, name: v }))} />
            <DateButton
              title="When is it?"
              placeholder="Pick a date…"
              value={newEvent.date}
              onChange={(v) => setNewEvent((p) => ({ ...p, date: v }))}
            />
            <Button title="Add countdown" onPress={() => {
              if (!newEvent.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(newEvent.date)) return;
              update((d) => {
                d.events.push({ id: uid('e'), name: newEvent.name.trim(), date: newEvent.date,
                  source: 'added' });
              });
              setAddingEvent(false);
              setNewEvent({ name: '', date: '' });
            }} />
          </Sheet>
          <Note>
            All-day entries in your calendar become countdowns automatically and never become tasks.
            Timed events stay where they are, on the day.
          </Note>
        </Section>
      </Body>
    </Screen>
  );
}

function TripCard({ trip, today, expanded, onToggle, onEdit, draft, setDraft }: {
  trip: Trip; today: Date; expanded: boolean; onToggle: () => void; onEdit: () => void;
  draft: Record<string, string>; setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const t = useTheme();
  const box = useBoxWidth();
  const { update } = useStore();
  const [openItem, setOpenItem] = useState<string | null>(null);
  /** Which heading has its composer open. Only ever one. */
  const [adding, setAdding] = useState<string | null>(null);
  const [heading, setHeading] = useState(false);
  const [newCat, setNewCat] = useState('');

  const cats = tripCats(trip);
  const drawn = tripOrdered(trip);
  const onDrop = useCallback((id: string, at: number, cat: string) => {
    update((d) => {
      const tr = d.trips.find((x) => x.id === trip.id);
      if (tr) placeTripItem(tr, id, at, cat);
    }, 'moving that');
  }, [update, trip.id]);
  // The same geometry the day's tasks use, because it is the same gesture.
  const drag = useListDrag({
    order: drawn.map((x) => ({ id: x.id, sec: x.cat })),
    sections: cats,
    onDrop,
  });

  const addCat = () => {
    const name = newCat.trim();
    if (!name) { setHeading(false); Keyboard.dismiss(); return; }
    update((d) => {
      const tr = d.trips.find((x) => x.id === trip.id);
      if (tr) addTripCat(tr, name);
    }, 'adding that heading');
    setNewCat('');
    setHeading(false);
  };

  const a = daysUntil(trip.start, today);
  const b = daysUntil(trip.end, today);
  const here = a <= 0 && b >= 0;
  const total = b - a + 1;
  const done = trip.items.filter((x) => x.done).length;
  const left = trip.items.length - done;
  const urgent = !here && a <= 7 && left > 0;

  return (
    <View style={{ borderWidth: 1, borderRadius: radius.lg, padding: 13, gap: 10,
      borderColor: here ? t.hit : a <= 14 ? t.accentLine : t.rule }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 11 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 16.5, fontWeight: '700', color: t.ink }}>{trip.name}</Text>
            <Chip text={TRIP_TEMPLATES[trip.tplId]?.name ?? 'Trip'} />
          </View>
          <Mono style={{ fontSize: 11, marginTop: 2, color: t.ink2 }}>
            {`${fmt(trip.start)} – ${fmt(trip.end)}`}
          </Mono>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${trip.name}`}
          hitSlop={8}
          onPress={onEdit}
          style={{ paddingHorizontal: 2, alignSelf: 'flex-start' }}
        >
          <Glyph name="ellipsis" fallback="···" size={15} colour={t.ink3} />
        </Pressable>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 26, fontWeight: '700', letterSpacing: -1,
            fontVariant: ['tabular-nums'], color: here ? t.hit : a <= 14 ? t.accent : t.ink }}>
            {here ? 1 - a : a}
          </Text>
          <Mono style={{ fontSize: 9, letterSpacing: 1.3, textTransform: 'uppercase' }}>
            {here ? `of ${total}` : unit(a)}
          </Mono>
        </View>
      </View>

      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.sunk, overflow: 'hidden' }}>
        <View style={{ height: '100%', borderRadius: 3, backgroundColor: t.hit,
          width: `${trip.items.length ? (done / trip.items.length) * 100 : 0}%` }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Mono style={{ fontSize: 10.5 }}>{`${done} of ${trip.items.length} done`}</Mono>
        <Mono style={{ fontSize: 10.5, color: urgent ? t.miss : t.ink3,
          fontWeight: urgent ? '700' : '400' }}>
          {urgent ? `${left} left, ${a === 0 ? 'you leave today' : `${a} ${unit(a)} to go`}`
            : `${trip.items.length ? Math.round((done / trip.items.length) * 100) : 0}%`}
        </Mono>
      </View>

      <Pressable accessibilityRole="button" onPress={onToggle}>
        <Text style={{ fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase',
          color: t.accent, fontWeight: '600' }}>
          {expanded ? '▾ Checklist' : '▸ Checklist'}
        </Text>
      </Pressable>

      {expanded ? (
        <View>
          {cats.map((cat, ci) => {
            const items = drawn.filter((x) => x.cat === cat);
            const key = `${trip.id}|${cat}`;
            const line = drag.lineIn(cat);
            const add = () => {
              const text = (draft[key] ?? '').trim().slice(0, ITEM_LIMIT);
              // Nothing typed and you pressed next: that means you are finished.
              if (!text) { setAdding(null); Keyboard.dismiss(); return; }
              update((d) => {
                d.trips.find((x) => x.id === trip.id)?.items
                  .push({ id: uid('c'), cat, text, done: false });
              }, 'adding that to the list');
              setDraft((p) => ({ ...p, [key]: '' }));
            };
            return (
              <View
                key={cat}
                style={{ paddingTop: 9 }}
                onLayout={(e) => drag.measureSection(cat, e.nativeEvent.layout.y)}
              >
                <TripHeading
                  trip={trip}
                  cat={cat}
                  first={ci === 0}
                  last={ci === cats.length - 1}
                  done={items.filter((x) => x.done).length}
                  total={items.length}
                />

                <View onLayout={(e) => drag.measureList(cat, e.nativeEvent.layout.y)}>
                  {items.map((it) => (
                    <TripRow
                      key={it.id}
                      trip={trip}
                      item={it}
                      open={openItem === it.id}
                      onOpen={() => setOpenItem(openItem === it.id ? null : it.id)}
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

                {adding === cat ? (
                  <View style={{ gap: 7, paddingTop: 7 }}>
                    <Field
                      value={draft[key] ?? ''}
                      placeholder={`Add to ${cat.toLowerCase()}…`}
                      onChangeText={(v) => setDraft((p) => ({ ...p, [key]: v }))}
                      onSubmitEditing={add}
                      returnKeyType="next"
                      // Return files it and leaves the field up for the next
                      // one; Return on an empty field means you are finished.
                      blurOnSubmit={false}
                      autoFocus
                      maxLength={ITEM_LIMIT}
                    />
                    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                      <Mono style={{ flex: 1, fontSize: 10.5 }}>
                        Return adds it and keeps going
                      </Mono>
                      <View style={{ width: box }}>
                        {(draft[key] ?? '').trim() ? (
                          <Button title="Add" onPress={add} />
                        ) : (
                          <Button tone="ghost" title="Done"
                            onPress={() => { setAdding(null); Keyboard.dismiss(); }} />
                        )}
                      </View>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add to ${cat}`}
                    onPress={() => setAdding(cat)}
                    hitSlop={8}
                    style={{ paddingTop: 7, paddingBottom: 2 }}
                  >
                    <Text style={{ fontSize: 15, color: t.ink3, lineHeight: 18 }}>+</Text>
                  </Pressable>
                )}
              </View>
            );
          })}

          {/* A heading is a rarer thing to want than an item, so it asks for
              the room only once you have said you want one. */}
          {heading ? (
            <View style={{ gap: 7, paddingTop: 12 }}>
              <Field
                value={newCat}
                onChangeText={setNewCat}
                placeholder="What to call it…"
                maxLength={28}
                returnKeyType="done"
                onSubmitEditing={addCat}
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                <View style={{ flex: 1 }} />
                <View style={{ width: box }}>
                  {newCat.trim() ? (
                    <Button title="Add" onPress={addCat} />
                  ) : (
                    <Button tone="ghost" title="Done"
                      onPress={() => { setHeading(false); Keyboard.dismiss(); }} />
                  )}
                </View>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a heading"
              onPress={() => setHeading(true)}
              hitSlop={8}
              style={{ paddingTop: 12, alignSelf: 'flex-start' }}
            >
              <Mono style={{ fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase',
                color: t.ink3 }}>+ Heading</Mono>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** One heading on a trip's checklist: what it is called, what is left under
 *  it, and the two things you can do to it that a day's headings cannot have
 *  done to them — because a day's headings belong to the week's shape, and
 *  these belong to this trip alone. */
function TripHeading({ trip, cat, first, last, done, total }: {
  trip: Trip; cat: string; first: boolean; last: boolean; done: number; total: number;
}) {
  const t = useTheme();
  const { update } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat);

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === cat) return;
    update((d) => {
      const tr = d.trips.find((x) => x.id === trip.id);
      if (tr) renameTripCat(tr, cat, next);
    }, 'renaming that heading');
  };

  const step = (dir: -1 | 1) => update((d) => {
    const tr = d.trips.find((x) => x.id === trip.id);
    if (tr) moveTripCat(tr, cat, dir);
  }, 'moving that heading');

  const arrow = (dir: -1 | 1, off: boolean) => (
    <Pressable
      onPress={() => !off && step(dir)}
      disabled={off}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Move ${cat} ${dir === -1 ? 'up' : 'down'}`}
      style={{ paddingHorizontal: 3, opacity: off ? 0.25 : 1 }}
    >
      <Text style={{ fontSize: 11, color: t.ink2, lineHeight: 13 }}>{dir === -1 ? '↑' : '↓'}</Text>
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
      borderBottomWidth: 1, borderBottomColor: t.rule, paddingBottom: 4 }}>
      {editing ? (
        <Field
          value={draft}
          onChangeText={setDraft}
          onBlur={commit}
          onSubmitEditing={commit}
          autoFocus
          maxLength={28}
          accessibilityLabel={`Rename ${cat}`}
          style={{ paddingVertical: 2, fontSize: 12.5, letterSpacing: 1.1,
            textTransform: 'uppercase', fontWeight: '700' }}
        />
      ) : (
        <Pressable
          onPress={() => { setDraft(cat); setEditing(true); }}
          accessibilityRole="button"
          accessibilityLabel={`Rename ${cat}`}
          style={{ flex: 1 }}
        >
          <Mono style={{ fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase',
            color: t.ink2, fontWeight: '700' }}>{cat}</Mono>
        </Pressable>
      )}
      {editing ? null : (
        <>
          <Mono style={{ fontSize: 10 }}>{`${done}/${total}`}</Mono>
          {arrow(-1, first)}
          {arrow(1, last)}
          <Pressable
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Remove the heading ${cat}`}
            onPress={() => Alert.alert(
              `Remove ${cat}?`,
              total
                ? `The ${total} thing${total === 1 ? '' : 's'} under it move to the heading above.`
                : 'The heading goes; there is nothing under it.',
              [{ text: 'Cancel', style: 'cancel' },
               {
                 text: 'Remove',
                 style: 'destructive',
                 onPress: () => update((d) => {
                   const tr = d.trips.find((x) => x.id === trip.id);
                   if (tr) removeTripCat(tr, cat);
                 }, 'removing that heading'),
               }],
            )}
          >
            <Text style={{ color: t.ink3, fontSize: 13 }}>✕</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/** One thing to do before you go. A task in everything but name, so it behaves
 *  like one: held and dragged by the grip, renamed by its name, and opened for
 *  a note or to be got rid of. */
function TripRow({ trip, item, open, onOpen, onMeasure, onDragMove, onDragEnd, dragging }: {
  trip: Trip; item: TripItem; open: boolean; onOpen: () => void;
  onMeasure: (y: number, h: number) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  dragging: boolean;
}) {
  const t = useTheme();
  const { update } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const [note, setNote] = useState(item.note ?? '');
  const lift = useSharedValue(0);
  const told = useSharedValue(0);

  const onItem = (fn: (x: TripItem) => void, label: string) => update((d) => {
    const x = d.trips.find((y) => y.id === trip.id)?.items.find((y) => y.id === item.id);
    if (x) fn(x);
  }, label);

  const commit = () => {
    const next = draft.trim().slice(0, 120);
    setEditing(false);
    if (next && next !== item.text) onItem((x) => { x.text = next; }, 'renaming that');
  };

  const saveNote = () => {
    const next = note.trim().slice(0, NOTE_LIMIT);
    if (next === (item.note ?? '')) return;
    onItem((x) => { if (next) x.note = next; else delete x.note; },
      next ? 'writing that note' : 'clearing that note');
  };
  const save = useRef(saveNote);
  save.current = saveNote;
  useEffect(() => { if (!open) save.current(); }, [open]);
  useEffect(() => { setNote(item.note ?? ''); }, [item.note]);

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
      style={[{ borderBottomWidth: 1, borderBottomColor: t.rule2, paddingVertical: 6,
        zIndex: dragging ? 10 : 0,
        backgroundColor: dragging ? t.sheet2 : 'transparent',
        borderRadius: dragging ? radius.md : 0 }, lifted]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
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
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.done }}
          accessibilityLabel={item.text}
          hitSlop={6}
          onPress={() => onItem((x) => { x.done = !x.done; },
            item.done ? 'unticking that' : 'ticking that off')}
        >
          <Tick on={item.done} />
        </Pressable>
        {editing ? (
          <Field
            value={draft}
            onChangeText={setDraft}
            onBlur={commit}
            onSubmitEditing={commit}
            returnKeyType="done"
            autoFocus
            maxLength={120}
            accessibilityLabel="What it is"
          />
        ) : (
          <Pressable
            onPress={() => { setDraft(item.text); setEditing(true); }}
            accessibilityRole="button"
            accessibilityLabel={`Rename ${item.text}`}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text style={{ flexShrink: 1, fontSize: 13.5, color: item.done ? t.ink3 : t.ink,
              textDecorationLine: item.done ? 'line-through' : 'none' }}>{item.text}</Text>
            {item.note ? (
              <View
                accessibilityLabel="Has a note"
                style={{ width: 5, height: 5, borderRadius: 3,
                  backgroundColor: item.done ? t.ink3 : t.accent }}
              />
            ) : null}
          </Pressable>
        )}
        {editing ? null : (
          <Pressable onPress={onOpen} hitSlop={8} accessibilityRole="button"
            accessibilityLabel={open ? `Close options for ${item.text}` : `Options for ${item.text}`}
            style={{ paddingHorizontal: 2 }}>
            <Glyph name={open ? 'chevron.up' : 'ellipsis'} fallback={open ? '⌃' : '···'}
              size={15} colour={open ? t.accent : t.ink3} />
          </Pressable>
        )}
      </View>

      {open ? (
        <View style={{ gap: 7, paddingTop: 9 }}>
          <Mono style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}>Notes</Mono>
          <Field
            value={note}
            onChangeText={setNote}
            onBlur={saveNote}
            placeholder="Anything that does not fit in the name…"
            multiline
            maxLength={NOTE_LIMIT}
            accessibilityLabel={`Notes for ${item.text}`}
            style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 10, lineHeight: 19 }}
          />
          <Button
            tone="ghost"
            title="Delete"
            onPress={() => Alert.alert(
              'Delete this?',
              `"${item.text}" comes off the checklist. Undo puts it back.`,
              [{ text: 'Cancel', style: 'cancel' },
               {
                 text: 'Delete',
                 style: 'destructive',
                 onPress: () => update((d) => {
                   const tr = d.trips.find((y) => y.id === trip.id);
                   if (tr) tr.items = tr.items.filter((y) => y.id !== item.id);
                 }, 'deleting that'),
               }],
            )}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}
