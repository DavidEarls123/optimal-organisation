# Optimal Week

A personal weekly operating system, built as a standalone iPhone app.

The unit is the **week**. At the start of one you pick a template — the shape the week
should take — and that sets your habit targets, a scaffold of training tasks, and how the
week is scored. Everything is then amendable for that week alone.

Built with Expo (React Native) and TypeScript. Offline-first: everything lives on the
device, nothing is sent anywhere.

---

## Running it

You need the **Expo Go** app on your iPhone (free, from the App Store) and Node 20+ on
your computer.

```bash
npm install
npm start
```

Scan the QR code with your iPhone camera. The app opens in Expo Go and reloads as the
code changes.

When you want it as a real app icon rather than living inside Expo Go, that's an EAS
build — a separate step, and it needs a free Expo account.

```bash
npm test         # domain logic tests
npm run typecheck
```

---

## How your calendar gets in

The app **reads** your phone's calendar and never writes to it. That one decision removes
a great deal of plumbing:

- **Outlook** — add your account to iOS Calendar and its events appear on the right day.
  No Microsoft login, no OAuth, no Graph API.
- **Runna** — turn on Runna's calendar sync. Runna publishes your plan as a cloud iCalendar
  feed into Apple, Google or Outlook calendars and refreshes it whenever you change the
  plan or rearrange a week, so planned sessions arrive here automatically. Runna has no
  public API; this is the supported route and it is the better one.

`src/services/calendar.ts` also guesses which sessions are trackable (`inferTrack`), so a
Runna interval session shows a **Run** chip and a one-tap *+ Task* that logs the session
when ticked.

**All-day events become countdowns** on the Ahead tab rather than tasks. You already make
that distinction when entering things, so the app reads it instead of asking twice.

---

## The model

`src/domain` holds the whole model and has no React in it, which is why it can be tested
properly. `npm test` covers the rules that are easy to get wrong.

| Concept | Where | Notes |
| --- | --- | --- |
| Week templates | `catalogue.ts` | Strength Block, Race Week, Deload & Reset, Run Block, General Week |
| Habits | `catalogue.ts` | Identity is the id. Disabling keeps history; re-enabling is the *same* habit |
| Habit plans | `week.ts` | Per week: every day / chosen days / N a week |
| Scoring | `scoring.ts` | Pace, banked, targets, streaks, sessions |
| Weeks | `week.ts` | Created on demand — scheduling into a future week brings it into being |
| Dates | `dates.ts` | ISO weeks, Monday-anchored, local time |

Rules worth knowing, all of them covered by tests:

- **Untracked days lower the target, they do not count as misses.** Mark Friday untracked
  and a daily habit becomes 6×, not 6/7.
- **A tick on an unscheduled day still counts.** Meditating on a Tuesday when you planned
  Mon/Wed/Fri counts towards the week; the tile is drawn differently so you can see which
  is which.
- **Discarded tasks are excluded, not failed.** Deciding not to do something is a decision.
- **Pace vs banked.** Pace measures against the days elapsed; banked against the whole week
  and only reaches 100% on Sunday night.
- **The shopping list copies forward once**, the first time you open it in a new week.
  After that the weeks are independent.
- **A film is finished the night you watch it; a series is not.** Series stay selectable,
  count the nights, and are completed by hand from the list.

---

## Layout

```
app/                    expo-router screens
  (tabs)/               Day · Week · Lists · Ahead · Hub
  template.tsx          week template picker (modal)
  habits.tsx            habit plan + catalogue (modal)
  watch.tsx             what did you watch? (modal)
src/
  domain/               model, rules, scoring — no React, fully tested
  store/                state + AsyncStorage persistence
  theme/                light and dark tokens
  ui/                   shared components
  services/calendar.ts  reads the phone's calendar
tests/                  domain tests
```

---

## Where your data lives

On the phone, and nowhere else. No server, no account, no sync. Everything is written to
AsyncStorage under one key, which on iOS is plain JSON files in
`Library/Application Support/<bundle-id>/RCTAsyncLocalStorage_V1/`.

**It is included in your iPhone backup, but only because `app.json` says so.** AsyncStorage
excludes its own directory from iCloud and iTunes backups by default — sensible for a cache,
wrong for a year of training history — so `RCTAsyncStorageExcludeFromBackup: false` overrides
it. Do not remove that line.

Two things that follow from all this:

- **In Expo Go, the data belongs to Expo Go.** Delete that app and it goes. It will also
  *not* carry across when you move to a standalone build — that is a different app with a
  different sandbox, starting empty.
- **One device, one copy.** A restored iPhone backup brings it back. A lost phone with no
  backup does not. There is no export yet; see below.

---

## Not done yet

Honest list, in rough priority order:

1. **Drag-and-drop reordering.** Tasks reorder with ↑ ↓ in the reschedule panel. Proper
   drag needs a gesture library and is worth doing once the app is running on a device.
2. **Notifications.** `expo-notifications` is installed but not wired. Morning and evening
   tablets are the obvious first reminders.
3. **Trips and countdowns take typed dates** (`YYYY-MM-DD`) rather than a date picker.
   Rescheduling a task already uses the native picker; the other two should follow.
4. **The Hub's year view needs history.** It only ever shows weeks actually recorded and
   says so when there are too few. Nothing in it is invented.
5. **Export and restore.** There is no way to get your data out of the app yet. Worth doing
   before it holds anything you would miss — a JSON export you can mail to yourself is an
   afternoon; syncing across devices is a much bigger decision.
6. **Sample data.** A fresh install starts genuinely empty, on the General Week template.
