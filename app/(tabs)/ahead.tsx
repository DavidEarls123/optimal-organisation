import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import {
  Body, Button, Chip, CornerMark, Empty, Field, Mono, Note, Screen, Section, SectionHead, Tick,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { daysUntil, parseISO } from '../../src/domain/dates';
import { TRIP_BASE, TRIP_CATEGORIES, TRIP_TEMPLATES } from '../../src/domain/catalogue';
import { uid } from '../../src/domain/week';
import type { Trip, TripItem } from '../../src/domain/types';

const unit = (n: number) => (n === 0 ? 'today' : n === 1 ? 'day' : 'days');
const fmt = (iso: string) =>
  parseISO(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function buildItems(tplId: string): TripItem[] {
  const tpl = TRIP_TEMPLATES[tplId] ?? TRIP_TEMPLATES.weekend;
  const out: TripItem[] = [];
  for (const cat of TRIP_CATEGORIES) {
    for (const text of [...(TRIP_BASE[cat] ?? []), ...(tpl.extra[cat] ?? [])]) {
      out.push({ id: uid('c'), cat, text, done: false });
    }
  }
  return out;
}

export default function AheadScreen() {
  const t = useTheme();
  const { state, today, update } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newTrip, setNewTrip] = useState({ name: '', start: '', end: '', tplId: 'weekend' });
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
            Ahead
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
          {trips.length === 0 ? <Empty>No trips booked in.</Empty> : null}
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              today={today}
              expanded={open === trip.id}
              onToggle={() => setOpen(open === trip.id ? null : trip.id)}
              draft={drafts}
              setDraft={setDrafts}
            />
          ))}

          <View style={{ gap: 7, paddingTop: 10 }}>
            <Mono style={{ letterSpacing: 1.2, textTransform: 'uppercase', color: t.accent }}>
              Add a trip
            </Mono>
            <Field value={newTrip.name} placeholder="Where to?"
              onChangeText={(v) => setNewTrip((p) => ({ ...p, name: v }))} />
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <Field value={newTrip.start} placeholder="From  YYYY-MM-DD"
                onChangeText={(v) => setNewTrip((p) => ({ ...p, start: v }))} />
              <Field value={newTrip.end} placeholder="To  YYYY-MM-DD"
                onChangeText={(v) => setNewTrip((p) => ({ ...p, end: v }))} />
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
                d.trips.push({ id, name: name.trim(), tplId, start, end, items: buildItems(tplId) });
              });
              setOpen(id);
              setNewTrip({ name: '', start: '', end: '', tplId: 'weekend' });
            }} />
            <Note>
              The type picks the starting checklist. A race trip adds number collection, the course
              map and kit in hand luggage. Everything stays editable per trip.
            </Note>
          </View>
        </Section>

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

          <View style={{ flexDirection: 'row', gap: 7, paddingTop: 7 }}>
            <Field value={newEvent.name} placeholder="What is it?"
              onChangeText={(v) => setNewEvent((p) => ({ ...p, name: v }))} />
            <Field value={newEvent.date} placeholder="YYYY-MM-DD"
              onChangeText={(v) => setNewEvent((p) => ({ ...p, date: v }))} />
            <Button title="Add" onPress={() => {
              if (!newEvent.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(newEvent.date)) return;
              update((d) => {
                d.events.push({ id: uid('e'), name: newEvent.name.trim(), date: newEvent.date,
                  source: 'added' });
              });
              setNewEvent({ name: '', date: '' });
            }} />
          </View>
          <Note>
            All-day entries in your calendar become countdowns automatically and never become tasks.
            Timed events stay where they are, on the day.
          </Note>
        </Section>
      </Body>
    </Screen>
  );
}

function TripCard({ trip, today, expanded, onToggle, draft, setDraft }: {
  trip: Trip; today: Date; expanded: boolean; onToggle: () => void;
  draft: Record<string, string>; setDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const t = useTheme();
  const { update } = useStore();
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

      {expanded ? TRIP_CATEGORIES.map((cat) => {
        const items = trip.items.filter((x) => x.cat === cat);
        const key = `${trip.id}|${cat}`;
        const add = () => {
          const text = (draft[key] ?? '').trim();
          if (!text) return;
          update((d) => {
            d.trips.find((x) => x.id === trip.id)?.items.push({ id: uid('c'), cat, text, done: false });
          });
          setDraft((p) => ({ ...p, [key]: '' }));
        };
        return (
          <View key={cat} style={{ paddingTop: 9 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between',
              borderBottomWidth: 1, borderBottomColor: t.rule, paddingBottom: 4 }}>
              <Mono style={{ fontSize: 10, letterSpacing: 1.3, textTransform: 'uppercase',
                color: t.ink2, fontWeight: '700' }}>{cat}</Mono>
              <Mono style={{ fontSize: 10 }}>
                {`${items.filter((x) => x.done).length}/${items.length}`}
              </Mono>
            </View>
            {items.map((it) => (
              <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9,
                paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: it.done }}
                  accessibilityLabel={it.text}
                  hitSlop={6}
                  onPress={() => update((d) => {
                    const x = d.trips.find((y) => y.id === trip.id)?.items.find((y) => y.id === it.id);
                    if (x) x.done = !x.done;
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
                    const tr = d.trips.find((y) => y.id === trip.id);
                    if (tr) tr.items = tr.items.filter((y) => y.id !== it.id);
                  })}
                >
                  <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 7, paddingTop: 7 }}>
              <Field value={draft[key] ?? ''} placeholder={`Add to ${cat.toLowerCase()}…`}
                onChangeText={(v) => setDraft((p) => ({ ...p, [key]: v }))}
                returnKeyType="done" onSubmitEditing={add} />
              <Button title="Add" onPress={add} />
            </View>
          </View>
        );
      }) : null}
    </View>
  );
}
