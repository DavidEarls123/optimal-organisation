import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { WeekHeader } from '../../src/ui/WeekHeader';
import {
  Bar, Body, Button, Chip, Empty, Mono, Note, Screen, Section, SectionHead, Segmented, Tile,
  Wordmark,
} from '../../src/ui/primitives';
import { useStore } from '../../src/store/store';
import { APP_BY, APP_NAME } from '../../src/brand';
import { useTheme } from '../../src/theme/ThemeProvider';
import { bandColour, radius } from '../../src/theme/tokens';
import {
  activeHabits, clockLabel, fromKg, habitDone, habitTarget, planLabel, readings, streak,
  templateOf, timing, trackWeekCount, weekScore,
} from '../../src/domain/scoring';
import { applyUpdate, checkForUpdate, currentVersion, updatesEnabled } from '../../src/services/updates';

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function HubScreen() {
  const [view, setView] = useState<'week' | 'year'>('week');
  return (
    <Screen>
      <WeekHeader compact />
      <Body>
        <Wordmark name={APP_NAME} by={APP_BY} />
        <Segmented
          value={view}
          onChange={setView}
          options={[{ key: 'week', label: 'This week' }, { key: 'year', label: 'This year' }]}
        />
        {view === 'week' ? <ThisWeek /> : <ThisYear />}
      </Body>
    </Screen>
  );
}

