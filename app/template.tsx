import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Button, Chip, Note, Screen } from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { duplicateTemplate, planFromTemplate, planTasks, templateSummary } from '../src/domain/week';

export default function TemplateScreen() {
  const t = useTheme();
  const router = useRouter();
  const { state, weekId, update } = useStore();
  const current = state.weeks[weekId]?.templateId;

  const apply = (id: string) => {
    update((d) => {
      const w = d.weeks[weekId];
      w.templateId = id;
      w.habitPlan = planFromTemplate(d, id);
      for (let day = 0; day < 7; day += 1) {
        const keep = (w.tasks[day] ?? []).filter((x) => !x.plan);
        w.tasks[day] = [...planTasks(d, id, day), ...keep];
      }
    });
    router.back();
  };

  return (
    <Screen>
      <Body>
        <Note>
          Sets the habit plan, the training scaffold, and how the score is weighted. You can amend
          any of it afterwards for this week alone.
        </Note>
        {state.templateOrder.map((id) => {
          const tpl = state.templates[id];
          if (!tpl) return null;
          const on = id === current;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => apply(id)}
              style={{
                borderWidth: 1, borderRadius: radius.lg, padding: 13, gap: 7,
                borderColor: on ? t.accent : t.rule,
                backgroundColor: on ? t.accentSoft : t.sheet,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ fontSize: 15.5, fontWeight: '700', color: t.ink, flex: 1 }}>{tpl.name}</Text>
                <Chip text={tpl.tag} colour={on ? t.accent : t.ink3} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${tpl.name}`}
                  hitSlop={8}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    router.push({ pathname: '/template-edit', params: { id } });
                  }}
                >
                  <Text style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
                    color: t.accent, fontWeight: '700' }}>Edit</Text>
                </Pressable>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 19, color: t.ink2 }}>{tpl.blurb}</Text>
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: t.ink2, fontStyle: 'italic',
                borderLeftWidth: 2, borderLeftColor: t.accentLine, paddingLeft: 9 }}>
                {tpl.why}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {(() => {
                  // Read the same way a week is built, so the card cannot promise
                  // something picking it would not deliver.
                  const sum = templateSummary(state, id);
                  const named = ['recovery', 'guitar', 'journal']
                    .filter((h) => sum.counts[h] !== undefined)
                    .map((h) => `${h} ×${sum.counts[h]}`);
                  return [
                    `habits ${Math.round(tpl.weights.habits * 100)}%`,
                    `tasks ${Math.round(tpl.weights.tasks * 100)}%`,
                    `${sum.weeklyTicks} ticks a week`,
                    `${sum.everyDay} daily`,
                    ...named,
                  ];
                })().map((s) => (
                  <View key={s} style={{ backgroundColor: t.sunk, borderRadius: 4,
                    paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: t.ink3, fontVariant: ['tabular-nums'] }}>{s}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
        <Button
          tone="ghost"
          title="+ New template, copied from this one"
          onPress={() => {
            const from = current ?? state.templateOrder[0];
            let created: string | null = null;
            update((d) => {
              created = duplicateTemplate(d, from, `${d.templates[from]?.name ?? 'Week'} copy`);
            });
            if (created) router.push({ pathname: '/template-edit', params: { id: created } });
          }}
        />
        <Note>
          Tapping a template applies it to this week, replacing its planned tasks and habit plan.
          Edit changes the template itself and leaves every week alone.
        </Note>
      </Body>
    </Screen>
  );
}
