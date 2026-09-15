import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { WeekHeader } from '../../src/ui/WeekHeader';
import { Body, Empty, Mono, Note, Screen, Section, SectionHead } from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { DAY_LETTERS, DAY_NAMES, addDays, parseISO } from '../../src/domain/dates';
import {
  activeHabits, habitDone, habitTarget, isCurrentWeek, planLabel, scheduledOn, templateOf, todayIndex,
} from '../../src/domain/scoring';

export default function WeekScreen() {
  const t = useTheme();
  const router = useRouter();
  const { state, weekId, today, update } = useStore();
  const week = state.weeks[weekId];
  if (!week) return <Screen><Body><Empty>Loading…</Empty></Body></Screen>;

  const habits = activeHabits(state, week);
  const current = isCurrentWeek(week, today);
  const ti = todayIndex(week, today);
  const tpl = templateOf(week);

  return (
    <Screen>
      <WeekHeader compact />
      <Body>
        <Section>
          <SectionHead
            title="Habit wall chart"
            right={
              <Pressable accessibilityRole="button" onPress={() => router.push('/habits')}>
                <Text style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
                  color: t.accent, fontWeight: '600' }}>Edit this week</Text>
              </Pressable>
            }
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ minWidth: 330 }}>
              <View style={{ flexDirection: 'row', paddingBottom: 7 }}>
                <View style={{ width: 118 }} />
                {DAY_LETTERS.map((l, d) => (
                  <View key={d} style={{ width: 30, alignItems: 'center' }}>
                    <Text style={{ fontSize: 10, letterSpacing: 0.8,
                      color: d === ti && current ? t.accent : t.ink3,
                      fontWeight: d === ti && current ? '700' : '400',
                      textDecorationLine: week.untracked[d] ? 'line-through' : 'none' }}>{l}</Text>
                  </View>
                ))}
                <View style={{ width: 42, alignItems: 'flex-end' }}>
                  <Mono style={{ fontSize: 10 }}>HIT</Mono>
                </View>
              </View>

              {habits.map((h) => {
                const n = habitDone(week, h.id);
                const tg = habitTarget(week, h.id);
                return (
                  <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center',
                    borderTopWidth: 1, borderTopColor: t.rule2, paddingVertical: 3 }}>
                    <View style={{ width: 118, paddingRight: 8 }}>
                      <Text style={{ fontSize: 13, color: t.ink }}>{h.name}</Text>
                      <Mono style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                        {planLabel(week, h.id)}
                      </Mono>
                    </View>
                    {DAY_LETTERS.map((_, d) => {
                      const on = Boolean(week.habits[d]?.[h.id]);
                      const offDay = Boolean(week.untracked[d]);
                      const sched = scheduledOn(week, h.id, d);
                      return (
                        <Pressable
                          key={d}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={`${h.name} ${DAY_NAMES[d]}`}
                          onPress={() => update((s) => {
                            const map = (s.weeks[weekId].habits[d] ??= {});
                            if (map[h.id]) delete map[h.id]; else map[h.id] = true;
                          })}
                          style={{ width: 30, height: 32, alignItems: 'center', justifyContent: 'center' }}
                        >
                          <View style={{
                            width: 15, height: 15, borderRadius: 4, borderWidth: 1.5,
                            borderStyle: offDay ? 'dotted' : sched ? 'solid' : 'dotted',
                            borderColor: on ? t.hit : t.rule,
                            backgroundColor: on ? t.hit : offDay ? t.rule2 : 'transparent',
                            opacity: offDay ? 0.5 : sched ? 1 : 0.55,
                          }} />
                        </Pressable>
                      );
                    })}
                    <View style={{ width: 42, alignItems: 'flex-end' }}>
                      <Mono style={{ fontSize: 11, color: tg && n >= tg ? t.hit : t.ink3,
                        fontWeight: tg && n >= tg ? '700' : '400' }}>{`${n}/${tg}`}</Mono>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <Note>
            {`Solid = planned this week. Dotted = not planned. Struck column = untracked day.`}
            {tpl.note ? `  ${tpl.name}. ${tpl.note}` : ''}
          </Note>
        </Section>

        <Section>
          <SectionHead title="Untracked days" right="holidays, events" />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {DAY_LETTERS.map((l, d) => {
              const on = Boolean(week.untracked[d]);
              return (
                <Pressable
                  key={d}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${DAY_NAMES[d]} untracked`}
                  onPress={() => update((s) => {
                    const w = s.weeks[weekId];
                    if (w.untracked[d]) delete w.untracked[d];
                    else { w.untracked[d] = true; delete w.complete[d]; }
                  })}
                  style={{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8,
                    borderWidth: 1, borderRadius: radius.md,
                    borderStyle: on ? 'dashed' : 'solid',
                    borderColor: t.rule, backgroundColor: on ? t.sunk : 'transparent' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: on ? t.ink3 : t.ink,
                    textDecorationLine: on ? 'line-through' : 'none' }}>{l}</Text>
                  <Mono style={{ fontSize: 10 }}>
                    {addDays(parseISO(week.monday), d).getDate()}
                  </Mono>
                </Pressable>
              );
            })}
          </View>
          <Note>
            A day marked untracked asks nothing of you: its habits and tasks drop out of the week&apos;s
            targets entirely, so a holiday cannot dent your score.
          </Note>
        </Section>

        <Section>
          <SectionHead title="The week ahead" right="tasks by day" />
          <View>
            {DAY_NAMES.map((name, d) => {
              const items = (week.tasks[d] ?? []).filter((x) => x.state !== 'dropped');
              const done = items.filter((x) => x.state === 'done').length;
              const offDay = Boolean(week.untracked[d]);
              return (
                <View key={d} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8,
                  borderBottomWidth: 1, borderBottomColor: t.rule2, opacity: offDay ? 0.5 : 1 }}>
                  <Mono style={{ width: 34, color: t.accent, fontWeight: '600', fontSize: 12 }}>{name}</Mono>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, color: t.ink }}>
                      {items.length ? items.map((x) => x.text).join(' · ') : '—'}
                    </Text>
                    <Mono style={{ fontSize: 11, marginTop: 2 }}>
                      {offDay ? 'untracked' : week.complete[d] ? 'day complete'
                        : `${done} of ${items.length} done`}
                    </Mono>
                  </View>
                </View>
              );
            })}
          </View>
        </Section>
      </Body>
    </Screen>
  );
}