function ThisWeek() {
  const t = useTheme();
  const { state, weekId, today } = useStore();
  const week = state.weeks[weekId];
  if (!week) return <Empty>Loading…</Empty>;

  const sc = weekScore(state, week, today);
  const tpl = templateOf(state, week);
  const habits = activeHabits(state, week);
  const daysDone = Object.values(week.complete).filter(Boolean).length;
  const offDays = Object.values(week.untracked).filter(Boolean).length;
  const sessions = state.trackables.reduce((a, tr) => a + trackWeekCount(week, tr.id), 0);
  const untouched = sc.habitsDone === 0 && sc.tasksDone === 0;
  const verdict = untouched ? ['Not started', t.ink2, t.sunk]
    : sc.pace >= 0.85 ? ['On track', t.hit, t.hitSoft]
    : sc.pace >= 0.65 ? ['Slipping', t.partial, t.partialSoft]
    : ['Off track', t.miss, t.missSoft];

  return (
    <>
      <Section>
        <SectionHead title="This week" right={`day ${Math.max(sc.elapsed, 0)} of ${sc.trackedCount}`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Tile value={String(daysDone)} sub="/7" label="Days complete" />
          <Tile value={String(sc.habitsDone)} sub={`/${sc.habitsTarget}`} label="Habits hit" />
          <Tile value={String(sc.tasksDone)} sub={`/${sc.tasksDone + sc.tasksOpen}`} label="Tasks done" />
          <Tile value={String(sessions)} label="Sessions logged" />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
          <View>
            <Mono style={{ letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 10 }}>Pace</Mono>
            <Text style={{ fontSize: 44, fontWeight: '700', color: t.ink, letterSpacing: -1.6,
              fontVariant: ['tabular-nums'] }}>{pct(sc.pace)}</Text>
          </View>
          <View style={{ backgroundColor: verdict[2], borderRadius: radius.pill,
            paddingHorizontal: 9, paddingVertical: 3, marginBottom: 6 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: verdict[1] }}>{verdict[0]}</Text>
          </View>
          <View style={{ marginBottom: 2 }}>
            <Mono style={{ letterSpacing: 1.4, textTransform: 'uppercase', fontSize: 10 }}>Banked</Mono>
            <Text style={{ fontSize: 24, fontWeight: '700', color: t.ink2,
              fontVariant: ['tabular-nums'] }}>{pct(sc.banked)}</Text>
          </View>
        </View>

        <View style={{ backgroundColor: t.sunk, borderRadius: radius.md, padding: 11,
          borderLeftWidth: 2, borderLeftColor: t.accentLine }}>
          <Text style={{ fontSize: 12, lineHeight: 19, color: t.ink3 }}>
            <Text style={{ fontWeight: '700', color: t.ink2 }}>Pace</Text>
            {` = how you are doing against where you should be ${Math.max(sc.elapsed, 0)} day`}
            {sc.elapsed === 1 ? '' : 's'}
            {' in. '}
            <Text style={{ fontWeight: '700', color: t.ink2 }}>Banked</Text>
            {' = the same sum against the whole week.\n'}
            {`score = habits × ${tpl.weights.habits.toFixed(2)} + tasks × ${tpl.weights.tasks.toFixed(2)} (set by ${tpl.name})`}
            {offDays ? `\n${offDays} day${offDays === 1 ? '' : 's'} untracked — targets reduced to match` : ''}
          </Text>
        </View>
      </Section>

      <Section>
        <SectionHead title="Targets vs completed" right="grey line = today’s pace" />
        {habits.map((h) => {
          const n = habitDone(week, h.id);
          const tg = habitTarget(week, h.id);
          const expected = tg * (sc.trackedCount ? sc.elapsed / sc.trackedCount : 0);
          return (
            <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, color: t.ink }}>{h.name}</Text>
                <Mono style={{ fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                  {planLabel(week, h.id)}
                </Mono>
                <Bar
                  value={tg ? n / tg : 0}
                  colour={bandColour(t, n / Math.max(0.001, expected))}
                  marker={sc.trackedCount ? sc.elapsed / sc.trackedCount : 0}
                />
              </View>
              <Mono style={{ width: 42, textAlign: 'right', fontSize: 12, color: t.ink2 }}>
                {`${n}/${tg}`}
              </Mono>
            </View>
          );
        })}
      </Section>

      <Section>
        <SectionHead title="Current streaks" right="tracked days in a row" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {habits.map((h) => {
            const n = streak(week, h.id, today);
            return (
              <View key={h.id} style={{ minWidth: 96, flexGrow: 1, borderWidth: 1,
                borderColor: t.rule, borderRadius: radius.md, padding: 9 }}>
                <Text style={{ fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'],
                  color: n > 0 ? t.hit : t.ink3 }}>{n}</Text>
                <Text style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>{h.short || h.name}</Text>
              </View>
            );
          })}
        </View>
      </Section>

      <Section>
        <SectionHead title="Sessions this week" right="by type" />
        {state.trackables.map((tr) => {
          const n = trackWeekCount(week, tr.id);
          const [line] = t.track[tr.ci % t.track.length];
          return (
            <View key={tr.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 92, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: line }} />
                <Text style={{ fontSize: 13, color: t.ink }} numberOfLines={1}>{tr.name}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Bar value={Math.min(1, n / 5)} colour={line} />
              </View>
              <Mono style={{ width: 24, textAlign: 'right', fontSize: 12, color: t.ink2 }}>{n}</Mono>
            </View>
          );
        })}
        <Note>
          Tag a task with a session type on the Day tab. Ticking it logs the session; untracked days
          are left out of the count.
        </Note>
      </Section>

      <YourData />
    </>
  );
}

function YourData() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  return (
    <Section>
      <SectionHead title="Your data" right="on this phone only" />
      <Button title="Settings" onPress={() => router.push('/settings')} />
      <Button tone="ghost" title="Backup & restore" onPress={() => router.push('/backup')} />
      <Note>
        Everything lives on this phone and is included in your iPhone backup. Export a copy before
        you move to the installed app — Expo Go&apos;s storage does not come with you.
      </Note>
      {updatesEnabled ? (
        <>
          <Button
            tone="ghost"
            title={checking ? 'Checking…' : 'Check for app updates'}
            onPress={async () => {
              setChecking(true);
              const out = await checkForUpdate();
              setChecking(false);
              if (out.status === 'current') { Alert.alert('Up to date', 'You have the latest version.'); return; }
              if (out.status === 'failed') { Alert.alert('Could not check', out.reason); return; }
              if (out.status === 'ready') {
                Alert.alert('Update ready', 'Restart now to use it?', [
                  { text: 'Later', style: 'cancel' },
                  { text: 'Restart', onPress: () => { applyUpdate(); } },
                ]);
              }
            }}
          />
          <Note>{`Version ${currentVersion()}. Updates arrive on their own when you next open the app.`}</Note>
        </>
      ) : (
        <Note>
          Running from the dev server, so there is nothing to update — the code is whatever your
          computer is serving.
        </Note>
      )}
    </Section>
  );
}

