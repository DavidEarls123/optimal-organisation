import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Linking, Pressable, View } from 'react-native';
import { Text } from '../../src/ui/type';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';

import { SlimStrip, WeekHeader } from '../../src/ui/WeekHeader';
import { DayDone } from '../../src/ui/DayDone';
import {
  Bar, Body, Button, Chip, Empty, Field, Glyph, Mono, Note, Screen, Section, SectionHead,
  Segmented, Sheet, Tick, useBoxWidth,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { DAY_LETTERS, DAY_NAMES, dayDateIso, isoOf, parseISO } from '../../src/domain/dates';
import {
  dropSlots, marksOn, moveChoices, moveTask, nudgeTask, orderedTasks, placeTask, sectionsOf,
  uid,
} from '../../src/domain/week';
import {
  activeHabits, dayOutstanding, fromKg, habitDayStatus, habitDone, habitTarget, pacing,
  planLabel, toKg,
} from '../../src/domain/scoring';
import { NOTE_LIMIT } from '../../src/domain/types';
import type { CalendarEvent, Habit, Task, Week } from '../../src/domain/types';
import type { DropSlot } from '../../src/domain/week';
import { askForCalendar, calendarAccess, calendarError, eventsForDay, type CalendarAccess }
  from '../../src/services/calendar';

/** A task has to fit a row without pushing the day around. Long enough for a
 *  real sentence, short enough that nothing below it moves. */
export const TASK_LIMIT = 120;

export default function DayScreen() {
  const t = useTheme();
  const router = useRouter();
  const { state, weekId, day, today, update, setWeekId, setDay, undo, undoLabel } = useStore();
  const week = state.weeks[weekId];
  const [moveId, setMoveId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [access, setAccess] = useState<CalendarAccess | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [tagFor, setTagFor] = useState<Record<string, string>>({});
  /** Which section has its composer open. Only ever one. */
  const [adding, setAdding] = useState<string | null>(null);
  /** How far the list has been scrolled, kept on the thread that draws so the
   *  top can shrink with your thumb rather than in steps behind it. */
  const scrollY = useSharedValue(0);
  /** The habit currently asking for a weight, if any. */
  const [weighing, setWeighing] = useState<string | null>(null);
  /** True for the moment after a day is marked complete. */
  const [cheer, setCheer] = useState(false);
  const box = useBoxWidth();
  /** The task being dragged, and where it would land. */
  const [dragId, setDragId] = useState<string | null>(null);
  /** The place it would land if you let go now, and how far down the list that
   *  is — the same number the line is drawn at, so the two cannot disagree. */
  const [drop, setDrop] = useState<(DropSlot & { y: number }) | null>(null);
  /** Every row's height, so a drag knows how far a place is. */
  const rowH = useRef<Record<string, number>>({});
  /** Headings whose finished work is showing. Folded away by default, so a
   *  day gets shorter as you get through it rather than longer. */
  const [showDone, setShowDone] = useState<Record<string, boolean>>({});

  const dateIso = week ? dayDateIso(week.monday, day) : '';
  // Headings come from the week, which took them from its template.
  const sections = useMemo(() => sectionsOf(state, weekId), [state, weekId]);
  // Where a task can be moved to from the strip: forward only, because there
  // is no sense in rescheduling something into a day that has gone.
  const drawn = useMemo(() => orderedTasks(state, weekId, day), [state, weekId, day]);
  /** What the day holds but is not showing: finished work under a folded
   *  heading, and anything filed under a heading this template no longer has.
   *  A drag has to count the same rows you can see, or the line lies. */
  const hidden = useMemo(() => {
    const known = new Set(sections.map((x) => x.id));
    const out = new Set<string>();
    for (const x of drawn) {
      if (!known.has(x.sec)) out.add(x.id);
      else if (x.state === 'done' && !showDone[x.sec]) out.add(x.id);
    }
    return out;
  }, [drawn, sections, showDone]);
  const choices = useMemo(
    () => (dateIso ? moveChoices(dateIso, isoOf(today)) : []),
    [dateIso, today],
  );

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

  // Changing day puts the top back: you are starting a fresh list, and the
  // week strip is the thing you just used to get here.
  // Changing day closes anything that was open on the old one, and nothing
  // else: being thrown back to the top of the page every time you tap a day on
  // the strip you are using *because* you are down the page is no use at all.
  useEffect(() => { setMoveId(null); setShowPicker(false); setAdding(null); }, [day, weekId]);

  const tasks = useMemo(() => (week?.tasks[day] ?? []), [week, day]);
  const live = tasks;

  const setTaskState = useCallback((id: string, next: Task['state']) => {
    update((d) => {
      const arr = d.weeks[weekId].tasks[day] ?? [];
      const x = arr.find((y) => y.id === id);
      if (!x) return;
      x.state = next;
      // Stamped so the done pile can be ordered by when, not by where it was.
      if (next === 'done') x.doneAt = Date.now();
      else delete x.doneAt;
    }, next === 'done' ? 'ticking that off' : 'unticking that');
  }, [update, weekId, day]);

  const reorder = useCallback((id: string, dir: -1 | 1) => {
    update((d) => { nudgeTask(d, weekId, day, id, dir); }, 'moving that task');
  }, [update, weekId, day]);

  /** Where every row sits on the screen, measured rather than assumed: a row
   *  with its panel open is several times the height of one without, and a
   *  folded-away row has no height at all. Three numbers because the layout is
   *  three deep — the heading block, its list of rows, then the row. */
  const secY = useRef<Record<string, number>>({});
  const listY = useRef<Record<string, number>>({});
  const rowY = useRef<Record<string, number>>({});

  /** Every place the dragged task could land, each with the point down the
   *  screen it belongs to. The gap under one heading's last row and the gap
   *  above the next heading's first row are different places, which is what
   *  makes dropping something at the top of a heading possible at all. */
  const placesFor = useCallback((id: string) => {
    const slots = dropSlots(drawn, sections.map((x) => x.id), [...hidden], id);
    const yOf = (slot: (typeof slots)[number]) => {
      const base = (secY.current[slot.sec] ?? 0) + (listY.current[slot.sec] ?? 0);
      if (slot.before) return base + (rowY.current[slot.before] ?? 0);
      if (slot.after) {
        return base + (rowY.current[slot.after] ?? 0) + (rowH.current[slot.after] ?? 44);
      }
      return base;
    };
    return slots.map((slot) => ({ ...slot, y: yOf(slot) }));
  }, [drawn, sections, hidden]);

  /** Where the dragged row's top would be if you let go now, and the place
   *  nearest to it. The rows below it are still drawn in their old positions,
   *  so anything past where it started is a row-height too low. */
  const nearest = useCallback((id: string, dy: number) => {
    const task = drawn.find((x) => x.id === id);
    if (!task) return null;
    const from = (secY.current[task.sec] ?? 0) + (listY.current[task.sec] ?? 0)
      + (rowY.current[id] ?? 0);
    const tall = rowH.current[id] ?? 44;
    const top = from + dy;

    let best: ReturnType<typeof placesFor>[number] | null = null;
    let gap = Infinity;
    for (const slot of placesFor(id)) {
      const y = slot.y > from ? slot.y - tall : slot.y;
      const d = Math.abs(y - top);
      if (d < gap) { gap = d; best = slot; }
    }
    return best;
  }, [drawn, placesFor]);

  const onDragMove = useCallback((id: string, dy: number) => {
    setDragId((cur) => (cur === id ? cur : id));
    const to = nearest(id, dy);
    setDrop((cur) => (cur && to && cur.sec === to.sec && cur.before === to.before
      ? cur : to));
  }, [nearest]);

  const onDragEnd = useCallback((id: string, dy: number) => {
    const to = nearest(id, dy);
    setDragId(null);
    setDrop(null);
    if (!to) return;
    update((d) => { placeTask(d, weekId, day, id, to.at, to.sec); }, 'moving that task');
  }, [nearest, update, weekId, day]);

  const deleteTask = useCallback((id: string, text: string) => {
    // One question, and an honest one: Undo puts it straight back.
    Alert.alert(
      'Delete this task?',
      `"${text}" is removed from this day. Undo puts it back.`,
      [{ text: 'Cancel', style: 'cancel' },
       {
         text: 'Delete',
         style: 'destructive',
         onPress: () => update((d) => {
           const arr = d.weeks[weekId].tasks[day] ?? [];
           d.weeks[weekId].tasks[day] = arr.filter((y) => y.id !== id);
         }, `deleting ${text}`),
       }],
    );
  }, [update, weekId, day]);

  const doMove = useCallback((id: string, targetIso: string) => {
    let landed: { weekId: string; dayIndex: number; sectionId: string } | null = null;
    update((d) => { landed = moveTask(d, weekId, day, id, targetIso); }, 'rescheduling that task');
    setMoveId(null);
    setShowPicker(false);
    if (landed) {
      const l = landed as { weekId: string; dayIndex: number; sectionId: string };
      const secName = sections.find((s) => s.id === l.sectionId)?.name ?? '';
      const when = parseISO(targetIso);
      Alert.alert(
        'Rescheduled',
        `Moved to ${DAY_NAMES[l.dayIndex]} ${when.getDate()} ${when.toLocaleDateString('en-GB', { month: 'short' })}`
        + (secName ? ` · ${secName.toLowerCase()}` : '')
        + (l.weekId !== weekId ? ` · week ${l.weekId.slice(-2)}` : ''),
      );
    }
  }, [update, weekId, day, sections]);

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
    }, `that habit tick`);
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
    // Nothing typed and you pressed next: that means you are finished.
    if (!text) { setAdding(null); Keyboard.dismiss(); return; }
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
  /** What is on the calendar and not already written on the day. Once you have
   *  taken one it is a task like any other, and saying it twice only makes the
   *  day look longer than it is. Delete the task and the appointment comes
   *  back, because it is still in your calendar. */
  const onCalendar = (() => {
    const had = new Set(live.map((x) => x.text.trim().toLowerCase()));
    return events.filter((e) => !had.has(e.title.trim().toLowerCase()));
  })();

  const watched = week.watched[day] ?? [];
  const marks = marksOn(state, dateIso);

  /** The week, and anything pinned to this day, as the top of the list itself.
   *  It scrolls away at exactly the speed of your thumb because it is part of
   *  what you are scrolling, rather than a thing above it getting smaller. */
  const lead = (
    <View style={{ backgroundColor: t.sheet }}>
      <WeekHeader />
      {marks.trips.length || marks.events.length ? (
        <View style={{ paddingHorizontal: 18, paddingTop: 8, flexDirection: 'row',
          flexWrap: 'wrap', gap: 6 }}>
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
    </View>
  );

  /** What stays: the seven days on one line, fading in as the week goes by
   *  above it, and the day you are on. One fixed height — a pinned thing that
   *  changes size pushes the list around underneath it. */
  const pinned = (
    <View style={{ backgroundColor: t.sheet, borderBottomWidth: 1, borderBottomColor: t.rule }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 7,
        flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontWeight: '700', color: t.ink, fontSize: 17,
            letterSpacing: -0.3 }}
        >
          {parseISO(dateIso).toLocaleDateString('en-GB',
            { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Mono style={{ fontSize: 11.5 }}>
          {`${live.filter((x) => x.state === 'done').length}/${live.length}`}
        </Mono>
        {undoLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Undo ${undoLabel}`}
            onPress={undo}
            hitSlop={10}
            style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
              borderWidth: 1, borderColor: t.rule, borderRadius: 14 }}
          >
            <Glyph name="arrow.uturn.backward" fallback="↺" size={14} colour={t.ink2} />
          </Pressable>
        ) : null}
      </View>
      {/* Hung below the bar rather than held inside it, so at the top of the
          page there is no band of nothing under the date waiting for it. */}
      <SlimStrip scrollY={scrollY} />
    </View>
  );

  return (
    <Screen>
      <Body top={12} scrollY={scrollY} lead={lead} sticky={pinned}>
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

        {onCalendar.length ? (
          <Section>
            <SectionHead title="Calendar" right="from your phone" />
            <View>
              {onCalendar.map((e) => (
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${e.title} to today`}
                    onPress={() => update((d) => {
                      const arr = (d.weeks[weekId].tasks[day] ??= []);
                      // Under one of this week's own headings. The app's
                      // standard ones are not necessarily this week's, and a
                      // task filed under a heading the day has not got is a
                      // task that never appears.
                      arr.push({ id: uid('n'), text: e.title, state: 'open', plan: false,
                        track: e.track ?? null, sec: sections[0]?.id ?? d.sections[0].id });
                    }, 'adding that to the day')}
                    style={{ borderWidth: 1, borderColor: t.accentLine, borderRadius: radius.pill,
                      paddingHorizontal: 9, paddingVertical: 4 }}
                  >
                    <Text style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase',
                      color: t.accent, fontWeight: '600' }}>+ Task</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        <Section>
          {sections.map((sc, si) => {
            // Straight from the same ordering the drag counts against.
            const items = drawn.filter((x) => x.sec === sc.id);
            const todo = items.filter((x) => x.state !== 'done');
            const finished = items.filter((x) => x.state === 'done');
            const showing = !!showDone[sc.id];
            /** Where the line goes inside this heading's list, measured from the
             *  same place the drop itself is worked out from. Null when the
             *  finger is not over this heading at all. */
            const end = drop && drop.sec === sc.id
              ? drop.y - (secY.current[sc.id] ?? 0) - (listY.current[sc.id] ?? 0)
              : null;
            const row = (x: Task) => (
              <React.Fragment key={x.id}>
                <TaskRow
                  task={x}
                  open={moveId === x.id}
                  onToggle={() => setTaskState(x.id, x.state === 'done' ? 'open' : 'done')}
                  onDelete={() => deleteTask(x.id, x.text)}
                  onOpenMove={() => { setMoveId(moveId === x.id ? null : x.id); setShowPicker(false); }}
                  onReorder={(dir) => reorder(x.id, dir)}
                  onRename={(text) => update((d) => {
                    const item = (d.weeks[weekId].tasks[day] ?? []).find((y) => y.id === x.id);
                    if (item) item.text = text;
                  }, 'renaming that task')}
                  onNote={(text) => update((d) => {
                    const item = (d.weeks[weekId].tasks[day] ?? []).find((y) => y.id === x.id);
                    if (!item) return;
                    if (text) item.note = text; else delete item.note;
                  }, text ? 'writing that note' : 'clearing that note')}
                  choices={choices}
                  onMoveToDate={(iso) => doMove(x.id, iso)}
                  onPickDate={() => setShowPicker(true)}
                  onMeasure={(y, h) => { rowY.current[x.id] = y; rowH.current[x.id] = h; }}
                  onDragMove={(dy) => onDragMove(x.id, dy)}
                  onDragEnd={(dy) => onDragEnd(x.id, dy)}
                  dragging={dragId === x.id}
                />
              </React.Fragment>
            );
            return (
              <View
                key={sc.id}
                onLayout={(e) => { secY.current[sc.id] = e.nativeEvent.layout.y; }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingTop: si === 0 ? 0 : 13, paddingBottom: 3 }}>
                  <Text style={{ flex: 1, fontSize: 12.5, letterSpacing: 1.1,
                    textTransform: 'uppercase', fontWeight: '700', color: t.ink }}>{sc.name}</Text>
                  <Mono>{`${finished.length}/${items.length}`}</Mono>
                </View>

                <View
                  onLayout={(e) => { listY.current[sc.id] = e.nativeEvent.layout.y; }}
                  style={{ borderTopWidth: 1, borderTopColor: t.rule }}
                >
                  {todo.map(row)}

                  {/* Finished work folds away, so the heading gets shorter as
                      you get through it. It is one tap from being back. */}
                  {finished.length ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showing }}
                      accessibilityLabel={showing
                        ? `Hide ${finished.length} done under ${sc.name}`
                        : `Show ${finished.length} done under ${sc.name}`}
                      onPress={() => setShowDone((p) => ({ ...p, [sc.id]: !p[sc.id] }))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 7,
                        paddingVertical: 8,
                        borderBottomWidth: showing ? 1 : 0, borderBottomColor: t.rule2 }}
                    >
                      <Glyph name={showing ? 'chevron.down' : 'chevron.right'}
                        fallback={showing ? '▾' : '▸'} size={10} colour={t.ink3} />
                      <Text style={{ fontSize: 12, color: t.ink3 }}>
                        {`${finished.length} done`}
                      </Text>
                    </Pressable>
                  ) : null}
                  {showing ? finished.map(row) : null}

                  {/* Drawn at the place itself rather than between two rows.
                      Working the line out from where things sit in the list was
                      a second opinion about the same question, and the two
                      could disagree — it drew under folded-away work that it
                      was never going to land under. There is one answer now,
                      and the line is it. */}
                  {end !== null ? (
                    <View
                      pointerEvents="none"
                      style={{ position: 'absolute', left: 0, right: 0, top: end - 1, height: 2,
                        borderRadius: 1, backgroundColor: t.accent, zIndex: 20 }}
                    />
                  ) : null}
                </View>

                {adding === sc.id ? (
                  <View
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
                    {/* One button, and what it does is whatever there is to do:
                        write something and it files it, leave it empty and it
                        closes. Two buttons made you choose between finishing
                        and finishing. */}
                    <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}>
                      <Mono style={{ flex: 1, fontSize: 10.5 }}>
                        {(drafts[sc.id] ?? '').length >= TASK_LIMIT - 20
                          ? `${TASK_LIMIT - (drafts[sc.id] ?? '').length} left`
                          : 'Return adds it and keeps going'}
                      </Mono>
                      <View style={{ width: box }}>
                        {(drafts[sc.id] ?? '').trim() ? (
                          <Button title="Add" onPress={() => addTask(sc.id)} />
                        ) : (
                          <Button
                            tone="ghost"
                            title="Done"
                            onPress={() => { setAdding(null); Keyboard.dismiss(); }}
                          />
                        )}
                      </View>
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
              onPress={() => {
                const wasOn = complete;
                update((d) => {
                  const c = d.weeks[weekId].complete;
                  if (c[day]) delete c[day]; else c[day] = true;
                }, wasOn ? 'unmarking the day' : 'marking the day complete');
                if (!wasOn) setCheer(true);
              }}
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

      <DayDone
        open={cheer}
        title={parseISO(dateIso).toLocaleDateString('en-GB',
          { weekday: 'long', day: 'numeric', month: 'long' })}
        tasks={{ done: live.filter((x) => x.state === 'done').length, total: live.length }}
        habits={{ done: planned.filter((h) => ticked[h.id]).length, total: planned.length }}
        onClose={() => setCheer(false)}
      />

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

/** Where the task will be when you let go. Drawn where the gap will open,
 *  rather than left to be guessed from how far the row has moved. */
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
  const box = useBoxWidth();
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
          borderRadius: radius.md, paddingHorizontal: 6, paddingVertical: 9, width: box,
          alignItems: 'center', justifyContent: 'center' }}
      >
        <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600',
          color: tr ? line : t.ink3 }}>
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
  task, open, onToggle, onDelete, onOpenMove, onReorder, onPickDate, onRename, onNote,
  choices, onMoveToDate, onMeasure, onDragMove, onDragEnd, dragging,
}: {
  task: Task; open: boolean;
  onToggle: () => void; onDelete: () => void; onOpenMove: () => void;
  onReorder: (dir: -1 | 1) => void; onPickDate: () => void;
  onRename: (text: string) => void;
  onNote: (text: string) => void;
  /** Forward days offered in the strip, computed once by the screen. */
  choices: ReturnType<typeof moveChoices>;
  onMoveToDate: (iso: string) => void;
  onMeasure: (y: number, h: number) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  dragging: boolean;
}) {
  const t = useTheme();
  const done = task.state === 'done';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const [note, setNote] = useState(task.note ?? '');
  const lift = useSharedValue(0);
  /** The last translation the screen was told about, so it is not told again
   *  for every pixel. */
  const told = useSharedValue(0);

  // Hold, then drag. activateAfterLongPress is the whole trick: until the hold
  // completes the gesture never activates, so the list scrolls normally.
  // The hand-rolled PanResponder version of this never fired, because the
  // Pressable underneath took the responder before the pan could ask for it.
  const drag = useMemo(
    () => Gesture.Pan()
      .activateAfterLongPress(220)
      .onStart((e) => {
        told.value = e.translationY;
        runOnJS(onDragMove)(e.translationY);
      })
      .onUpdate((e) => {
        // The row follows the finger on the UI thread, which is what makes it
        // feel attached. Working out where it would land is JavaScript, so it
        // only happens when the finger has actually gone somewhere — every
        // frame of it was what made the drag stutter.
        lift.value = e.translationY;
        if (Math.abs(e.translationY - told.value) < 6) return;
        told.value = e.translationY;
        runOnJS(onDragMove)(e.translationY);
      })
      .onEnd((e) => {
        runOnJS(onDragEnd)(e.translationY);
        lift.value = 0;
      })
      .onFinalize(() => {
        lift.value = 0;
      }),
    [lift, told, onDragMove, onDragEnd],
  );

  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));

  const commit = () => {
    const next = draft.trim().slice(0, TASK_LIMIT);
    if (next && next !== task.text) onRename(next);
    setEditing(false);
  };

  // Saved when you tap away rather than on every letter, so a long note is not
  // a hundred trips through the store — and a hundred things to undo.
  const saveNote = () => {
    const next = note.trim().slice(0, NOTE_LIMIT);
    if (next !== (task.note ?? '')) onNote(next);
  };
  // Closing the panel counts as tapping away, and undoing a note has to be
  // able to stick rather than being written straight back out of this box.
  const save = useRef(saveNote);
  save.current = saveNote;
  useEffect(() => { if (!open) save.current(); }, [open]);
  useEffect(() => { setNote(task.note ?? ''); }, [task.note]);

  return (
    <Animated.View
      onLayout={(e) => onMeasure(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
      style={[
        {
          borderBottomWidth: 1, borderBottomColor: t.rule2, paddingVertical: 8,
          opacity: dragging ? 0.95 : 1,
          zIndex: dragging ? 10 : 0,
          elevation: dragging ? 6 : 0,
          backgroundColor: dragging ? t.sheet2 : 'transparent',
          borderRadius: dragging ? radius.md : 0,
        },
        lifted,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        {/* The grip. Hold it, then drag. */}
        <GestureDetector gesture={drag}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Hold to move ${task.text}`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: dragging ? t.accent : t.ink3, fontSize: 15, lineHeight: 18,
              paddingHorizontal: 3 }}>⠿</Text>
          </View>
        </GestureDetector>
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
            // The name does not tick it off. Ticking something by accident while
            // reading down a list is worth more than a second tap target, so the
            // box is the only thing that does it — this opens the panel instead.
            onPress={onOpenMove}
            onLongPress={() => { setDraft(task.text); setEditing(true); }}
            delayLongPress={300}
            accessibilityRole="button"
            accessibilityLabel={open ? `Close options for ${task.text}` : `Options for ${task.text}`}
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Text style={{ flexShrink: 1, fontSize: 14.5, lineHeight: 19,
              color: done ? t.ink3 : t.ink,
              textDecorationLine: done ? 'line-through' : 'none' }}>{task.text}</Text>
            {/* There is more to this one than its name. */}
            {task.note ? (
              <View
                accessibilityLabel="Has a note"
                style={{ width: 5, height: 5, borderRadius: 3,
                  backgroundColor: done ? t.ink3 : t.accent }}
              />
            ) : null}
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
            {/* One button for everything you can do to a task: move it,
                rename it, get rid of it. */}
            <Pressable onPress={onOpenMove} hitSlop={8} accessibilityRole="button"
              accessibilityLabel={open ? `Close options for ${task.text}` : `Options for ${task.text}`}
              style={{ paddingHorizontal: 2 }}>
              <Glyph name={open ? 'chevron.up' : 'ellipsis'} fallback={open ? '⌃' : '···'}
                size={15} colour={open ? t.accent : t.ink3} />
            </Pressable>
          </>
        )}
      </View>

      {open ? (
        <View style={{ gap: 7, paddingTop: 9 }}>
          <Mono style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}>
            Move to
          </Mono>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {choices.map((c) => (
              <Pressable
                key={c.iso}
                disabled={c.isFrom}
                onPress={() => onMoveToDate(c.iso)}
                accessibilityRole="button"
                accessibilityLabel={`${DAY_NAMES[c.day]} the ${c.date}`}
                style={{ flex: 1, borderWidth: 1, borderRadius: radius.sm + 1,
                  paddingVertical: 6, alignItems: 'center', gap: 1,
                  borderColor: c.isFrom ? t.accent : c.isToday ? t.accentLine : t.rule,
                  backgroundColor: c.isFrom ? t.accentSoft : 'transparent',
                  opacity: c.isFrom ? 0.55 : 1 }}
              >
                <Text style={{ fontSize: 9.5, letterSpacing: 0.4,
                  color: c.isToday ? t.accent : t.ink3 }}>
                  {DAY_LETTERS[c.day]}
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '700',
                  color: c.isFrom ? t.accent : t.ink, fontVariant: ['tabular-nums'] }}>
                  {c.date}
                </Text>
              </Pressable>
            ))}
          </View>
          <Mono style={{ letterSpacing: 1, textTransform: 'uppercase', fontSize: 10,
            paddingTop: 2 }}>
            Notes
          </Mono>
          <Field
            value={note}
            onChangeText={setNote}
            onBlur={saveNote}
            placeholder="Anything that does not fit in the name…"
            multiline
            maxLength={NOTE_LIMIT}
            accessibilityLabel={`Notes for ${task.text}`}
            style={{ minHeight: 88, textAlignVertical: 'top', paddingTop: 10, lineHeight: 19 }}
          />

          <View style={{ flexDirection: 'row', gap: 7 }}>
            {/* Up and Down share the width Rename has below; Pick a date lines
                up with Delete, so the panel reads as two even columns. */}
            <View style={{ flex: 1, flexDirection: 'row', gap: 7 }}>
              <View style={{ flex: 1 }}>
                <Button tone="ghost" title="↑ Up" onPress={() => onReorder(-1)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button tone="ghost" title="↓ Down" onPress={() => onReorder(1)} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Pick a date…" onPress={onPickDate} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            <View style={{ flex: 1 }}>
              <Button
                tone="ghost"
                title="Rename"
                onPress={() => { setDraft(task.text); setEditing(true); }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button tone="ghost" title="Delete" onPress={onDelete} />
            </View>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}
