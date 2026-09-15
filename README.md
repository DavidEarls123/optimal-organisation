# Optimal Week

A personal weekly operating system, built as a standalone iPhone app.

The unit is the **week**. At the start of one you pick a template — the shape the week
should take — and that sets your habit targets, a scaffold of training tasks, and how the
week is scored. Everything is then amendable for that week alone.

Built with Expo (React Native) and TypeScript. Offline-first: everything lives on the
device, nothing is sent anywhere.

---

## Running it

You need a computer with **Node 22 or newer** (the EAS CLI needs it), and **Expo Go** on your iPhone.

```bash
git clone https://github.com/DavidEarls123/optimal-organisation
cd optimal-organisation
npm install        # a few minutes, once
npm start
```

A QR code appears in the terminal. Point the iPhone **Camera** at it and tap the banner —
it opens in Expo Go. Leave the terminal running; that is the dev server, and the app
reloads whenever the code changes.

**The phone and the computer must be on the same Wi-Fi**, and Windows must let Node
through the firewall. When Windows asks, allow it on **Private networks**. If the prompt
never appeared, from an Administrator Command Prompt:

```
netsh advfirewall firewall add rule name="Expo Metro 8081" dir=in action=allow protocol=TCP localport=8081
```

To tell a firewall problem from anything else, open the `http://<your-ip>:8081` address
Metro prints in **Safari on the phone**. Something back means the network path is fine;
a timeout means the firewall or the network is in the way.

As a last resort `npx expo start --tunnel` routes around the network entirely — but many
corporate networks block ngrok, which it depends on, so fix the firewall first.

You do not need to log in to Expo to run the app this way — an account is only needed
later, for a standalone build.

**First run:** the app is empty, on the General Week template. Tap the blue template chip
to choose the week's shape. The Day tab asks for calendar permission the first time; say
yes and your Outlook events (and any Runna sessions) appear on the day.

**While it is running:** shake the phone for the dev menu, or press `r` in the terminal to
reload.

```bash
npm test         # domain logic tests
npm run typecheck
```

---

## Getting off the laptop

Expo Go is scaffolding. It needs your computer running Metro and both devices on the same
Wi-Fi, which is no way to track a week. The destination is an **installed app**: its own
icon, its own copy of the code, works on a plane.

### What it costs

An **Apple Developer Program** membership, **$99 a year**. There is no free route to a
permanently installed iOS app. A free Apple ID can sideload, but the profile expires after
seven days and needs a Mac with Xcode to re-sign — not worth it for something you intend
to open every morning.

### One-time setup

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile preview
```

EAS builds on Expo's Macs, so you do not need one. It walks you through Apple sign-in and
certificates. When it finishes you get a link; open it on the iPhone to install.

**Export your data from Expo Go first** (Hub → Your data → Backup & restore) and restore it
into the installed app. Separate apps, separate storage.

### Updates, from a git push

`.github/workflows/publish-update.yml` publishes an update every time `main` changes. It
typechecks and runs the tests first, and only publishes if both pass. The app checks on
launch and applies what it finds; **Hub → Your data → Check for app updates** fetches on
demand.

It publishes to the **`preview`** channel, which is what `eas build --profile preview`
listens on. Channels have to match or the update goes nowhere — if you later build a
TestFlight or App Store version, that listens on `production`, and the workflow default
needs changing to suit.

It needs one secret: an Expo access token from
[expo.dev/settings/access-tokens](https://expo.dev/settings/access-tokens), saved in the
repo under **Settings → Secrets and variables → Actions** as `EXPO_TOKEN`.

**What travels this way and what does not:** JavaScript and assets go over the air, which
is nearly everything — screens, logic, wording, layout. Native changes do not: a new Expo
module, a new permission, anything touching `app.json` plugins.

Those need a rebuild, and that is also a button rather than a terminal:
**Actions → Build app → Run workflow**, in `.github/workflows/build-app.yml`. Only the
very first build has to run locally, because Apple sign-in and certificate creation are
interactive. After that EAS holds the credentials and GitHub can do it.

So the terminal is a one-off. From then on: changes land on `main`, the app updates itself,
and a rebuild is two clicks when it is ever needed.

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
| Week templates | `catalogue.ts` seeds them; they then live in state | Strength Block, Race Week, Deload & Reset, Run Block, General Week — all editable |
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
- **Templates are edited by example.** Set a week up the way you want it, then
  *Week → Edit this week → Save this week as the … template*. The habit plan and the
  planned tasks become what that template means. Weeks already built from it keep what
  they have; only new ones follow the change. A chosen-days plan (Mon/Wed/Fri) cannot be
  expressed as a weekly count, so it is stored on the habit itself rather than flattened.

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
- **One device, one copy** — unless you export. **Hub → Your data → Backup & restore**
  writes a JSON file and hands it to the share sheet: AirDrop, Mail, Files, wherever you
  want it. Restoring reads it back. The app never sends the file anywhere itself.

Restoring shows you what is in the file before it changes anything, and keeps one step of
undo. A backup is a snapshot, not a sync: two phones editing the same week will not merge,
the last file you restore wins.

**Do this before you move from Expo Go to the installed app.** They are separate apps with
separate storage, so the installed one starts empty. Export, install, restore.

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
5. **Sync across devices.** Export and restore is manual, and deliberately so — real sync
   means a server, an account, and merge rules. Only worth it if you want this on an iPad
   or Mac too.
6. **Sample data.** A fresh install starts genuinely empty, on the General Week template.