/** A weight over time, drawn from views. The y axis spans only the range the
 *  readings actually cover, padded a little, because a scale starting at zero
 *  turns any real change into a flat line. */
function ReadingGraph({ habitId, name }: { habitId: string; name: string }) {
  const t = useTheme();
  const { state } = useStore();
  const unit = state.prefs.weightUnit;
  const pts = readings(Object.values(state.weeks), habitId);

  if (pts.length < 2) {
    return (
      <Section>
        <SectionHead title={name} right={pts.length ? '1 reading' : 'no readings'} />
        <Note>
          {pts.length
            ? `Once there is a second reading this becomes a line. Latest: ${
              (Math.round(fromKg(pts[0][1], unit) * 10) / 10)} ${unit}.`
            : `Tick ${name} on a day to record one.`}
        </Note>
      </Section>
    );
  }

  const vals = pts.map(([, kg]) => fromKg(kg, unit));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = Math.max(0.4, (hi - lo) * 0.18);
  const top = hi + pad;
  const bottom = lo - pad;
  const H = 108;
  const at = (v: number) => H - ((v - bottom) / (top - bottom)) * H;

  const first = vals[0];
  const last = vals[vals.length - 1];
  const change = last - first;
  const round = (v: number) => Math.round(v * 10) / 10;

  return (
    <Section>
      <SectionHead
        title={name}
        right={`${round(last)} ${unit}`}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ justifyContent: 'space-between', height: H, paddingVertical: 1 }}>
          <Mono style={{ fontSize: 9.5 }}>{round(top)}</Mono>
          <Mono style={{ fontSize: 9.5 }}>{round(bottom)}</Mono>
        </View>
        <View style={{ flex: 1, height: H, borderLeftWidth: 1, borderBottomWidth: 1,
          borderColor: t.rule, paddingLeft: 2 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end' }}>
            {vals.map((v, i) => (
              <View key={pts[i][0]} style={{ flex: 1, height: '100%', justifyContent: 'flex-start' }}>
                <View style={{ position: 'absolute', top: at(v) - 3, left: 0, right: 0,
                  alignItems: 'center' }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3,
                    backgroundColor: i === vals.length - 1 ? t.accent : t.accentLine }} />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Mono style={{ fontSize: 10 }}>{pts[0][0].slice(5)}</Mono>
        <Mono style={{ fontSize: 10, color: change === 0 ? t.ink3 : change < 0 ? t.hit : t.partial }}>
          {`${change > 0 ? '+' : ''}${round(change)} ${unit} over ${pts.length} readings`}
        </Mono>
        <Mono style={{ fontSize: 10 }}>{pts[pts.length - 1][0].slice(5)}</Mono>
      </View>
    </Section>
  );
}

/** When each habit actually gets done, and how much that moves. */
function Timings() {
  const t = useTheme();
  const { state } = useStore();
  const weeks = Object.values(state.weeks);
  const rows = state.habits
    .filter((h) => h.active)
    .map((h) => ({ h, t: timing(weeks, h.id) }))
    .filter((r): r is { h: typeof r.h; t: NonNullable<typeof r.t> } => Boolean(r.t))
    .sort((a, b) => a.t.mean - b.t.mean);

  if (!rows.length) return null;

  return (
    <Section>
      <SectionHead title="When you do things" right={`${rows.length} tracked`} />
      <Note>
        Taken from the moment you tick each one, on the day itself. Ticking a past day
        records no time rather than a wrong one.
      </Note>
      <View>
        {rows.map(({ h, t: tm }) => (
          <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10,
            paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: t.rule2 }}>
            <Text style={{ flex: 1, fontSize: 13.5, color: t.ink }}>{h.short || h.name}</Text>
            <Mono style={{ fontSize: 12.5, color: t.ink }}>{clockLabel(tm.mean)}</Mono>
            <Mono style={{ fontSize: 10.5, width: 74, textAlign: 'right' }}>
              {tm.spread < 8 ? 'to the minute' : `±${Math.round(tm.spread)} min`}
            </Mono>
          </View>
        ))}
      </View>
    </Section>
  );
}

