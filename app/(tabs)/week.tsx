import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../src/ui/type';
import { useRouter } from 'expo-router';

import { WeekHeader } from '../../src/ui/WeekHeader';
import {
  Body, Chip, Empty, Mono, Note, Screen, Section, SectionHead,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { useTheme } from '../../src/theme/ThemeProvider';
import { radius } from '../../src/theme/tokens';
import { DAY_LETTERS, DAY_NAMES, addDays, parseISO, weekNumber } from '../../src/domain/dates';
import {
  activeHabits, habitDone, habitTarget, isCurrentWeek, planLabel, scheduledOn, templateOf, todayIndex,
} from '../../src/domain/scoring';

/** 15 – 21 September, or 28 September – 4 October when it straddles two. */
function rangeLabel(mondayIso: string): string {
  const mon = parseISO(mondayIso);
  const sun = addDays(mon, 6);
  const m = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long' });
  const same = m(mon) === m(sun);
  return `${mon.getDate()}${same ? '' : ` ${m(mon)}`} \u2013 ${sun.getDate()} ${m(sun)}`;
}

export default function WeekScreen() {
  const t = useTheme();
  const [condensed, setCondensed] = useState(false);
  const router = useRouter();
  const { state, weekId, today, update } = useStore();
  const week = state.weeks[weekId];
  if (!week) return <Screen><Body><Empty>Loading…</Empty></Body></Screen>;

  const habits = activeHabits(state, week);
  const current = isCurrentWeek(week, today);
  const ti = todayIndex(week, today);
  const tpl = templateOf(state, week);

  return (
    <Screen>
      <WeekHeader compact />

      {/* Same treatment as the Day: the range stays put and shrinks once the
          page moves under it, with the week number small on the right. */}
      <View style={{ paddingHorizontal: 18, paddingTop: condensed ? 4 : 10,
        paddingBottom: condensed ? 6 : 8, borderBottomWidth: 1,
        borderBottomColor: condensed ? t.rule : 'transparent',
        backgroundColor: t.sheet, flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontWeight: '700', color: t.ink,
            fontSize: condensed ? 15 : 21, letterSpacing: -0.3 }}
        >
          {rangeLabel(week.monday)}
        </Text>
        <Mono style={{ fontSize: condensed ? 10.5 : 11.5 }}>
          {`week ${weekNumber(weekId)}`}
        </Mono>
      </View>

      <Body onScroll={(y) => setCondensed(y > 18)}>
        <Section>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Template: ${tpl.name}. Change it.`}
            onPress={() => router.push('/template')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
              borderWidth: 1, borderColor: t.accentLine, backgroundColor: t.accentSoft,
              borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 13 }}
          >
            {tpl.tag ? <Chip text={tpl.tag} colour={t.accent} soft={t.sheet} /> : null}
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: t.accent }}>
              {tpl.name}
            </Text>
            <Text style={{ fontSize: 13, color: t.accent }}>Change ›</Text>
          </Pressable>
        </Section>

        <Section>
          <SectionHead title="Habit wall chart" right="overview" />
          <View>
            <View style={{ flexDirection: 'row', paddingBottom: 7, alignItems: 'flex-end' }}>
              <View style={{ flex: 1, minWidth: 80 }} />
              {DAY_LETTERS.map((l, d) => (
                <View key={d} style={{ width: 28, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, letterSpacing: 0.8,
                    color: d === ti && current ? t.accent : t.ink3,
                    fontWeight: d === ti && current ? '700' : '400',
                    textDecorationLine: week.untracked[d] ? 'line-through' : 'none' }}>{l}</Text>
                </View>
              ))}
              <View style={{ width: 36, alignItems: 'flex-end' }}>
                <Mono style={{ fontSize: 10 }}>HIT</Mono>
              </View>
            </View>

            {habits.map((h) => {
              const n = habitDone(week, h.id);
              const tg = habitTarget(week, h.id);
              return (
                <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center',
                  borderTopWidth: 1, borderTopColor: t.rule2, paddingVertical: 3 }}>
                  <View style={{ flex: 1, minWidth: 80, paddingRight: 6 }}>
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
                      <View
                        key={d}
                        accessible
                        accessibilityLabel={`${h.name}, ${DAY_NAMES[d]}, ${on ? 'done' : 'not done'}`}
                        style={{ width: 28, height: 32, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <View style={{
                          width: 15, height: 15, borderRadius: 4, borderWidth: 1.5,
                          borderStyle: offDay || !sched ? 'dotted' : 'solid',
                          borderColor: on ? t.hit : t.rule,
                          backgroundColor: on ? t.hit : offDay ? t.rule2 : 'transparent',
                          opacity: offDay ? 0.5 : sched ? 1 : 0.55,
                        }} />
                      </View>
                    );
                  })}
                  <View style={{ width: 36, alignItems: 'flex-end' }}>
                    <Mono style={{ fontSize: 11, color: tg && n >= tg ? t.hit : t.ink3,
                      fontWeight: tg && n >= tg ? '700' : '400' }}>{`${n}/${tg}`}</Mono>
                  </View>
                </View>
              );
            })}
          </View>
          <Note>
            An overview, not somewhere to tick: habits are ticked on their day, where the
            time gets recorded with them. Solid = planned this week. Dotted = not planned.
            Struck column = untracked day.
          </Note>
        </Section>

        <Section>
          <SectionHead title="Training this week" right="tagged sessions" />
          <View>
            {DAY_NAMES.map((name, d) => {
              const sessions = (week.tasks[d] ?? [])
                .filter((x) => x.track);
              const doneCount = sessions.filter((x) => x.state === 'done').length;
              const offDay = Boolean(week.untracked[d]);
              return (
                <View key={d} style={{ flexDirection: 'row', gap: 10, paddingVertical: 9,
                  borderBottomWidth: 1, borderBottomColor: t.rule2, opacity: offDay ? 0.5 : 1,
                  alignItems: 'flex-start' }}>
                  <Mono style={{ width: 34, color: d === ti && current ? t.accent : t.ink3,
                    fontWeight: '700', fontSize: 12, paddingTop: 2 }}>{name}</Mono>
                  <View style={{ flex: 1, gap: 4 }}>
                    {offDay ? (
                      <Mono style={{ fontSize: 12 }}>untracked</Mono>
                    ) : sessions.length === 0 ? (
                      <Mono style={{ fontSize: 12 }}>rest</Mono>
                    ) : sessions.map((x) => {
                      const tr = state.trackables.find((y) => y.id === x.track);
                      const [line, soft] = tr ? t.track[tr.ci % t.track.length] : [t.ink3, 'transparent'];
                      return (
                        <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: line }} />
                          <Text style={{ flex: 1, fontSize: 13.5,
                            color: x.state === 'done' ? t.ink3 : t.ink,
                            textDecorationLine: x.state === 'done' ? 'line-through' : 'none' }}>
                            {x.text}
                          </Text>
                          <View style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: line,
                            backgroundColor: soft, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase',
                              color: line, fontWeight: '700' }}>{tr?.name ?? ''}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  {sessions.length ? (
                    <Mono style={{ fontSize: 11, paddingTop: 2 }}>
                      {`${doneCount}/${sessions.length}`}
                    </Mono>
                  ) : null}
                </View>
              );
            })}
          </View>
          <Note>
            Only tagged sessions appear here. Tag a task with Gym, Run, Recovery and the rest from
            the box beside it on the Day tab; everything else stays on the day it belongs to.
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
      </Body>
    </Screen>
  );
}
