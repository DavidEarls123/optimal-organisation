import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/** SDK 57 kept every old calendar function name but made them throw. A wrong
 *  name therefore looks exactly like a refused permission, which is how the
 *  calendar stayed broken across several builds without a single error.
 *  The list of throwing names is read out of the installed package, so this
 *  keeps working as the SDK moves. */

const LEGACY = 'node_modules/expo-calendar/build/legacyWarnings.js';
const SERVICE = 'src/services/calendar.ts';

test('the calendar service calls no method that expo-calendar has retired', () => {
  if (!existsSync(LEGACY)) return; // dependencies not installed
  const retired = [...readFileSync(LEGACY, 'utf8')
    .matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
  assert.ok(retired.length > 20, 'expected to find the retired names');
  assert.ok(retired.includes('getCalendarPermissionsAsync'), 'sanity: known retired name');

  const src = readFileSync(SERVICE, 'utf8');
  const used = retired.filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(src));
  assert.deepEqual(used, [], `calendar.ts calls retired expo-calendar methods: ${used.join(', ')}`);
});

test('the methods it does call are really exported by expo-calendar', () => {
  const dts = 'node_modules/expo-calendar/build/Calendar.d.ts';
  if (!existsSync(dts)) return;
  const decl = readFileSync(dts, 'utf8');
  for (const name of ['getCalendarPermissions', 'requestCalendarPermissions', 'getCalendars', 'listEvents']) {
    assert.match(decl, new RegExp(`export declare (?:function|const) ${name}\\b`), `${name} is gone`);
  }
});
