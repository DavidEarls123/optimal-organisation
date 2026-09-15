import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import type { AppState } from '../domain/types';
import { backupFilename, parseBackup, serialise, type ParseResult } from '../domain/backup';

/** Where exports are staged before the share sheet takes them. Kept in the cache
 *  directory on purpose: once you have sent the file somewhere, the copy here is junk. */
function stagingDir(): Directory {
  const dir = new Directory(Paths.cache, 'backups');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export interface ExportResult {
  ok: boolean;
  filename?: string;
  reason?: string;
}

/** Writes a backup and hands it to the iOS share sheet — AirDrop, Mail, Files,
 *  whatever you use. The app never sends it anywhere itself. */
export async function exportBackup(state: AppState): Promise<ExportResult> {
  try {
    const filename = backupFilename();
    const file = new File(stagingDir(), filename);
    if (file.exists) file.delete();
    file.create();
    file.write(serialise(state));

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'Sharing is not available on this device.' };
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save your Optimal Week backup',
    });
    return { ok: true, filename };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not write the backup.' };
  }
}

export type ImportOutcome =
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string }
  | { status: 'loaded'; result: Extract<ParseResult, { ok: true }>; filename: string };

/** Picks a file and parses it. Deliberately stops short of applying anything —
 *  the caller shows what is in it and asks first. */
export async function pickBackup(): Promise<ImportOutcome> {
  try {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'public.json', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return { status: 'cancelled' };
    const asset = picked.assets?.[0];
    if (!asset) return { status: 'failed', reason: 'No file was returned.' };

    const text = await new File(asset.uri).text();
    const result = parseBackup(text);
    if (!result.ok) return { status: 'failed', reason: result.reason };
    return { status: 'loaded', result, filename: asset.name ?? 'backup.json' };
  } catch (e) {
    return { status: 'failed', reason: e instanceof Error ? e.message : 'Could not read that file.' };
  }
}
