import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Animated, Keyboard, Linking, PanResponder, Pressable, ScrollView, Text, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';

import { WeekHeader } from '../../src/ui/WeekHeader';
import {
  Bar, Body, Button, Chip, Empty, Field, Mono, Note, Screen, Section, SectionHead, Segmented,
  Sheet, Tick,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { DAY_LETTERS, DAY_NAMES, dayDateIso, isoOf, parseISO } from '../../src/domain/dates';
import { marksOn, moveTask, nudgeTask, orderedTasks, placeTask, uid } from '../../src/domain/week';
import {
  activeHabits, dayOutstanding, fromKg, habitDayStatus, habitDone, habitTarget, pacing,
  planLabel, toKg,
} from '../../src/domain/scoring';
import type { CalendarEvent, Habit, Task, Week } from '../../src/domain/types';
import { askForCalendar, calendarAccess, calendarError, eventsForDay, type CalendarAccess }
  from '../../src/services/calendar';

/** A task has to fit a row without pushing the day around. Long enough for a
 *  real sentence, short enough that nothing below it moves. */
export const TASK_LIMIT = 120;

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
  /** Which section has its composer open. Only ever one. */
  const [adding, setAdding] = useState<string | null>(null);
  /** True once the list has scrolled past the top, so the day bar shrinks. */
  const [condensed, setCondensed] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const composerY = useRef(0);
  /** The habit currently asking for a weight, if any. */
  const [weighing, setWeighing] = useState<string | null>(null);
  /** The task being dragged, and where it would land. */
  const [dragId, setDragId] = useState<string | null>(null);
  /** Every row's height, so a drag knows how far a place is. */
  const rowH = useRef<Record<string, number>>({});

  /** Puts the open composer near the middle of the screen, so what you are
   *  typing is not behind the keyboard. */
  const liftComposer = useCallback(() => {
    const y = composerY.current;
    if (!y) return;
    requestAnimationFrame(() => {
      scroller.current?.scrollTo({ y: Math.max(0, y - 150), animated: true });
    });
  }, []);

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
        'iOS will not ask again from inside the app. Open Settings below, then Calendars, '
        + 'and choose Full Access.',
        [{ text: 'Not now', style: 'cancel' },
         { text: 'Open Settings', onPress: () => { Linking.openSettings(); } }],
      );
    }
  }, [access, dateIso]);

  useEffect(() => { setMoveId(null); setShowPicker(false); setAdding(null); setCondensed(false); }, [day, weekId]);

  const tasks = useMemo(() => (week?.tasks[day] ?? []), [week, day]);
  const live = tasks;

  const setTaskState = useCallback((id: string, next: Task['state']) => {
    update((d) => {
      const arr = d.weeks[weekId].tasks[day] ?? [];
      const x = arr.find((y) => y.id === id);
      if (x) x.state = next;
    });
  }, [update, weekId, day]);

  const reorder = useCallback((id: string, dir: -1 | 1) => {
    update((d) => { nudgeTask(d, weekId, day, id, dir); });
  }, [update, weekId, day]);

  /** Where in the day, ignoring the dragged task, the finger currently is.
   *  Rows are measured rather than assumed, because a row with its panel open
   *  is several times the height of one without. */
  const dropIndex = useCallback((id: string, dy: number) => {
    const flat = orderedTasks(state, weekId, day);
    const from = flat.findIndex((x) => x.id === id);
    if (from < 0) return 0;
    const rest = flat.filter((x) => x.id !== id);
    const h = (x: Task) => rowH.current[x.id] || 44;

    // Walk out from where it started until the accumulated height passes dy.
    let at = from;
    if (dy > 0) {
      let run = 0;
      for (let i = from; i < rest.length; i += 1) {
        run += h(rest[i]);
        if (run > dy) break;
        at = i + 1;
      }
    } else {
      let run = 0;
      for (let i = from - 1; i >= 0; i -= 1) {
        run += h(rest[i]);
        if (run > -dy) break;
        at = i;
      }
    }
    return Math.max(0, Math.min(rest.length, at));
  }, [state, weekId, day]);

  const onDragMove = useCallback((id: string) => {
    setDragId((cur) => (cur === id ? cur : id));
  }, []);

  const onDragEnd = useCallback((id: string, dy: number) => {
    const to = dropIndex(id, dy);
    setDragId(null);
    update((d) => { placeTask(d, weekId, day, id, to); });
  }, [dropIndex, update, weekId, day]);

  const deleteTask = useCallback((id: string, text: string) => {
    Alert.alert(
      'Delete this task?',
      `"${text}" is removed from this day.`,
      [{ text: 'Cancel', style: 'cancel' },
       {
         text: 'Delete',
         style: 'destructive',
         onPress: () => Alert.alert(
           'Delete for good?',
           'This cannot be undone.',
           [{ text: 'Keep it', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => update((d) => {
                const arr = d.weeks[weekId].tasks[day] ?? [];
                d.weeks[weekId].tasks[day] = arr.filter((y) => y.id !== id);
              }),
            }],
         ),
       }],
    );
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
    if (h?.picks === 'weight') { setWeighing(habitId); return; }
    update((d) => {
      const w = d.weeks[weekId];
      const map = (w.habits[day] ??= {});
      const at = (w.at ??= {});
      const stamps = (at[day] ??= {});
      if (map[habitId]) {
        delete map[habitId];
        delete stamps[habitId];
      } else {
        map[habitId] = true;
        // Only ever the clock at the moment it was ticked. Ticking Monday on
        // Thursday records nothing rather than a time that never happened.
        const now = new Date();
        if (dayDateIso(w.monday, day) === isoOf(now)) {
          stamps[habitId] = now.getHours() * 60 + now.getMinutes();
        }
      }
    });
  }, [state.habits, router, update, weekId, day]);

  /** Records a weight, or marks the day as one you did not weigh in. */
  const recordWeight = useCallback((habitId: string, kg: number | null) => {
    update((d) => {
      const w = d.weeks[weekId];
      const map = (w.habits[day] ??= {});
      const readings = (w.readings ??= {});
      const onDay = (readings[day] ??= {});
      if (kg === null) {
        delete map[habitId];
        delete onDay[habitId];
      } else {
        map[habitId] = true;
        onDay[habitId] = kg;
      }
    });
    setWeighing(null);
  }, [update, weekId, day]);

  const addTask = useCallback((sectionId: string) => {
    const text = (drafts[sectionId] ?? '').trim().slice(0, TASK_LIMIT);
    if (!text) return;
    update((d) => {
      const arr = (d.weeks[weekId].tasks[day] ??= []);
      arr.push({ id: uid('n'), text, state: 'open', plan: false,
        track: tagFor[sectionId] || null, sec: sectionId });
    });
    // Clear both, so the next task starts blank and untagged rather than
    // quietly inheriting the last one's tag.
    setDrafts((p) => ({ ...p, [sectionId]: '' }));
    setTagFor((p) => ({ ...p, [sectionId]: '' }));
  }, [drafts, tagFor, update, weekId, day]);

  /** Lifts the composer clear of the keyboard when it opens. */
  const openComposer = useCallback((sectionId: string) => {
    setAdding(sectionId);
    setTagFor((p) => ({ ...p, [sectionId]: '' }));
  }, []);

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
  const marks = marksOn(state, dateIso);

  return (
    <Screen>
      <WeekHeader />

      {/* The day stays put while the list moves under it, shrinking to a single
          line once you are past the top so it costs almost nothing. */}
      <View style={{ paddingHorizontal: 18, paddingTop: condensed ? 4 : 10,
        paddingBottom: condensed ? 6 : 8, borderBottomWidth: 1,
        borderBottomColor: condensed ? t.rule : 'transparent',
        backgroundColor: t.sheet, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontWeight: '700', color: t.ink,
            fontSize: condensed ? 15 : 21, letterSpacing: -0.3 }}
        >
          {parseISO(dateIso).toLocaleDateString('en-GB', condensed
            ? { weekday: 'short', day: 'numeric', month: 'short' }
            : { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Mono style={{ fontSize: condensed ? 11 : 12.5 }}>
          {`${live.filter((x) => x.state === 'done').length}/${live.length}`}
        </Mono>
      </View>

      {marks.trips.length || marks.events.length ? (
        <View style={{ paddingHorizontal: 18, paddingBottom: 8, flexDirection: 'row',
          flexWrap: 'wrap', gap: 6, backgroundColor: t.sheet }}>
          {marks.trips.map((name) => (
            <View key={`t-${name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              borderWidth: 1, borderColor: t.accentLine, backgroundColor: t.accentSoft,
              borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11 }}>✈︎</Text>
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: t.accent }}>{name}</Text>
            </View>
          ))}
          {marks.events.map((name) => (
            <View key={`e-${name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5,
              borderWidth: 1, borderColor: t.rule, backgroundColor: t.sunk,
              borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11 }}>★</Text>
              <Text style={{ fontSize: 11.5, fontWeight: '600', color: t.ink2 }}>{name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Body scrollRef={scroller} onScroll={(y) => setCondensed(y > 18)}>
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
                : 'Week One reads your phone\u2019s calendar so appointments and planned runs '
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
          {state.sections.map((sc) => {
            const inSec = live.filter((x) => x.sec === sc.id);
            // Ticked work sinks, so what is left to do is always at the top.
            const items = [...inSec.filter((x) => x.state !== 'done'),
                           ...inSec.filter((x) => x.state === 'done')];
            const done = inSec.length - items.filter((x) => x.state !== 'done').length;
            return (
              <View key={sc.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 13,
                  paddingBottom: 3 }}>
                  <Text style={{ flex: 1, fontSize: 12.5, letterSpacing: 1.1,
                    textTransform: 'uppercase', fontWeight: '700', color: t.ink }}>{sc.name}</Text>
                  <Mono>{`${done}/${items.length}`}</Mono>
                </View>

                <View style={{ borderTopWidth: 1, borderTopColor: t.rule }}>
                  {items.length === 0 ? null : items.map((x) => (
                    <TaskRow
                      key={x.id}
                      task={x}
                      open={moveId === x.id}
                      onToggle={() => setTaskState(x.id, x.state === 'done' ? 'open' : 'done')}
                      onDelete={() => deleteTask(x.id, x.text)}
                      onOpenMove={() => { setMoveId(moveId === x.id ? null : x.id); setShowPicker(false); }}
                      onReorder={(dir) => reorder(x.id, dir)}
                      onRename={(text) => update((d) => {
                        const item = (d.weeks[weekId].tasks[day] ?? []).find((y) => y.id === x.id);
                        if (item) item.text = text;
                      })}
                      onMoveToDay={(d) => doMove(x.id, dayDateIso(week.monday, d))}
                      onPickDate={() => setShowPicker(true)}
                      onMeasure={(h) => { rowH.current[x.id] = h; }}
                      onDragMove={() => onDragMove(x.id)}
                      onDragEnd={(dy) => onDragEnd(x.id, dy)}
                      dragging={dragId === x.id}
                      currentDay={day}
                    />
                  ))}
                </View>

                {adding === sc.id ? (
                  <View
                    onLayout={(e) => { composerY.current = e.nativeEvent.layout.y; liftComposer(); }}
                    style={{ gap: 7, paddingTop: 7 }}
                  >
                    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                      <Field
                        value={drafts[sc.id] ?? ''}
                        onChangeText={(v) => setDrafts((p) => ({ ...p, [sc.id]: v }))}
                        onSubmitEditing={() => addTask(sc.id)}
                        placeholder={`Add to ${sc.name.toLowerCase()}…`}
                        returnKeyType="next"
                        maxLength={TASK_LIMIT}
                        // Enter files the task and leaves the field up for the
                        // next one, rather than closing the whole thing.
                        blurOnSubmit={false}
                        autoFocus
                      />
                      <TagPicker
                        value={tagFor[sc.id] ?? ''}
                        onChange={(v) => setTagFor((p) => ({ ...p, [sc.id]: v }))}
                      />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                      <Mono style={{ flex: 1, fontSize: 10.5 }}>
                        {(drafts[sc.id] ?? '').length >= TASK_LIMIT - 20
                          ? `${TASK_LIMIT - (drafts[sc.id] ?? '').length} left`
                          : 'Return adds it and keeps going'}
                      </Mono>
                      <Button tone="ghost" title="Done" onPress={() => { setAdding(null); Keyboard.dismiss(); }} />
                      <Button title="Add" onPress={() => addTask(sc.id)} />
                    </View>
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add to ${sc.name}`}
                    onPress={() => openComposer(sc.id)}
                    hitSlop={8}
                    style={{ paddingTop: 7, paddingBottom: 2 }}
                  >
                    <Text style={{ fontSize: 15, color: t.ink3, lineHeight: 18 }}>+</Text>
                  </Pressable>
                )}
              </View>
            );
          })}


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
            today={day}
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
              today={day}
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
              today={day}
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

      <WeightSheet
        habitId={weighing}
        onClose={() => setWeighing(null)}
        onSave={recordWeight}
        current={weighing ? (week.readings?.[day] ?? {})[weighing] : undefined}
      />

      <Sheet
        open={showPicker && Boolean(moveId)}
        title="Move to a date"
        onClose={() => setShowPicker(false)}
      >
        <DateTimePicker
          value={parseISO(dateIso)}
          mode="date"
          display="inline"
          themeVariant={t.dark ? 'dark' : 'light'}
          accentColor={t.accent}
          style={{ alignSelf: 'stretch' }}
          onChange={(_e, picked) => {
            setShowPicker(false);
            if (picked && moveId) doMove(moveId, isoOf(picked));
          }}
        />
      </Sheet>
    </Screen>
  );
}

/** Asks for a number rather than just a tick. Entered in whichever unit you
 *  set, stored in kilograms, so switching units later reads the same history
 *  rather than rewriting it. */
function WeightSheet({ habitId, current, onClose, onSave }: {
  habitId: string | null;
  current?: number;
  onClose: () => void;
  onSave: (habitId: string, kg: number | null) => void;
}) {
  const t = useTheme();
  const { state, update } = useStore();
  const unit = state.prefs.weightUnit;
  const [text, setText] = useState('');

  useEffect(() => {
    if (!habitId) return;
    setText(current === undefined ? '' : String(Math.round(fromKg(current, unit) * 10) / 10));
  }, [habitId, current, unit]);

  const value = Number(text.replace(',', '.'));
  const ok = text.trim() !== '' && Number.isFinite(value) && value > 0 && value < 1000;

  return (
    <Sheet
      open={Boolean(habitId)}
      title="Weight"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }}>
            <Button tone="ghost" title="Not tracked today"
              onPress={() => habitId && onSave(habitId, null)} />
          </View>
          <Button title="Save" disabled={!ok}
            onPress={() => ok && habitId && onSave(habitId, toKg(value, unit))} />
        </>
      }
    >
      <Segmented
        value={unit}
        onChange={(v) => update((d) => { d.prefs.weightUnit = v; })}
        options={[{ key: 'kg' as const, label: 'kg' }, { key: 'lb' as const, label: 'lb' }]}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Field
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          placeholder="0.0"
          maxLength={6}
          autoFocus
          accessibilityLabel={`Weight in ${unit}`}
          style={{ fontSize: 30, fontWeight: '700', textAlign: 'center', paddingVertical: 14 }}
        />
        <Text style={{ fontSize: 17, color: t.ink2, fontWeight: '600', width: 26 }}>{unit}</Text>
      </View>
      <Note>
        Kept for the graph on the Hub. Not tracked leaves the day blank rather than
        counting it as a miss.
      </Note>
    </Sheet>
  );
}

/** One band of habits: what today asks, what the week asks, and what it does not. */
function HabitGroup({ label, hint, habits, week, ticked, tone, today, onToggle }: {
  label: string;
  hint?: string;
  habits: Habit[];
  week: Week;
  ticked: Record<string, boolean>;
  tone: 'today' | 'anyday' | 'off';
  today: number;
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
            // Only flexible habits have a race against the week; a pinned one
            // is simply owed today or not.
            const pace = tone === 'anyday' && tg > 0 ? pacing(week, h.id, today) : null;
            return (
              <Pressable
                key={h.id}
                accessibilityRole="button"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${h.name}, ${label.toLowerCase()}, ${n} of ${tg} this week`}
                onPress={() => onToggle(h.id)}
                style={{
                  flexBasis: '48%', flexGrow: 0, gap: 7,
                  borderWidth: 1, borderRadius: radius.md, padding: 10,
                  borderStyle: dashed && !on ? 'dashed' : 'solid',
                  borderColor: pace?.impossible && !on ? t.miss : on ? fill : t.rule,
                  backgroundColor: on
                    ? (tone === 'today' ? t.hitSoft : tone === 'anyday' ? t.accentSoft : t.sunk)
                    : 'transparent',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Tick on={on} tone={tone === 'today' ? 'hit' : 'accent'} size={18} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '500',
                    color: tone === 'off' ? t.ink2 : t.ink }}>{h.short || h.name}</Text>
                  {/* Always a second line. A habit with no plan for this week has
                      no plan label, and without this the name sat off centre
                      against tiles that do have one. */}
                  <Mono style={{ fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                    {planLabel(week, h.id) || 'Not this week'}
                  </Mono>
                </View>
                  <Mono style={{ color: on ? fill : t.ink3 }}>{`${n}/${tg}`}</Mono>
                </View>

                {/* A week's worth of room is not the same as a week's worth of
                    days left. Three owed on a Saturday is the case this is for. */}
                {pace ? (
                  <View style={{ gap: 3 }}>
                    <View style={{ height: 4, borderRadius: 2, backgroundColor: t.rule2,
                      overflow: 'hidden', flexDirection: 'row' }}>
                      <View style={{ flex: Math.max(0, Math.min(1, tg ? n / tg : 0)),
                        backgroundColor: pace.impossible ? t.miss : pace.atRisk ? t.partial : fill }} />
                      <View style={{ flex: Math.max(0, 1 - (tg ? n / tg : 0)) }} />
                    </View>
                    <Mono style={{ fontSize: 9,
                      color: pace.impossible ? t.miss : pace.atRisk ? t.partial : t.ink3 }}>
                      {pace.left === 0
                        ? 'Done for the week'
                        : pace.impossible
                          ? `${pace.left} left · only ${pace.daysLeft} ${pace.daysLeft === 1 ? 'day' : 'days'}`
                          : pace.atRisk
                            ? `${pace.left} left · ${pace.daysLeft} ${pace.daysLeft === 1 ? 'day' : 'days'} — every one`
                            : `${pace.left} left · ${pace.daysLeft} days`}
                    </Mono>
                  </View>
                ) : null}
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

/** Tagging is a choice from a short list, so it is a list you pick from —
 *  tapping through six options to get back to none was guesswork. */
function TagPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const { state } = useStore();
  const [open, setOpen] = useState(false);
  const tr = state.trackables.find((x) => x.id === value);
  const [line, soft] = tr ? t.track[tr.ci % t.track.length] : [t.ink3, 'transparent'];

  const row = (id: string, name: string, colour: string, fillSoft: string) => {
    const on = id === value;
    return (
      <Pressable
        key={id || 'none'}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => { onChange(id); setOpen(false); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
          borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 11,
          borderColor: on ? colour : t.rule,
          backgroundColor: on ? fillSoft : 'transparent' }}
      >
        <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: colour }} />
        <Text style={{ flex: 1, fontSize: 14.5, color: t.ink, fontWeight: on ? '600' : '400' }}>
          {name}
        </Text>
        {on ? <Text style={{ color: colour, fontSize: 15, fontWeight: '800' }}>✓</Text> : null}
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr ? `Tagged ${tr.name}. Change it.` : 'Add a tag'}
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: tr ? line : t.rule, backgroundColor: tr ? soft : t.sheet2,
          borderRadius: radius.md, paddingHorizontal: 9, paddingVertical: 9, minWidth: 56,
          alignItems: 'center' }}
      >
        <Text style={{ fontSize: 11, fontWeight: '600', color: tr ? line : t.ink3 }}>
          {tr ? tr.name : '—'}
        </Text>
      </Pressable>
      <Sheet open={open} title="Tag this as" onClose={() => setOpen(false)}>
        {row('', 'No tag', t.ink3, t.sunk)}
        {state.trackables.map((k) => {
          const [c, sf] = t.track[k.ci % t.track.length];
          return row(k.id, k.name, c, sf);
        })}
      </Sheet>
    </>
  );
}

function TaskRow({
  task, open, onToggle, onDelete, onOpenMove, onReorder, onMoveToDay, onPickDate, onRename,
  onMeasure, onDragMove, onDragEnd, dragging, currentDay,
}: {
  task: Task; open: boolean; currentDay: number;
  onToggle: () => void; onDelete: () => void; onOpenMove: () => void;
  onReorder: (dir: -1 | 1) => void; onMoveToDay: (d: number) => void; onPickDate: () => void;
  onRename: (text: string) => void;
  onMeasure: (h: number) => void;
  onDragMove: () => void;
  onDragEnd: (dy: number) => void;
  dragging: boolean;
}) {
  const t = useTheme();
  const done = task.state === 'done';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const lift = useRef(new Animated.Value(0)).current;
  const held = useRef(false);

  // Hold the grip, then move. A drag that starts without the hold is the list
  // scrolling, and has to stay the list scrolling.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => held.current && Math.abs(g.dy) > 2,
      onPanResponderMove: (_e, g) => {
        lift.setValue(g.dy);
        onDragMove();
      },
      onPanResponderRelease: (_e, g) => {
        held.current = false;
        lift.setValue(0);
        onDragEnd(g.dy);
      },
      onPanResponderTerminate: () => {
        held.current = false;
        lift.setValue(0);
        onDragEnd(0);
      },
    }),
  ).current;

  const commit = () => {
    const next = draft.trim().slice(0, TASK_LIMIT);
    if (next && next !== task.text) onRename(next);
    setEditing(false);
  };

  return (
    <Animated.View
      onLayout={(e) => onMeasure(e.nativeEvent.layout.height)}
      style={{
        borderBottomWidth: 1, borderBottomColor: t.rule2, paddingVertical: 8,
        transform: [{ translateY: dragging ? lift : 0 }],
        opacity: dragging ? 0.92 : 1,
        zIndex: dragging ? 10 : 0,
        backgroundColor: dragging ? t.sheet2 : 'transparent',
        borderRadius: dragging ? radius.md : 0,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        {/* The grip. Hold it, then drag. */}
        <Pressable
          onLongPress={() => { held.current = true; }}
          onPressOut={() => { setTimeout(() => { held.current = false; }, 400); }}
          delayLongPress={180}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Hold to move ${task.text}`}
          {...pan.panHandlers}
        >
          <Text style={{ color: dragging ? t.accent : t.ink3, fontSize: 14, lineHeight: 17,
            paddingHorizontal: 2 }}>⠿</Text>
        </Pressable>
        <Pressable onPress={onToggle} accessibilityRole="checkbox"
          accessibilityState={{ checked: done }} accessibilityLabel={task.text} hitSlop={6}>
          <Tick on={done} />
        </Pressable>
        {editing ? (
          <Field
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={commit}
            onBlur={commit}
            maxLength={TASK_LIMIT}
            returnKeyType="done"
            autoFocus
            accessibilityLabel="Task name"
          />
        ) : (
          <Pressable
            onPress={onToggle}
            onLongPress={() => { setDraft(task.text); setEditing(true); }}
            delayLongPress={300}
            style={{ flex: 1 }}
          >
            <Text style={{ fontSize: 14.5, lineHeight: 19, color: done ? t.ink3 : t.ink,
              textDecorationLine: done ? 'line-through' : 'none' }}>{task.text}</Text>
          </Pressable>
        )}
        {editing ? (
          <Pressable onPress={commit} hitSlop={6} accessibilityRole="button"
            accessibilityLabel="Save the name">
            <Text style={{ color: t.hit, fontSize: 17, fontWeight: '800' }}>✓</Text>
          </Pressable>
        ) : (
          <>
            {task.track ? <TrackChip trackId={task.track} />
              : task.plan ? <Chip text="Plan" colour={t.accent} /> : null}
            {/* The arrow turns into a tick while the panel is open, so the same
                button that opened it is the one that closes it. */}
            <Pressable onPress={onOpenMove} hitSlop={6} accessibilityRole="button"
              accessibilityLabel={open ? `Done moving ${task.text}` : `Move ${task.text}`}>
              <Text style={{ color: open ? t.hit : t.ink3, fontSize: open ? 17 : 15,
                fontWeight: open ? '800' : '400' }}>{open ? '✓' : '→'}</Text>
            </Pressable>
            <Pressable onPress={onDelete} hitSlop={6} accessibilityRole="button"
              accessibilityLabel={`Delete ${task.text}`}>
              <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
            </Pressable>
          </>
        )}
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
          <Button
            tone="ghost"
            title="Rename"
            onPress={() => { setDraft(task.text); setEditing(true); }}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}
