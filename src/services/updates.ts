import * as Updates from 'expo-updates';

export type UpdateOutcome =
  | { status: 'unsupported' }      // Expo Go, or a build without updates enabled
  | { status: 'current' }
  | { status: 'ready' }            // downloaded; reload to apply
  | { status: 'failed'; reason: string };

/** Updates are off in Expo Go — the bundle there always comes from the dev server. */
export const updatesEnabled = Updates.isEnabled;

export function currentVersion(): string {
  if (!Updates.isEnabled) return 'development';
  const id = Updates.updateId;
  return id ? id.slice(0, 8) : 'built-in';
}

/** Ask now rather than waiting for the next launch. */
export async function checkForUpdate(): Promise<UpdateOutcome> {
  if (!Updates.isEnabled) return { status: 'unsupported' };
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return { status: 'current' };
    await Updates.fetchUpdateAsync();
    return { status: 'ready' };
  } catch (e) {
    return { status: 'failed', reason: e instanceof Error ? e.message : 'Could not check.' };
  }
}

export async function applyUpdate(): Promise<void> {
  if (!Updates.isEnabled) return;
  await Updates.reloadAsync();
}
