import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Body, Button, Empty, Mono, Note, Screen, Section, SectionHead } from '../src/ui/primitives';
import { useStore } from '../src/store/store';
import { useTheme } from '../src/theme/ThemeProvider';
import { radius } from '../src/theme/tokens';
import { summarise, type BackupSummary } from '../src/domain/backup';
import { exportBackup, exportRaw, pickBackup } from '../src/services/backup';
import type { AppState } from '../src/domain/types';

function Facts({ summary }: { summary: BackupSummary }) {
  const t = useTheme();
  const rows: [string, string][] = [
    ['Weeks', summary.weeks
      ? `${summary.weeks}  (${summary.firstWeek?.slice(-3)} – ${summary.lastWeek?.slice(-3)})`
      : 'none'],
    ['Habits', String(summary.habits)],
    ['Tasks ticked', String(summary.tasksDone)],
    ['Trips', String(summary.trips)],
    ['Countdowns', String(summary.countdowns)],
    ['Watchlist', String(summary.watchlist)],
  ];
  return (
    <View style={{ borderWidth: 1, borderColor: t.rule, borderRadius: radius.md, padding: 11 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between',
          paddingVertical: 3 }}>
          <Text style={{ fontSize: 13, color: t.ink2 }}>{k}</Text>
          <Mono style={{ fontSize: 12.5, color: t.ink }}>{v}</Mono>
        </View>
      ))}
    </View>
  );
}

export default function BackupScreen() {
  const t = useTheme();
  const { state, replaceAll, undoReplace, canUndo, trouble, startFresh } = useStore();
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState<{ state: AppState; summary: BackupSummary;
    filename: string; exportedAt: string } | null>(null);

  const here = summarise(state);

  const doExport = async () => {
    setBusy(true);
    const res = await exportBackup(state);
    setBusy(false);
    if (!res.ok) Alert.alert('Export failed', res.reason ?? 'Something went wrong.');
  };

  const doPick = async () => {
    setBusy(true);
    const out = await pickBackup();
    setBusy(false);
    if (out.status === 'cancelled') return;
    if (out.status === 'failed') { Alert.alert('Cannot read that file', out.reason); return; }
    setStaged({
      state: out.result.state,
      summary: out.result.summary,
      filename: out.filename,
      exportedAt: out.result.exportedAt,
    });
  };

  const confirmRestore = () => {
    if (!staged) return;
    Alert.alert(
      'Replace everything on this phone?',
      `This phone has ${here.weeks} week${here.weeks === 1 ? '' : 's'} and ${here.tasksDone} ticked `
      + `tasks. The backup has ${staged.summary.weeks} and ${staged.summary.tasksDone}.\n\n`
      + 'What is here now will be kept for one undo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: () => { replaceAll(staged.state); setStaged(null); },
        },
      ],
    );
  };

  const doExportRaw = async () => {
    if (!trouble?.raw) return;
    setBusy(true);
    const res = await exportRaw(trouble.raw);
    setBusy(false);
    if (!res.ok) Alert.alert('Could not save it', res.reason ?? 'Something went wrong.');
  };

  const confirmFresh = () => {
    Alert.alert(
      'Give up on the unreadable data?',
      'This starts an empty app and lets it save again. Whatever is on the phone now '
      + 'is overwritten and cannot be got back. Save it to a file first if you have not.',
      [{ text: 'Cancel', style: 'cancel' },
       { text: 'Start fresh', style: 'destructive', onPress: startFresh }],
    );
  };

  return (
    <Screen>
      <Body>
        {trouble ? (
          <Section>
            <View style={{ borderWidth: 1, borderColor: t.accentLine,
              backgroundColor: t.sunk, borderRadius: radius.md, padding: 12, gap: 9 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.ink }}>
                {trouble.kind === 'unreadable' ? 'Nothing is being saved'
                  : trouble.kind === 'fellback' ? 'Recovered from the safety copy'
                  : 'Saving is failing'}
              </Text>
              <Text style={{ fontSize: 13, lineHeight: 19, color: t.ink2 }}>{trouble.detail}</Text>
              {trouble.kind === 'unreadable' ? (
                <>
                  <Button title="Save the unreadable data to a file" onPress={doExportRaw}
                    disabled={busy || !trouble.raw} />
                  <Button title="Restore from a backup file" onPress={doPick} disabled={busy} />
                  <Button tone="ghost" title="Start fresh instead" onPress={confirmFresh} />
                </>
              ) : null}
            </View>
          </Section>
        ) : null}

        <Section>
          <SectionHead title="On this phone" right="right now" />
          <Facts summary={here} />
          <Button title={busy ? 'Working…' : 'Export a backup'} onPress={doExport} />
          <Note>
            Writes a JSON file and opens the share sheet — AirDrop it to your Mac, mail it to
            yourself, or save it to Files. The app never sends it anywhere on its own.
          </Note>
        </Section>

        <Section>
          <SectionHead title="Restore" right="from a file" />
          {staged ? (
            <>
              <Mono style={{ fontSize: 11, color: t.accent }}>{staged.filename}</Mono>
              {staged.exportedAt ? (
                <Mono style={{ fontSize: 11 }}>
                  {`Exported ${new Date(staged.exportedAt).toLocaleString('en-GB')}`}
                </Mono>
              ) : null}
              <Facts summary={staged.summary} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button tone="ghost" title="Cancel" onPress={() => setStaged(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Replace everything" onPress={confirmRestore} />
                </View>
              </View>
            </>
          ) : (
            <>
              <Button tone="ghost" title={busy ? 'Working…' : 'Choose a backup file'} onPress={doPick} />
              <Empty>Nothing loaded. Pick a file to see what is in it before anything changes.</Empty>
            </>
          )}
        </Section>

        {canUndo ? (
          <Section>
            <SectionHead title="Undo" right="one step" />
            <Button
              tone="ghost"
              title="Put back what was here before the restore"
              onPress={async () => {
                const ok = await undoReplace();
                Alert.alert(ok ? 'Restored' : 'Nothing to undo',
                  ok ? 'Back to how it was before the last restore.' : 'There is no snapshot to go back to.');
              }}
            />
          </Section>
        ) : null}

        <Section>
          <SectionHead title="Worth knowing" />
          <Note>
            Moving from Expo Go to the installed app is the one moment this matters most. They are
            separate apps with separate storage, so the installed one starts empty. Export from Expo
            Go first, then restore into the new app and nothing is lost.
          </Note>
          <Note>
            A backup is a snapshot, not a sync. Two phones editing the same week will not merge —
            the last file you restore wins.
          </Note>
        </Section>
      </Body>
    </Screen>
  );
}
