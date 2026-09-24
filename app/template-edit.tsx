import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Text } from '../src/ui/type';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  Body, Button, Empty, Field, Mono, Note, Screen, Section, SectionHead, Sheet,
} from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { TEMPLATE_GOALS } from '../src/domain/catalogue';
import { DAY_LETTERS, DAY_NAMES } from '../src/domain/dates';
import {
  clonePlan, copyTemplateInto, countPlan, daysPlan, deleteTemplate, everyPlan, planFromList,
  planTaskList, uid,
} from '../src/domain/week';
import type { PlanTask } from '../src/domain/week';
import { useListDrag } from '../src/ui/useListDrag';
import type { HabitMode, HabitPlan, WeekTemplate } from '../src/domain/types';

/** As long as a task's name can be on a day. */
const PLAN_LIMIT = 120;

/** The headings are a flat list, which is a list with one heading of its own. */
const ONE = 'all';

/** A standard task while it is being edited. The key is the editor's own, so a
 *  row can be held and dragged without anything being stored to hold it by —
 *  what a template keeps is what it lays down, not how it was typed. */
type Row = PlanTask & { key: string };
const keyed = (list: PlanTask[]): Row[] => list.map((x) => ({ ...x, key: uid('pt') }));

/** What the template asks of a habit, read out of a draft rather than the store. */
function planIn(draft: WeekTemplate, habit: { id: string; def?: HabitPlan }): HabitPlan {
  const stored = draft.plans?.[habit.id];
  if (stored) return clonePlan(stored);
  const n = draft.targets?.[habit.id];
  if (n !== undefined) return n >= 7 ? everyPlan() : countPlan(n);
  return habit.def ? clonePlan(habit.def) : countPlan(3);
}

const MODES: { key: HabitMode; label: string }[] = [
  { key: 'every', label: 'Every day' },
  { key: 'days', label: 'Chosen days' },
  { key: 'count', label: 'N a week' },
];

