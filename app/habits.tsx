import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Text } from '../src/ui/type';

import { Body, Button, Field, Mono, Note, Screen, SectionHead } from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { DAY_LETTERS, DAY_NAMES } from '../src/domain/dates';
import { countPlan, daysPlan, everyPlan, planFromTemplate, saveWeekAsTemplate, uid } from '../src/domain/week';
import { habitTarget, templateOf } from '../src/domain/scoring';
import { slug } from '../src/domain/catalogue';
import type { HabitMode } from '../src/domain/types';

/** A habit name has to fit a tile two-up on a phone. */
export const HABIT_LIMIT = 32;

function Stepper({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: 34, height: 34, borderWidth: 1, borderColor: t.rule,
        borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: 17, color: t.ink2 }}>{glyph}</Text>
    </Pressable>
  );
}

const MODES: { key: HabitMode; label: string }[] = [
  { key: 'every', label: 'Every day' },
  { key: 'days', label: 'Chosen days' },
  { key: 'count', label: 'N a week' },
];

export default function HabitsScreen() {
  const t = useTheme();
  const { state, weekId, update } = useStore();
  const week = state.weeks[weekId];
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  if (!week) return null;

  const active = state.habits.filter((h) => h.active);
  const tpl = templateOf(state, week);

  return (
    <Screen>
      <Body>
        <Note>
          Set from {tpl.name}. Changes here apply to this week only — every other week keeps its own plan.
        </Note>
        <View style={{ gap: 8 }}>
          <Field
            value={tpl.name}
            onChangeText={(v) => update((d) => {
              const x = d.templates[d.weeks[weekId].templateId];
              if (x) x.name = v;
            })}
            maxLength={40}
            accessibilityLabel="Template name"
            style={{ fontSize: 15, fontWeight: '700', color: t.ink }}
          />
          <Button tone="ghost" title={`Reset this week to the ${tpl.name} standard`}
            onPress={() => update((d) => {
              d.weeks[weekId].habitPlan = planFromTemplate(d, d.weeks[weekId].templateId);
            })} />
          <Button
            title={`Save this week as the ${tpl.name} template`}
            onPress={() => Alert.alert(
              `Update ${tpl.name}?`,
              'This week\u2019s habit plan and its planned tasks become what this template means. '
              + 'Weeks already built from it keep what they have; only new ones follow the change.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Save', onPress: () => update((d) => { saveWeekAsTemplate(d, weekId); }) },
              ],
            )} />
          <Note>
            Set the week up the way you want it below, then save it. That is how a template
            changes \u2014 there is no separate place to edit one.
          </Note>
        </View>

        {active.map((h) => {
          const plan = week.habitPlan[h.id] ?? countPlan(3);
          return (
            <View key={h.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: t.rule2, paddingTop: 11 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.ink }}>{h.name}</Text>
                <Mono>{`${habitTarget(week, h.id)}× this week`}</Mono>
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
                      onPress={() => update((d) => {
                        const p = d.weeks[weekId].habitPlan;
                        const cur = p[h.id] ?? countPlan(3);
                        p[h.id] = m.key === 'every' ? everyPlan()
                          : m.key === 'days' ? daysPlan(cur.days.length ? cur.days : [0, 2, 4])
                          : countPlan(cur.n || 3);
                      })}
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
                        onPress={() => update((s) => {
                          const p = s.weeks[weekId].habitPlan[h.id];
                          p.days = p.days.includes(d) ? p.days.filter((x) => x !== d)
                            : [...p.days, d].sort((a, b) => a - b);
                          p.n = p.days.length;
                        })}
                        style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderWidth: 1,
                          borderRadius: radius.md,
                          borderColor: on ? t.accent : t.rule,
                          backgroundColor: on ? t.accentSoft : 'transparent' }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: on ? t.accent : t.ink3 }}>{l}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : plan.mode === 'count' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                  <Stepper label="Fewer" glyph="−" onPress={() => update((s) => {
                    const p = s.weeks[weekId].habitPlan[h.id];
                    p.n = Math.max(1, p.n - 1);
                  })} />
                  <Text style={{ fontSize: 17, fontWeight: '700', color: t.ink,
                    fontVariant: ['tabular-nums'], minWidth: 20, textAlign: 'center' }}>{plan.n}</Text>
                  <Stepper label="More" glyph="+" onPress={() => update((s) => {
                    const p = s.weeks[weekId].habitPlan[h.id];
                    p.n = Math.min(7, p.n + 1);
                  })} />
                  <Text style={{ fontSize: 13, color: t.ink3 }}>times a week, any day</Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)}
          style={{ paddingTop: 14 }}>
          <Text style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
            color: t.accent, fontWeight: '600' }}>
            {showAll ? '− Hide all habits' : '+ All habits · add, disable, delete'}
          </Text>
        </Pressable>

        {showAll ? (
          <View style={{ gap: 8 }}>
            <Note>
              Disabling keeps the habit and its history. Turn it back on in March and it is the same
              habit, with the same record, not a new one.
            </Note>
            {state.habits.map((h) => (
              <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9,
                paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityState={{ checked: h.active }}
                  onPress={() => update((d) => {
                    const x = d.habits.find((y) => y.id === h.id);
                    if (!x) return;
                    x.active = !x.active;
                    if (x.active && !d.weeks[weekId].habitPlan[x.id]) {
                      d.weeks[weekId].habitPlan[x.id] = x.def
                        ? { ...x.def, days: [...x.def.days] } : countPlan(3);
                    }
                  })}
                  style={{ borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10,
                    paddingVertical: 3, minWidth: 58, alignItems: 'center',
                    borderColor: h.active ? t.hit : t.rule,
                    backgroundColor: h.active ? t.hitSoft : 'transparent' }}
                >
                  <Text style={{ fontSize: 9.5, letterSpacing: 0.9, textTransform: 'uppercase',
                    fontWeight: '700', color: h.active ? t.hit : t.ink3 }}>
                    {h.active ? 'Active' : 'Off'}
                  </Text>
                </Pressable>
                <Text style={{ flex: 1, fontSize: 13.5, color: t.ink }}>{h.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${h.name}`}
                  onPress={() => update((d) => {
                    d.habits = d.habits.filter((y) => y.id !== h.id);
                    for (const w of Object.values(d.weeks)) {
                      delete w.habitPlan[h.id];
                      for (const map of Object.values(w.habits)) delete map[h.id];
                    }
                  })}
                >
                  <Text style={{ color: t.ink3, fontSize: 15 }}>✕</Text>
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 7 }}>
              <Field value={draft} onChangeText={setDraft} placeholder="New habit…"
                maxLength={HABIT_LIMIT} />
              <Button title="Add" onPress={() => {
                const name = draft.trim();
                if (!name) return;
                update((d) => {
                  let id = slug(name) || uid('h');
                  if (d.habits.some((x) => x.id === id)) id = `${id}-${uid('')}`;
                  d.habits.push({ id, name, short: name.length > 13 ? `${name.slice(0, 12)}…` : name, active: true });
                  d.weeks[weekId].habitPlan[id] = countPlan(3);
                });
                setDraft('');
              }} />
            </View>
          </View>
        ) : null}
      </Body>
    </Screen>
  );
}
