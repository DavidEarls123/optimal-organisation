import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Body, Button, Field, Mono, Note, Screen, Section, SectionHead } from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { TEMPLATE_GOALS } from '../src/domain/catalogue';
import { DAY_LETTERS, DAY_NAMES } from '../src/domain/dates';
import {
  clonePlan, countPlan, daysPlan, deleteTemplate, everyPlan, uid,
} from '../src/domain/week';
import type { HabitMode, HabitPlan, WeekTemplate } from '../src/domain/types';

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
            The headings a day is split into on this kind of week. A week takes a copy when
            it is built, so changing them here shapes weeks from now on.
          </Note>
          {(tpl.sections ?? state.sections).map((sc, i) => (
            <View key={sc.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Mono style={{ width: 16 }}>{String(i + 1)}</Mono>
              <Field
                value={sc.name}
                onChangeText={(v) => edit((d) => {
                  d.sections = (d.sections ?? state.sections.map((x) => ({ ...x })));
                  const found = d.sections.find((x) => x.id === sc.id);
                  if (found) found.name = v;
                })}
                maxLength={24}
                accessibilityLabel={`Rename ${sc.name}`}
              />
              {(tpl.sections ?? state.sections).length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${sc.name}`}
                  hitSlop={8}
                  onPress={() => edit((d) => {
                    d.sections = (d.sections ?? state.sections.map((x) => ({ ...x })))
                      .filter((x) => x.id !== sc.id);
                  })}
                >
                  <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
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