export default function TemplateEditScreen() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, update } = useStore();
  const templateId = String(id ?? '');
  const saved = state.templates[templateId];

  // Edits happen on a copy. Nothing reaches the store, a week, or the picker card
  // until Save — so backing out really does back out.
  const [draft, setDraft] = useState<WeekTemplate | null>(
    () => (saved ? JSON.parse(JSON.stringify(saved)) : null));
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState(false);
  const [tasks, setTaskList] = useState<Row[]>(
    () => keyed(saved ? planTaskList(saved.plan ?? []) : []));

  if (!saved || !draft) {
    return <Screen><Body><Note>That template is gone.</Note></Body></Screen>;
  }

  const tpl = draft;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const edit = (fn: (d: WeekTemplate) => void) => setDraft((prev) => {
    const next: WeekTemplate = JSON.parse(JSON.stringify(prev));
    fn(next);
    return next;
  });
  /** The scaffold, held the way you write it rather than the way it is stored.
   *  Kept as its own state so a task can sit there with no days or no name
   *  while you are still typing it, rather than vanishing mid-word. */
  /** The headings this template gives a day, which is what a task's place in
   *  the list refers to, and the order a day lays them out in. */
  const secs = tpl.sections ?? state.sections;

  // A flat list is a list with one heading, so the drag that moves tasks under
  // headings moves headings too, with none of it written twice.
  const secDrag = useListDrag({
    order: secs.map((x) => ({ id: x.id, sec: ONE })),
    sections: [ONE],
    onDrop: (id, at) => edit((d) => {
      const list = d.sections ?? state.sections.map((x) => ({ ...x }));
      const from = list.findIndex((x) => x.id === id);
      if (from < 0) return;
      const rest = list.filter((x) => x.id !== id);
      rest.splice(Math.max(0, Math.min(rest.length, at)), 0, list[from]);
      d.sections = rest;
    }),
  });
  const secLine = secDrag.lineIn(ONE);

  /** Every other template, as something to copy from. */
  const others = Object.values(state.templates).filter((x) => x.id !== templateId);

  const setTasks = (fn: (list: Row[]) => Row[]) => {
    const next = fn(tasks);
    setTaskList(next);
    edit((d) => { d.plan = planFromList(next); });
  };

  // The standard tasks reorder by hand too, on the same drag: what a template
  // lays down first is what a day shows first.
  const liftTask = useSharedValue(0);
  const toldTask = useSharedValue(0);
  const taskDrag = useListDrag({
    order: tasks.map((x) => ({ id: x.key, sec: ONE })),
    sections: [ONE],
    onDrop: (id, at) => setTasks((list) => {
      const from = list.findIndex((x) => x.key === id);
      if (from < 0) return list;
      const rest = list.filter((x) => x.key !== id);
      rest.splice(Math.max(0, Math.min(rest.length, at)), 0, list[from]);
      return rest;
    }),
  });
  const taskLine = taskDrag.lineIn(ONE);
  const liftedTask = useAnimatedStyle(() => ({ transform: [{ translateY: liftTask.value }] }));
  const grips = tasks.map((row) => Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart((e) => {
      toldTask.value = e.translationY;
      runOnJS(taskDrag.onDragMove)(row.key, e.translationY);
    })
    .onUpdate((e) => {
      liftTask.value = e.translationY;
      if (Math.abs(e.translationY - toldTask.value) < 6) return;
      toldTask.value = e.translationY;
      runOnJS(taskDrag.onDragMove)(row.key, e.translationY);
    })
    .onEnd((e) => {
      runOnJS(taskDrag.onDragEnd)(row.key, e.translationY);
      liftTask.value = 0;
    })
    .onFinalize(() => { liftTask.value = 0; }));

  const setPlan = (habitId: string, plan: HabitPlan) => edit((d) => {
    d.plans ??= {};
    d.plans[habitId] = clonePlan(plan);
    delete d.targets[habitId];
  });
  const save = () => {
    update((d) => { d.templates[templateId] = JSON.parse(JSON.stringify(draft)); });
    router.back();
  };
  const leave = () => {
    if (!dirty) { router.back(); return; }
    Alert.alert('Discard changes?', `You have unsaved edits to ${draft.name}.`, [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const inUse = Object.values(state.weeks).filter((w) => w.templateId === templateId).length;
  const active = state.habits.filter((h) => h.active);
  const habitsPct = Math.round(tpl.weights.habits * 100);

  const setWeights = (pct: number) => edit((d) => {
    // A template may be all habits or all tasks — some weeks are only one.
    const clamped = Math.max(0, Math.min(100, pct));
    d.weights = { habits: clamped / 100, tasks: (100 - clamped) / 100 };
  });

  return (
    <Screen>
      <Body>
        <Section>
          <SectionHead title="Name" />
          <Field
            value={tpl.name}
            onChangeText={(v) => edit((d) => { d.name = v; })}
            accessibilityLabel="Template name"
            style={{ fontSize: 16, fontWeight: '700', color: t.ink }}
          />
          <Field
            value={tpl.blurb}
            onChangeText={(v) => edit((d) => { d.blurb = v; })}
            accessibilityLabel="What this week is for"
            placeholder="What this kind of week is for…"
            multiline
            style={{ minHeight: 64 }}
          />
        </Section>

        <Section>
          <SectionHead title="Goal" right={tpl.tag || 'none'} />
          <Note>What this kind of week is for. It shows on the week itself.</Note>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {TEMPLATE_GOALS.map((g) => {
              const on = tpl.tag.trim().toLowerCase() === g.toLowerCase();
              return (
                <Pressable
                  key={g}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => edit((d) => { d.tag = on ? '' : g; })}
                  style={{ borderWidth: 1, borderRadius: radius.pill,
                    paddingHorizontal: 12, paddingVertical: 7,
                    borderColor: on ? t.accent : t.rule,
                    backgroundColor: on ? t.accentSoft : 'transparent' }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '400',
                    color: on ? t.accent : t.ink2 }}>{g}</Text>
                </Pressable>
              );
            })}
          </View>
          <Field
            value={tpl.tag}
            onChangeText={(v) => edit((d) => { d.tag = v; })}
            placeholder="Or your own…"
            maxLength={20}
            accessibilityLabel="Goal"
          />
        </Section>

        <Section>
          <SectionHead
            title="Day sections"
            right={`${(tpl.sections ?? state.sections).length}`}
          />
          <Note>
            The headings a day is split into on this kind of week, in the order a day puts
            them — hold the ⠿ to move one. A week takes a copy when it is built, so changing
            them here shapes weeks from now on.
          </Note>
          <View onLayout={(e) => secDrag.measureList(ONE, e.nativeEvent.layout.y)}>
            {secs.map((sc, i) => (
              <SectionRow
                key={sc.id}
                index={i}
                name={sc.name}
                canRemove={secs.length > 1}
                onRename={(v) => edit((d) => {
                  d.sections = (d.sections ?? state.sections.map((x) => ({ ...x })));
                  const found = d.sections.find((x) => x.id === sc.id);
                  if (found) found.name = v;
                })}
                onRemove={() => edit((d) => {
                  d.sections = (d.sections ?? state.sections.map((x) => ({ ...x })))
                    .filter((x) => x.id !== sc.id);
                })}
                onMeasure={(y, h) => secDrag.measureRow(sc.id, y, h)}
                onDragMove={(dy) => secDrag.onDragMove(sc.id, dy)}
                onDragEnd={(dy) => secDrag.onDragEnd(sc.id, dy)}
                dragging={secDrag.dragId === sc.id}
              />
            ))}
            {secLine !== null ? (
              <View
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, right: 0, top: secLine - 1, height: 2,
                  borderRadius: 1, backgroundColor: t.accent, zIndex: 20 }}
              />
            ) : null}
          </View>
          <Button
            tone="ghost"
            title="+ Add a section"
            onPress={() => edit((d) => {
              d.sections = [...(d.sections ?? state.sections.map((x) => ({ ...x }))),
                { id: uid('s'), name: 'New section' }];
            })}
          />
        </Section>

        <Section>
          <SectionHead title="Standard tasks" right={`${tasks.length}`} />
          <Note>
            What every week of this kind starts with, so a daily job is written down once
            rather than seven times. Pick the days each one belongs to, and the heading it
            sits under. A week takes its own copy when it is built — editing here shapes
            weeks from now on, and never touches one you have already started.
          </Note>

          <View onLayout={(e) => taskDrag.measureList(ONE, e.nativeEvent.layout.y)}>
          {tasks.map((task, i) => (
            <Animated.View
              key={task.key}
              onLayout={(e) => taskDrag.measureRow(task.key,
                e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
              style={[{ gap: 7, borderWidth: 1, borderRadius: radius.md, padding: 10,
                marginBottom: 10,
                borderColor: taskDrag.dragId === task.key ? t.accent : t.rule,
                backgroundColor: taskDrag.dragId === task.key ? t.sheet2 : 'transparent',
                zIndex: taskDrag.dragId === task.key ? 10 : 0 },
                task.key === taskDrag.dragId ? liftedTask : null]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <GestureDetector gesture={grips[i]}>
                  <View
                    accessible
                    accessibilityRole="adjustable"
                    accessibilityLabel={`Hold to move ${task.text || 'this task'}`}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 15, lineHeight: 18,
                      color: taskDrag.dragId === task.key ? t.accent : t.ink3 }}>⠿</Text>
                  </View>
                </GestureDetector>
                <Field
                  value={task.text}
                  onChangeText={(v) => setTasks((list) => list.map((x, j) => (
                    j === i ? { ...x, text: v.slice(0, PLAN_LIMIT) } : x)))}
                  placeholder="What it is…"
                  maxLength={PLAN_LIMIT}
                  accessibilityLabel={`Task ${i + 1}`}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${task.text || 'this task'}`}
                  hitSlop={8}
                  onPress={() => setTasks((list) => list.filter((_, j) => j !== i))}
                >
                  <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>

              {/* Which days it lands on. All seven is a daily task. */}
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {DAY_LETTERS.map((letter, d) => {
                  const on = task.days.includes(d);
                  return (
                    <Pressable
                      key={d}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={DAY_NAMES[d]}
                      onPress={() => setTasks((list) => list.map((x, j) => (j === i ? {
                        ...x,
                        days: on ? x.days.filter((y) => y !== d)
                          : [...x.days, d].sort((a, b) => a - b),
                      } : x)))}
                      style={{ flex: 1, paddingVertical: 7, alignItems: 'center',
                        borderRadius: radius.sm + 1, borderWidth: 1,
                        borderColor: on ? t.accent : t.rule,
                        backgroundColor: on ? t.accentSoft : 'transparent' }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: on ? '800' : '500',
                        color: on ? t.accent : t.ink3 }}>{letter}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                flexWrap: 'wrap' }}>
                <Mono style={{ fontSize: 10 }}>
                  {task.days.length === 7 ? 'Every day'
                    : task.days.length ? `${task.days.length}× a week` : 'No days — not used'}
                </Mono>
                <View style={{ flex: 1 }} />
                {secs.map((sc, si) => (
                  <Pressable
                    key={sc.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: task.si === si }}
                    onPress={() => setTasks((list) => list.map((x, j) => (
                      j === i ? { ...x, si } : x)))}
                    style={{ borderWidth: 1, borderRadius: radius.pill,
                      paddingHorizontal: 9, paddingVertical: 4,
                      borderColor: task.si === si ? t.accentLine : t.rule,
                      backgroundColor: task.si === si ? t.accentSoft : 'transparent' }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: task.si === si ? '700' : '500',
                      color: task.si === si ? t.accent : t.ink3 }}>{sc.name}</Text>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          ))}
          {taskLine !== null ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 0, right: 0, top: taskLine - 1, height: 2,
                borderRadius: 1, backgroundColor: t.accent, zIndex: 20 }}
            />
          ) : null}
          </View>

          <Button
            tone="ghost"
            title="+ Add a standard task"
            onPress={() => setTasks((list) => [...list,
              { key: uid('pt'), text: '', si: 0, days: [0, 1, 2, 3, 4, 5, 6] }])}
          />
        </Section>

        <Section>
          <SectionHead title="Scoring" right={`${habitsPct}/${100 - habitsPct}`} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Weight habits less"
              onPress={() => setWeights(habitsPct - 5)}
              style={{ width: 36, height: 36, borderWidth: 1, borderColor: t.rule,
                borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18, color: t.ink2 }}>−</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: t.ink }}>
                {`Habits ${habitsPct}%  ·  Tasks ${100 - habitsPct}%`}
              </Text>
              <View style={{ height: 7, borderRadius: 4, backgroundColor: t.sunk,
                marginTop: 6, overflow: 'hidden', flexDirection: 'row' }}>
                <View style={{ width: `${habitsPct}%`, backgroundColor: t.accent }} />
                <View style={{ flex: 1, backgroundColor: t.partial }} />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Weight habits more"
              onPress={() => setWeights(habitsPct + 5)}
              style={{ width: 36, height: 36, borderWidth: 1, borderColor: t.rule,
                borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 18, color: t.ink2 }}>+</Text>
            </Pressable>
          </View>
          <Note>
            How much of a week&apos;s score comes from habits versus ticking tasks off. A recovery
            week leans on habits so an easy training week cannot dent the score.
          </Note>
        </Section>

        <Section>
          <SectionHead title="Habits" right="what this week asks" />
          {active.map((h) => {
            const plan = planIn(draft, h);
            return (
              <View key={h.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: t.rule2,
                paddingTop: 11 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between',
                  alignItems: 'baseline', gap: 10 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.ink }}>{h.name}</Text>
                  <Mono>
                    {plan.mode === 'every' ? '7×'
                      : plan.mode === 'days' ? `${plan.days.length}×`
                      : `${plan.n}×`}
                  </Mono>
                </View>

                <View style={{ flexDirection: 'row', gap: 2, backgroundColor: t.sunk,
                  borderRadius: radius.md, padding: 3 }}>
                  {MODES.map((m) => {
                    const on = plan.mode === m.key;
                    return (
                      <Pressable
                        key={m.key}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => setPlan(h.id,
                          m.key === 'every' ? everyPlan()
                          : m.key === 'days' ? daysPlan(plan.days.length ? plan.days : [0, 2, 4])
                          : countPlan(plan.n || 3))}
                        style={{ flex: 1, paddingVertical: 7, borderRadius: radius.sm,
                          backgroundColor: on ? t.sheet : 'transparent', alignItems: 'center' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: on ? t.accent : t.ink2 }}>
                          {m.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {plan.mode === 'days' ? (
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {DAY_LETTERS.map((l, d) => {
                      const on = plan.days.includes(d);
                      return (
                        <Pressable
                          key={d}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={DAY_NAMES[d]}
                          onPress={() => setPlan(h.id, daysPlan(on
                            ? plan.days.filter((x) => x !== d)
                            : [...plan.days, d].sort((a, b) => a - b)))}
                          style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderWidth: 1,
                            borderRadius: radius.md,
                            borderColor: on ? t.accent : t.rule,
                            backgroundColor: on ? t.accentSoft : 'transparent' }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700',
                            color: on ? t.accent : t.ink3 }}>{l}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : plan.mode === 'count' ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Fewer"
                      onPress={() => setPlan(h.id, countPlan(Math.max(1, plan.n - 1)))}
                      style={{ width: 34, height: 34, borderWidth: 1, borderColor: t.rule,
                        borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 17, color: t.ink2 }}>−</Text>
                    </Pressable>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: t.ink,
                      fontVariant: ['tabular-nums'], minWidth: 20, textAlign: 'center' }}>{plan.n}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="More"
                      onPress={() => setPlan(h.id, countPlan(Math.min(7, plan.n + 1)))}
                      style={{ width: 34, height: 34, borderWidth: 1, borderColor: t.rule,
                        borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 17, color: t.ink2 }}>+</Text>
                    </Pressable>
                    <Text style={{ fontSize: 13, color: t.ink3 }}>times a week, any day</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
          <Note>
            Saving does not touch weeks already built from this template. Pick it again on a week
            to apply the new version.
          </Note>
        </Section>

        <View style={{ gap: 8 }}>
          <Button
            tone="big"
            title={dirty ? 'Save template' : 'Saved'}
            onPress={save}
            disabled={!dirty}
          />
          <Button tone="ghost" title={dirty ? 'Discard changes' : 'Close'} onPress={leave} />
        </View>

        <Section>
          <SectionHead title="Start from another" />
          <Note>
            Take another template's shape wholesale: its headings, its standard tasks, what
            it asks of each habit and how it scores them. Only the name stays yours. Nothing
            is saved until you save, so you can look and back out.
          </Note>
          <Button tone="ghost" title="Copy from an existing template"
            onPress={() => setCopying(true)} />
        </Section>

        <Sheet open={copying} title="Copy from" onClose={() => setCopying(false)}>
          <Note>
            Everything but the name is replaced by that template's. What this one currently
            says is gone the moment you save.
          </Note>
          {others.length === 0 ? <Empty>There is nothing else to copy from.</Empty> : null}
          {others.map((other) => (
            <Pressable
              key={other.id}
              accessibilityRole="button"
              accessibilityLabel={`Copy ${other.name}`}
              onPress={() => {
                const next = copyTemplateInto(tpl, other);
                setDraft(next);
                setTaskList(keyed(planTaskList(next.plan ?? [])));
                setCopying(false);
              }}
              style={{ borderWidth: 1, borderColor: t.rule, borderRadius: radius.md,
                paddingHorizontal: 12, paddingVertical: 11, gap: 2 }}
            >
              <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.ink }}>{other.name}</Text>
              <Mono style={{ fontSize: 10.5 }}>
                {`${(other.sections ?? state.sections).length} headings`}
                {` · ${planTaskList(other.plan ?? []).length} standard tasks`}
                {other.tag ? ` · ${other.tag}` : ''}
              </Mono>
            </Pressable>
          ))}
        </Sheet>

        <Section>
          <SectionHead title="Danger" right={inUse ? `used by ${inUse} week${inUse === 1 ? '' : 's'}` : 'unused'} />
          <Button
            tone="ghost"
            title={busy ? 'Deleting…' : 'Delete this template'}
            onPress={() => Alert.alert(
              `Delete ${tpl.name}?`,
              inUse
                ? `${inUse} week${inUse === 1 ? '' : 's'} already use it. They keep their plan and tasks — the template just stops appearing in the picker.`
                : 'It will stop appearing in the picker.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    setBusy(true);
                    let ok = false;
                    update((d) => { ok = deleteTemplate(d, templateId); });
                    setBusy(false);
                    if (ok) router.back();
                    else Alert.alert('Cannot delete', 'You need at least one template.');
                  },
                },
              ],
            )}
          />
        </Section>
      </Body>
    </Screen>
  );
}

/** One heading in a template, held and dragged into the order a day will lay
 *  them out in. */
function SectionRow({
  index, name, canRemove, onRename, onRemove, onMeasure, onDragMove, onDragEnd, dragging,
}: {
  index: number; name: string; canRemove: boolean;
  onRename: (v: string) => void;
  onRemove: () => void;
  onMeasure: (y: number, h: number) => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (dy: number) => void;
  dragging: boolean;
}) {
  const t = useTheme();
  const lift = useSharedValue(0);
  const told = useSharedValue(0);
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
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4,
        zIndex: dragging ? 10 : 0,
        backgroundColor: dragging ? t.sheet2 : 'transparent',
        borderRadius: dragging ? radius.md : 0 }, lifted]}
    >
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Hold to move ${name}`}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <Text style={{ color: dragging ? t.accent : t.ink3, fontSize: 15, lineHeight: 18 }}>⠿</Text>
        </View>
      </GestureDetector>
      <Mono style={{ width: 14 }}>{String(index + 1)}</Mono>
      {/* Typed as it will be drawn: a day shouts its headings, so this does
          too, and what you type is what you get rather than a surprise. */}
      <Field
        value={name}
        onChangeText={onRename}
        onBlur={() => onRename(name.trim())}
        maxLength={24}
        accessibilityLabel={`Rename ${name}`}
        style={{ letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '700',
          fontSize: 12.5 }}
      />
      {canRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          hitSlop={8}
          onPress={onRemove}
        >
          <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}
