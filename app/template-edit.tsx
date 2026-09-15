import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Body, Button, Field, Mono, Note, Screen, Section, SectionHead } from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { DAY_LETTERS, DAY_NAMES } from '../src/domain/dates';
import {
  countPlan, daysPlan, deleteTemplate, everyPlan, setTemplatePlan, templatePlanFor,
} from '../src/domain/week';
import type { HabitMode } from '../src/domain/types';

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
  const tpl = state.templates[templateId];
  const [busy, setBusy] = useState(false);

  if (!tpl) {
    return <Screen><Body><Note>That template is gone.</Note></Body></Screen>;
  }

  const inUse = Object.values(state.weeks).filter((w) => w.templateId === templateId).length;
  const active = state.habits.filter((h) => h.active);
  const habitsPct = Math.round(tpl.weights.habits * 100);

  const setWeights = (pct: number) => update((d) => {
    const x = d.templates[templateId];
    if (!x) return;
    const clamped = Math.max(40, Math.min(90, pct));
    x.weights = { habits: clamped / 100, tasks: (100 - clamped) / 100 };
  });

  return (
    <Screen>
      <Body>
        <Section>
          <SectionHead title="Name" />
          <Field
            value={tpl.name}
            onChangeText={(v) => update((d) => { const x = d.templates[templateId]; if (x) x.name = v; })}
            accessibilityLabel="Template name"
            style={{ fontSize: 16, fontWeight: '700', color: t.ink }}
          />
          <Field
            value={tpl.blurb}
            onChangeText={(v) => update((d) => { const x = d.templates[templateId]; if (x) x.blurb = v; })}
            accessibilityLabel="What this week is for"
            placeholder="What this kind of week is for…"
            multiline
            style={{ minHeight: 64 }}
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
            const plan = templatePlanFor(state, templateId, h.id);
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
                        onPress={() => update((d) => setTemplatePlan(d, templateId, h.id,
                          m.key === 'every' ? everyPlan()
                          : m.key === 'days' ? daysPlan(plan.days.length ? plan.days : [0, 2, 4])
                          : countPlan(plan.n || 3)))}
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
                          onPress={() => update((s2) => {
                            const days = on ? plan.days.filter((x) => x !== d)
                              : [...plan.days, d].sort((a, b) => a - b);
                            setTemplatePlan(s2, templateId, h.id, daysPlan(days));
                          })}
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
                      onPress={() => update((s2) => setTemplatePlan(s2, templateId, h.id,
                        countPlan(Math.max(1, plan.n - 1))))}
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
                      onPress={() => update((s2) => setTemplatePlan(s2, templateId, h.id,
                        countPlan(Math.min(7, plan.n + 1))))}
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
            Changing this does not touch weeks already built from the template. Pick it again on a
            week to apply the new version.
          </Note>
        </Section>

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
