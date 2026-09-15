import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Body, Chip, Note, Screen } from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { planFromTemplate, planTasks } from '../src/domain/week';

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
                <Text style={{ fontSize: 15.5, fontWeight: '700', color: t.ink }}>{tpl.name}</Text>
                <Chip text={tpl.tag} colour={on ? t.accent : t.ink3} />
              </View>
              <Text style={{ fontSize: 13, lineHeight: 19, color: t.ink2 }}>{tpl.blurb}</Text>
              <Text style={{ fontSize: 13.5, lineHeight: 19, color: t.ink2, fontStyle: 'italic',
                borderLeftWidth: 2, borderLeftColor: t.accentLine, paddingLeft: 9 }}>
                {tpl.why}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {[
                  `habits ${Math.round(tpl.weights.habits * 100)}%`,
                  `tasks ${Math.round(tpl.weights.tasks * 100)}%`,
                  `recovery ×${tpl.targets.recovery ?? 0}`,
                  `guitar ×${tpl.targets.guitar ?? 0}`,
                  `journal ×${tpl.targets.journal ?? 0}`,
                ].map((s) => (
                  <View key={s} style={{ backgroundColor: t.sunk, borderRadius: 4,
                    paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: t.ink3, fontVariant: ['tabular-nums'] }}>{s}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </Body>
    </Screen>
  );
}