function ThisYear() {
  const t = useTheme();
  const { state, today } = useStore();
  const ids = Object.keys(state.weeks).sort();
  const scored = ids.map((id) => ({ id, s: weekScore(state, state.weeks[id], today) }));
  const finished = scored.filter((x) => x.id !== ids[ids.length - 1]);

  if (scored.length < 2) {
    return (
      <Section>
        <SectionHead title="This year" right={`${scored.length} week${scored.length === 1 ? '' : 's'}`} />
        <Empty>
          Not enough history yet. This view fills in as you use the app — come back after a month or so.
        </Empty>
        <Note>
          Nothing here is invented: the year view only ever shows weeks you have actually recorded.
        </Note>
      </Section>
    );
  }

  const values = scored.map((x, i) => (i === scored.length - 1 ? x.s.pace : x.s.banked));
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const best = Math.max(...values);
  const strong = values.filter((v) => v >= 0.8).length;
  const sessions = state.trackables.map((tr) => ({
    tr,
    n: ids.reduce((a, id) => a + trackWeekCount(state.weeks[id], tr.id), 0),
  }));
  const maxSess = Math.max(1, ...sessions.map((x) => x.n));
  const total = sessions.reduce((a, x) => a + x.n, 0);

  return (
    <>
      <Section>
        <SectionHead title="So far" right={`${scored.length} weeks`} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Tile value={pct(avg)} label="Average week" />
          <Tile value={String(strong)} sub={`/${values.length}`} label="Weeks at 80%+" />
          <Tile value={String(total)} label="Sessions logged" />
          <Tile value={pct(best)} label="Best week" />
        </View>
      </Section>

      <Section>
        <SectionHead title="Every week recorded" right="week score" />
        <View style={{ height: 112, flexDirection: 'row', alignItems: 'flex-end', gap: 2,
          borderBottomWidth: 1, borderBottomColor: t.rule }}>
          {values.map((v, i) => (
            <View key={ids[i]} style={{ flex: 1, height: `${Math.max(2, v * 100)}%`,
              borderTopLeftRadius: 3, borderTopRightRadius: 3,
              backgroundColor: bandColour(t, v),
              opacity: i === values.length - 1 ? 1 : 0.75 }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {ids.map((id, i) => (
            <Mono key={id} style={{ flex: 1, textAlign: 'center', fontSize: 9,
              color: i === ids.length - 1 ? t.accent : t.ink3 }}>
              {id.slice(-2)}
            </Mono>
          ))}
        </View>
        <Note>
          {`Average ${pct(avg)}. The final bar is this week's pace so far — it moves every time you tick something.`}
        </Note>
      </Section>

      <Section>
        <SectionHead title="Sessions by type" right="all recorded weeks" />
        {sessions.slice().sort((a, b) => b.n - a.n).map((x) => {
          const [line] = t.track[x.tr.ci % t.track.length];
          return (
            <View key={x.tr.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 92, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: line }} />
                <Text style={{ fontSize: 13, color: t.ink }} numberOfLines={1}>{x.tr.name}</Text>
              </View>
              <View style={{ flex: 1 }}><Bar value={x.n / maxSess} colour={line} /></View>
              <Mono style={{ width: 30, textAlign: 'right', fontSize: 12, color: t.ink2 }}>{x.n}</Mono>
            </View>
          );
        })}
      </Section>

      {state.habits.filter((h) => h.picks === 'weight' && h.active).map((h) => (
        <ReadingGraph key={h.id} habitId={h.id} name={h.name} />
      ))}

      <Timings />
    </>
  );
}
