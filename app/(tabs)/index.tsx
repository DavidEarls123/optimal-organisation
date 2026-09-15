import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';

import { WeekHeader } from '../../src/ui/WeekHeader';
import {
  Bar, Body, Button, Chip, Empty, Field, Mono, Note, Screen, Section, SectionHead, Tick,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { DAY_LETTERS, DAY_NAMES, dayDateIso, isoOf, parseISO } from '../../src/domain/dates';
import { moveTask, uid } from '../../src/domain/week';
import {
  activeHabits, dayOutstanding, habitDayStatus, habitDone, habitTarget, planLabel,
} from '../../src/domain/scoring';
import type { CalendarEvent, Habit, Task, Week } from '../../src/domain/types';
import { askForCalendar, calendarAccess, calendarError, eventsForDay, type CalendarAccess }
  from '../../src/services/calendar';

export default function DayScreen() {
  const t = useTheme();
  const router = useRouter();
  const { state, weekId, day, today, update, setWeekId, setDay } = useStore();
  const week = state.weeks[weekId];
  const [moveId, setMoveId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [access, setAccess] = useState<CalendarAccess | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tagFor, setTagFor] = useState<Record<string, string>>({});

  const dateIso = week ? dayDateIso(week.monday, day) : '';

  useEffect(() => {
    let alive = true;
    if (!dateIso) return;
    calendarAccess().then((a) => {
      if (!alive) return;
      setAccess(a);
      if (a === 'granted') eventsForDay(dateIso).then((e) => { if (alive) setEvents(e); });
      else setEvents([]);
    });
    return () => { alive = false; };
  }, [dateIso]);

  const connectCalendar = useCallback(async () => {
    const a = access === 'blocked' ? 'blocked' : await askForCalendar();
    setAccess(a);
    if (a === 'granted') { setEvents(await eventsForDay(dateIso)); return; }
    if (a === 'blocked') {
      Alert.alert(
        'Turn it on in Settings',
        'iOS will not ask again from inside the app. Settings → Optimal Week → Calendars, '
        + 'and choose Full Access.',
        [{ text: 'Not now', style: 'cancel' },
         { text: 'Open Settings', onPress: () => { Linking.openSettings(); } }],
      );
    }
  }, [access, dateIso]);

  useEffect(() => { setMoveId(null); setShowPicker(false); }, [day, weekId]);

  const tasks = useMemo(() => (week?.tasks[day] ?? []), [week, day]);
  const live = tasks.filter((x) => x.state !== 'dropped');
  const dropped = tasks.filter((x) => x.state === 'dropped');

  const setTaskState = useCallback((id: string, next: Task['state']) => {
    update((d) => {
      const arr = d.weeks[weekId].tasks[day] ?? [];
      const x = arr.find((y) => y.id === id);
      if (x) x.state = next;
    });
  }, [update, weekId, day]);

  const reorder = useCallback((id: string, dir: -1 | 1) => {
    update((d) => {
      const arr = d.weeks[weekId].tasks[day] ?? [];
      const i = arr.findIndex((y) => y.id === id);
      if (i < 0) return;
      const sec = arr[i].sec;
      // Swap with the nearest neighbour in the same section.
      let j = i + dir;
      while (j >= 0 && j < arr.length && arr[j].sec !== sec) j += dir;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    });
  }, [update, weekId, day]);

  const doMove = useCallback((id: string, targetIso: string) => {
    let landed: { weekId: string; dayIndex: number; sectionId: string } | null = null;
    update((d) => { landed = moveTask(d, weekId, day, id, targetIso); });
    setMoveId(null);
    setShowPicker(false);
    if (landed) {
      const l = landed as { weekId: string; dayIndex: number; sectionId: string };
      const secName = state.sections.find((s) => s.id === l.sectionId)?.name ?? '';
      const when = parseISO(targetIso);
      Alert.alert(
        'Rescheduled',
        `Moved to ${DAY_NAMES[l.dayIndex]} ${when.getDate()} ${when.toLocaleDateString('en-GB', { month: 'short' })}`
        + (secName ? ` · ${secName.toLowerCase()}` : '')
        + (l.weekId !== weekId ? ` · week ${l.weekId.slice(-2)}` : ''),
      );
    }
  }, [update, weekId, day, state.sections]);

  const toggleHabit = useCallback((habitId: string) => {
    const h = state.habits.find((x) => x.id === habitId);
    if (h?.picks === 'watch') { router.push({ pathname: '/watch', params: { day: String(day) } }); return; }
    update((d) => {
      const map = (d.weeks[weekId].habits[day] ??= {});
      if (map[habitId]) delete map[habitId]; else map[habitId] = true;
    });
  }, [state.habits, router, update, weekId, day]);

  const addTask = useCallback((sectionId: string) => {
    const text = (drafts[sectionId] ?? '').trim();
    if (!text) return;
    update((d) => {
      const arr = (d.weeks[weekId].tasks[day] ??= []);
      arr.push({ id: uid('n'), text, state: 'open', plan: false,
        track: tagFor[sectionId] || null, sec: sectionId });
    });
    setDrafts((p) => ({ ...p, [sectionId]: '' }));
  }, [drafts, tagFor, update, weekId, day]);

  if (!week) return <Screen><Body><Empty>Loading…</Empty></Body></Screen>;

  const off = Boolean(week.untracked[day]);
  const complete = Boolean(week.complete[day]);
  const outstanding = dayOutstanding(state, week, day);
  const ticked = week.habits[day] ?? {};
  const acts = activeHabits(state, week);
  const planned = acts.filter((h) => habitDayStatus(week, h.id, day) === 'today');
  const anyday = acts.filter((h) => habitDayStatus(week, h.id, day) === 'anyday');
  const notToday = acts.filter((h) => habitDayStatus(week, h.id, day) === 'off');
  const watched = week.watched[day] ?? [];

  return (
    <Screen>
      <WeekHeader />
      <Body>
        {off ? (
          <View style={{ backgroundColor: t.sunk, borderRadius: radius.md, padding: 11 }}>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.ink2 }}>
              <Text style={{ fontWeight: '700' }}>Not tracked. </Text>
              Nothing on this day counts towards the week — targets drop to match.
            </Text>
          </View>
        ) : null}

        {access && access !== 'granted' ? (
          <Section>
            <SectionHead title="Calendar" right={access === 'error' ? 'not working' : 'not connected'} />
            <Note>
              {access === 'error'
                ? `The calendar could not be read: ${calendarError() ?? 'unknown error'}`
                : 'Optimal Week reads your phone\u2019s calendar so appointments and planned runs '
                  + 'show up on the day. It never writes to it.'}
            </Note>
            {access === 'error' ? null : (
              <Button
                title={access === 'blocked' ? 'Turn it on in Settings' : 'Allow calendar access'}
                onPress={connectCalendar}
              />
            )}
          </Section>
        ) : null}

        {events.length ? (
          <Section>
            <SectionHead title="Calendar" right="from your phone" />
            <View>
              {events.map((e) => (
                <View key={e.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center',
                  paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                  <Mono style={{ width: 46, color: t.accent, fontSize: 12, fontWeight: '600' }}>
                    {e.allDay ? 'all day' : e.time}
                  </Mono>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 14, color: t.ink }}>{e.title}</Text>
                      {e.track ? <TrackChip trackId={e.track} /> : null}
                    </View>
                    {e.where || (e.copies ?? 1) > 1 ? (
                      <Mono style={{ fontSize: 11, marginTop: 2 }}>
                        {[e.where, (e.copies ?? 1) > 1 ? `${e.copies} copies in your calendar` : '']
                          .filter(Boolean).join('  \u00b7  ')}
                      </Mono>
                    ) : null}
                  </View>
                  {e.track ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => update((d) => {
                        const arr = (d.weeks[weekId].tasks[day] ??= []);
                        arr.push({ id: uid('n'), text: e.title, state: 'open', plan: false,
                          track: e.track ?? null, sec: d.sections[0].id });
                      })}
                      style={{ borderWidth: 1, borderColor: t.accentLine, borderRadius: radius.pill,
                        paddingHorizontal: 9, paddingVertical: 4 }}
                    >
                      <Text style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
                        color: t.accent, fontWeight: '600' }}>+ Task</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        <Section>
          <SectionHead
            size="title"
            title={parseISO(dateIso).toLocaleDateString('en-GB',
              { weekday: 'long', day: 'numeric', month: 'long' })}
            right={`${live.filter((x) => x.state === 'done').length}/${live.length}`}
          />
          {state.sections.map((sc) => {
            const items = live.filter((x) => x.sec === sc.id);
            const done = items.filter((x) => x.state === 'done').length;
            return (
              <View key={sc.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 13,
                  paddingBottom: 3 }}>
                  <Field
                    value={sc.name}
                    onChangeText={(v) => update((d) => {
                      const s = d.sections.find((x) => x.id === sc.id);
                      if (s) s.name = v;
                    })}
                    style={{ flex: 1, backgroundColor: 'transparent', borderWidth: 0,
                      paddingHorizontal: 0, paddingVertical: 2, fontSize: 12.5,
                      letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '700', color: t.ink }}
                    accessibilityLabel={`Rename ${sc.name}`}
                  />
                  <Mono>{`${done}/${items.length}`}</Mono>
                  {state.sections.length > 1 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${sc.name}`}
                      onPress={() => update((d) => {
                        d.sections = d.sections.filter((x) => x.id !== sc.id);
                        const to = d.sections[0].id;
                        for (const w of Object.values(d.weeks)) {
                          for (const arr of Object.values(w.tasks)) {
                            for (const x of arr) if (x.sec === sc.id) x.sec = to;
                          }
                        }
                      })}
                    >
                      <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: t.rule }}>
                  {items.length === 0 ? null : items.map((x) => (
                    <TaskRow
                      key={x.id}
                      task={x}
                      open={moveId === x.id}
                      onToggle={() => setTaskState(x.id, x.state === 'done' ? 'open' : 'done')}
                      onDrop={() => setTaskState(x.id, 'dropped')}
                      onOpenMove={() => { setMoveId(moveId === x.id ? null : x.id); setShowPicker(false); }}
                      onReorder={(dir) => reorder(x.id, dir)}
                      onMoveToDay={(d) => doMove(x.id, dayDateIso(week.monday, d))}
                      onPickDate={() => setShowPicker(true)}
                      currentDay={day}
                    />
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 7, paddingTop: 7, alignItems: 'center' }}>
                  <Field
                    value={drafts[sc.id] ?? ''}
                    onChangeText={(v) => setDrafts((p) => ({ ...p, [sc.id]: v }))}
                    onSubmitEditing={() => addTask(sc.id)}
                    placeholder={`Add to ${sc.name.toLowerCase()}…`}
                    returnKeyType="done"
                  />
                  <TagPicker
                    value={tagFor[sc.id] ?? ''}
                    onChange={(v) => setTagFor((p) => ({ ...p, [sc.id]: v }))}
                  />
                  <Button title="Add" onPress={() => addTask(sc.id)} />
                </View>
              </View>
            );
          })}

          <Pressable
            accessibilityRole="button"
            onPress={() => update((d) => { d.sections.push({ id: uid('s'), name: 'New section' }); })}
            style={{ paddingTop: 14 }}
          >
            <Text style={{ fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase',
              color: t.accent, fontWeight: '600' }}>+ Add section</Text>
          </Pressable>

          {dropped.length ? (
            <View style={{ paddingTop: 10 }}>
              <Mono style={{ letterSpacing: 1.2, textTransform: 'uppercase' }}>
                {`Discarded · ${dropped.length} (not counted against you)`}
              </Mono>
              {dropped.map((x) => (
                <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9,
                  paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                  <Text style={{ flex: 1, fontSize: 13.5, color: t.ink3,
                    textDecorationLine: 'line-through' }}>{x.text}</Text>
                  <Pressable accessibilityRole="button" onPress={() => setTaskState(x.id, 'open')}>
                    <Text style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
                      color: t.accent, fontWeight: '600' }}>Put back</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </Section>

        <Section>
          <SectionHead
            title="Habits today"
            right={`${planned.filter((h) => ticked[h.id]).length}/${planned.length} planned`}
          />

          <HabitGroup
            label="Planned for today"
            hint={planned.length ? undefined : 'Nothing is pinned to this day.'}
            habits={planned}
            week={week}
            ticked={ticked}
            tone="today"
            onToggle={toggleHabit}
          />

          {anyday.length ? (
            <HabitGroup
              label="Any day this week"
              hint="Owed this week, not to this day in particular. These do not hold the day open."
              habits={anyday}
              week={week}
              ticked={ticked}
              tone="anyday"
              onToggle={toggleHabit}
            />
          ) : null}

          {notToday.length ? (
            <HabitGroup
              label="Not planned today"
              hint="Doing one anyway still counts towards the week."
              habits={notToday}
              week={week}
              ticked={ticked}
              tone="off"
              onToggle={toggleHabit}
            />
          ) : null}

          {watched.length ? (
            <Text style={{ fontSize: 13, fontStyle: 'italic', color: t.ink2 }}>
              {`Watched: ${watched
                .map((id) => state.watch.find((w) => w.id === id)?.title ?? id)
                .join(' · ')}`}
            </Text>
          ) : null}
        </Section>

        <View style={{ gap: 8 }}>
          {!off ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => update((d) => {
                const c = d.weeks[weekId].complete;
                if (c[day]) delete c[day]; else c[day] = true;
              })}
              style={{
                borderWidth: 1, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center',
                borderColor: complete ? t.hit : t.accentLine,
                backgroundColor: complete ? t.hitSoft : t.accentSoft,
              }}
            >
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: complete ? t.hit : t.accent }}>
                {complete ? '✓  Day complete'
                  : `Mark day complete${outstanding ? ` · ${outstanding} still open` : ''}`}
              </Text>
            </Pressable>
          ) : null}
          <Button
            tone="ghost"
            title={off ? 'Track this day again' : 'Mark day untracked'}
            onPress={() => update((d) => {
              const w = d.weeks[weekId];
              if (w.untracked[day]) delete w.untracked[day];
              else { w.untracked[day] = true; delete w.complete[day]; }
            })}
          />
        </View>
      </Body>

      {showPicker && moveId ? (
        <DateTimePicker
          value={parseISO(dateIso)}
          mode="date"
          display="inline"
          onChange={(_e, picked) => {
            setShowPicker(false);
            if (picked) doMove(moveId, isoOf(picked));
          }}
        />
      ) : null}
    </Screen>
  );
}

/** One band of habits: what today asks, what the week asks, and what it does not. */
function HabitGroup({ label, hint, habits, week, ticked, tone, onToggle }: {
  label: string;
  hint?: string;
  habits: Habit[];
  week: Week;
  ticked: Record<string, boolean>;
  tone: 'today' | 'anyday' | 'off';
  onToggle: (habitId: string) => void;
}) {
  const t = useTheme();
  const fill = tone === 'today' ? t.hit : tone === 'anyday' ? t.accent : t.ink3;
  const dashed = tone === 'off';
  return (
    <View style={{ gap: 6, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: fill }} />
        <Text style={{ fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase',
          fontWeight: '700', color: t.ink2 }}>{label}</Text>
        <Mono style={{ fontSize: 10.5 }}>{`${habits.filter((h) => ticked[h.id]).length}/${habits.length}`}</Mono>
      </View>
      {hint ? <Note>{hint}</Note> : null}
      {habits.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {habits.map((h) => {
            const on = Boolean(ticked[h.id]);
            const n = habitDone(week, h.id);
            const tg = habitTarget(week, h.id);
            return (
              <Pressable
                key={h.id}
                accessibilityRole="button"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${h.name}, ${label.toLowerCase()}, ${n} of ${tg} this week`}
                onPress={() => onToggle(h.id)}
                style={{
                  flexBasis: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 9,
                  borderWidth: 1, borderRadius: radius.md, padding: 10,
                  borderStyle: dashed && !on ? 'dashed' : 'solid',
                  borderColor: on ? fill : t.rule,
                  backgroundColor: on
                    ? (tone === 'today' ? t.hitSoft : tone === 'anyday' ? t.accentSoft : t.sunk)
                    : 'transparent',
                }}
              >
                <Tick on={on} tone={tone === 'today' ? 'hit' : 'accent'} size={18} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '500',
                    color: tone === 'off' ? t.ink2 : t.ink }}>{h.short || h.name}</Text>
                  <Mono style={{ fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    {planLabel(week, h.id)}
                  </Mono>
                </View>
                <Mono style={{ color: on ? fill : t.ink3 }}>{`${n}/${tg}`}</Mono>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function TrackChip({ trackId }: { trackId: string }) {
  const t = useTheme();
  const { state } = useStore();
  const tr = state.trackables.find((x) => x.id === trackId);
  if (!tr) return null;
  const [line, soft] = t.track[tr.ci % t.track.length];
  return <Chip text={tr.name} colour={line} soft={soft} />;
}

function TagPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const { state } = useStore();
  const options = ['', ...state.trackables.map((x) => x.id)];
  const next = () => onChange(options[(options.indexOf(value) + 1) % options.length]);
  const tr = state.trackables.find((x) => x.id === value);
  const [line, soft] = tr ? t.track[tr.ci % t.track.length] : [t.ink3, 'transparent'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Tag this task as a tracked session"
      onPress={next}
      style={{ borderWidth: 1, borderColor: tr ? line : t.rule, backgroundColor: tr ? soft : t.sheet2,
        borderRadius: radius.md, paddingHorizontal: 9, paddingVertical: 9, minWidth: 56,
        alignItems: 'center' }}
    >
      <Text style={{ fontSize: 11, fontWeight: '600', color: tr ? line : t.ink3 }}>
        {tr ? tr.name : '— tag'}
      </Text>
    </Pressable>
  );
}

function TaskRow({
  task, open, onToggle, onDrop, onOpenMove, onReorder, onMoveToDay, onPickDate, currentDay,
}: {
  task: Task; open: boolean; currentDay: number;
  onToggle: () => void; onDrop: () => void; onOpenMove: () => void;
  onReorder: (dir: -1 | 1) => void; onMoveToDay: (d: number) => void; onPickDate: () => void;
}) {
  const t = useTheme();
  const done = task.state === 'done';
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: t.rule2, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Pressable onPress={onToggle} accessibilityRole="checkbox"
          accessibilityState={{ checked: done }} accessibilityLabel={task.text} hitSlop={6}>
          <Tick on={done} />
        </Pressable>
        <Pressable onPress={onToggle} style={{ flex: 1 }}>
          <Text style={{ fontSize: 14.5, lineHeight: 19, color: done ? t.ink3 : t.ink,
            textDecorationLine: done ? 'line-through' : 'none' }}>{task.text}</Text>
        </Pressable>
        {task.track ? <TrackChip trackId={task.track} />
          : task.plan ? <Chip text="Plan" colour={t.accent} /> : null}
        <Pressable onPress={onOpenMove} hitSlop={6} accessibilityRole="button"
          accessibilityLabel={`Reschedule ${task.text}`}>
          <Text style={{ color: open ? t.accent : t.ink3, fontSize: 15 }}>→</Text>
        </Pressable>
        <Pressable onPress={onDrop} hitSlop={6} accessibilityRole="button"
          accessibilityLabel={`Discard ${task.text}`}>
          <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
        </Pressable>
      </View>

      {open ? (
        <View style={{ gap: 7, paddingTop: 9 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Mono style={{ width: 62, letterSpacing: 1, textTransform: 'uppercase' }}>This week</Mono>
            {DAY_LETTERS.map((l, d) => (
              <Pressable
                key={d}
                disabled={d === currentDay}
                onPress={() => onMoveToDay(d)}
                accessibilityRole="button"
                accessibilityLabel={DAY_NAMES[d]}
                style={{ flex: 1, borderWidth: 1, borderColor: t.rule, borderRadius: radius.sm + 1,
                  paddingVertical: 6, alignItems: 'center', opacity: d === currentDay ? 0.3 : 1 }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: t.ink2 }}>{l}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            <Button tone="ghost" title="↑ Up" onPress={() => onReorder(-1)} />
            <Button tone="ghost" title="↓ Down" onPress={() => onReorder(1)} />
            <View style={{ flex: 1 }}>
              <Button title="Pick a date…" onPress={onPickDate} />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
